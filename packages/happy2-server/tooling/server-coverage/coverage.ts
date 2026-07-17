import { readFileSync } from "node:fs";
import { readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import libCoverage from "istanbul-lib-coverage";
import type {
    CoverageMap,
    CoverageMapData,
    CoverageSummary,
    FileCoverage,
    FileCoverageData,
} from "istanbul-lib-coverage";
import libReport from "istanbul-lib-report";
import reports from "istanbul-reports";
import {
    repositoryRoot,
    isServerProductionSource,
    serverCoverageRoot,
    serverSourceExcludedDirectories,
    serverSourcesRoot,
    toPosix,
    type CoverageSuite,
} from "./config.js";

const { createCoverageMap, createFileCoverage } = libCoverage;
const { createContext } = libReport;
const { create: createReport } = reports;

export const coverageMetricNames = ["statements", "branches", "functions", "lines"] as const;
export type CoverageMetricName = (typeof coverageMetricNames)[number];
export type CoverageMetric = { covered: number; total: number };
export type CoverageMetrics = Record<CoverageMetricName, CoverageMetric>;
export type CoverageBaseline = {
    schemaVersion: 1;
    sourceFiles: number;
    thresholds: Record<CoverageSuite, CoverageMetrics>;
};

export async function listServerSourceFiles(root = serverSourcesRoot): Promise<string[]> {
    const files: string[] = [];
    await visit(root);
    files.sort();
    if (files.length === 0) throw new Error(`Server source universe is empty: ${root}`);
    return files;

    async function visit(directory: string): Promise<void> {
        let entries;
        try {
            entries = await readdir(directory, { withFileTypes: true });
        } catch (error) {
            throw new Error(`Cannot enumerate server source universe at ${directory}`, {
                cause: error,
            });
        }
        for (const entry of entries) {
            const absolute = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                if (
                    !serverSourceExcludedDirectories.includes(
                        entry.name as (typeof serverSourceExcludedDirectories)[number],
                    )
                ) {
                    await visit(absolute);
                }
                continue;
            }
            if (!entry.isFile() || !isServerProductionSource(absolute)) continue;
            files.push(path.resolve(absolute));
        }
    }
}

export function canonicalServerSourcePath(input: string, root = repositoryRoot): string {
    const withoutQuery = input.replace(/[?#].*$/, "");
    const absolute = path.resolve(root, withoutQuery);
    const relative = path.relative(serverSourcesRoot, absolute);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new Error(`Coverage contains a non-server source path: ${input}`);
    }
    return path.join(serverSourcesRoot, relative);
}

export async function loadCoverageMap(
    filename: string,
    sourceUniverse: readonly string[],
): Promise<CoverageMap> {
    let raw: string;
    try {
        raw = await readFile(filename, "utf8");
    } catch (error) {
        throw new Error(`Coverage input is missing or unreadable: ${filename}`, { cause: error });
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        throw new Error(`Coverage input is malformed JSON: ${filename}`, { cause: error });
    }
    if (!isRecord(parsed)) throw new Error(`Coverage input must be an object: ${filename}`);

    const map = createCoverageMap({});
    const sourceSet = new Set(sourceUniverse.map((file) => path.resolve(file)));
    for (const [reportedPath, value] of Object.entries(parsed)) {
        if (!isFileCoverageData(value)) {
            throw new Error(`Coverage entry is malformed for ${reportedPath} in ${filename}`);
        }
        let canonical: string;
        try {
            canonical = canonicalServerSourcePath(reportedPath);
        } catch {
            continue;
        }
        if (!sourceSet.has(canonical)) continue;
        const data = structuredClone(value);
        data.path = canonical;
        map.addFileCoverage(createFileCoverage(data));
    }
    assertCompleteSourceUniverse(map, sourceUniverse, filename);
    return map;
}

export async function loadCoverageBaseline(filename: string): Promise<CoverageBaseline> {
    let raw: string;
    try {
        raw = await readFile(filename, "utf8");
    } catch (error) {
        throw new Error(`Coverage baseline is missing or unreadable: ${filename}`, {
            cause: error,
        });
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        throw new Error(`Coverage baseline is malformed JSON: ${filename}`, { cause: error });
    }
    if (!isCoverageBaseline(parsed)) {
        throw new Error(`Coverage baseline has an invalid schema: ${filename}`);
    }
    return parsed;
}

export function assertCompleteSourceUniverse(
    map: CoverageMap,
    sourceUniverse: readonly string[],
    label = "coverage map",
): void {
    if (sourceUniverse.length === 0) throw new Error("Server source universe is empty");
    const present = new Set(map.files().map((file) => path.resolve(file)));
    const missing = sourceUniverse.filter((file) => !present.has(path.resolve(file)));
    if (missing.length > 0) {
        throw new Error(
            `${label} is missing ${missing.length} production source file(s): ${missing
                .map(relativeServerPath)
                .join(", ")}`,
        );
    }
}

export function mergeCoverageMapsAsUnion(maps: readonly CoverageMap[]): CoverageMap {
    if (maps.length === 0) throw new Error("Cannot merge an empty coverage map list");
    const merged = createCoverageMap({});
    for (const map of maps) {
        const snapshot: CoverageMapData = {};
        for (const file of map.files()) {
            snapshot[file] = structuredClone(map.fileCoverageFor(file).data);
        }
        merged.merge(snapshot);
    }
    for (const file of merged.files()) capHitsToBoolean(merged.fileCoverageFor(file));
    return merged;
}

export function coverageMetrics(map: CoverageMap): CoverageMetrics {
    const summary = map.getCoverageSummary();
    return Object.fromEntries(
        coverageMetricNames.map((name) => [name, metricFromSummary(summary, name)]),
    ) as CoverageMetrics;
}

export function assertCoverageThresholds(
    actual: Record<CoverageSuite, CoverageMetrics>,
    baseline: CoverageBaseline,
): void {
    if (baseline.schemaVersion !== 1) {
        throw new Error(`Unsupported coverage baseline schema: ${baseline.schemaVersion}`);
    }
    const failures: string[] = [];
    for (const suite of ["unit", "gym", "combined"] as const) {
        for (const metric of coverageMetricNames) {
            const current = actual[suite][metric];
            const minimum = baseline.thresholds[suite][metric];
            if (current.total === 0 || minimum.total === 0) {
                failures.push(`${suite}.${metric} has an empty denominator`);
                continue;
            }
            if (
                BigInt(current.covered) * BigInt(minimum.total) <
                BigInt(minimum.covered) * BigInt(current.total)
            ) {
                failures.push(
                    `${suite}.${metric} ${formatMetric(current)} is below ${formatMetric(minimum)}`,
                );
            }
        }
    }
    if (failures.length > 0) {
        throw new Error(`Server coverage regression:\n- ${failures.join("\n- ")}`);
    }
}

export async function writeCoverageReports(map: CoverageMap, directory: string): Promise<void> {
    await rm(directory, { recursive: true, force: true });
    const context = createContext({
        dir: directory,
        coverageMap: map,
        sourceFinder: (filename) => readFileSync(filename, "utf8"),
    });
    for (const [name, options] of [
        ["text", { file: "coverage.txt" }],
        ["html", {}],
        ["lcov", {}],
        ["json", {}],
        ["json-summary", {}],
    ] as const) {
        createReport(name, options).execute(context);
    }
}

export function printCoverageSummary(
    maps: Record<CoverageSuite, CoverageMap>,
    metrics: Record<CoverageSuite, CoverageMetrics>,
): string {
    const suites = ["unit", "gym", "combined"] as const;
    const rows = [
        ["suite", ...coverageMetricNames],
        ...suites.map((suite) => [
            suite,
            ...coverageMetricNames.map((metric) => formatMetric(metrics[suite][metric])),
        ]),
    ];
    const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => row[column].length)));
    const lines = rows.map((row) =>
        row.map((cell, index) => cell.padEnd(widths[index])).join("  "),
    );
    for (const suite of suites) {
        lines.push("", `${suite} uncovered files/lines:`);
        const uncovered = uncoveredFilesAndLines(maps[suite]);
        lines.push(...(uncovered.length > 0 ? uncovered.map((entry) => `  ${entry}`) : ["  none"]));
    }
    return lines.join("\n");
}

export function uncoveredFilesAndLines(map: CoverageMap): string[] {
    const entries: string[] = [];
    for (const filename of map.files().sort()) {
        const lineCoverage = map.fileCoverageFor(filename).getLineCoverage();
        const uncovered = Object.entries(lineCoverage)
            .filter(([, hits]) => hits === 0)
            .map(([line]) => Number(line));
        if (uncovered.length > 0) {
            entries.push(`${relativeServerPath(filename)}: ${formatLineRanges(uncovered)}`);
        }
    }
    return entries;
}

export function createBaseline(
    sourceFiles: number,
    metrics: Record<CoverageSuite, CoverageMetrics>,
): CoverageBaseline {
    if (sourceFiles <= 0) throw new Error("Cannot create a baseline for an empty source universe");
    return { schemaVersion: 1, sourceFiles, thresholds: metrics };
}

export function coverageInputPath(suite: Exclude<CoverageSuite, "combined">): string {
    return path.join(serverCoverageRoot, suite, "coverage-final.json");
}

export function coverageOutputPath(suite: CoverageSuite): string {
    return path.join(serverCoverageRoot, suite);
}

export function relativeServerPath(filename: string): string {
    return toPosix(path.relative(serverSourcesRoot, filename));
}

function capHitsToBoolean(file: FileCoverage): void {
    const data = file.data;
    for (const key of Object.keys(data.s)) data.s[key] = data.s[key] > 0 ? 1 : 0;
    for (const key of Object.keys(data.f)) data.f[key] = data.f[key] > 0 ? 1 : 0;
    for (const key of Object.keys(data.b))
        data.b[key] = data.b[key].map((hit) => (hit > 0 ? 1 : 0));
}

function metricFromSummary(summary: CoverageSummary, name: CoverageMetricName): CoverageMetric {
    return { covered: summary[name].covered, total: summary[name].total };
}

function formatMetric(metric: CoverageMetric): string {
    const percentage = metric.total === 0 ? 0 : (metric.covered / metric.total) * 100;
    return `${percentage.toFixed(2)}% (${metric.covered}/${metric.total})`;
}

function formatLineRanges(lines: readonly number[]): string {
    const ranges: string[] = [];
    let start = lines[0];
    let end = start;
    for (const line of lines.slice(1)) {
        if (line === end + 1) {
            end = line;
            continue;
        }
        ranges.push(start === end ? `${start}` : `${start}-${end}`);
        start = line;
        end = line;
    }
    if (start !== undefined) ranges.push(start === end ? `${start}` : `${start}-${end}`);
    return ranges.join(",");
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFileCoverageData(value: unknown): value is FileCoverageData {
    if (!isRecord(value)) return false;
    return (
        typeof value.path === "string" &&
        isRecord(value.statementMap) &&
        isRecord(value.fnMap) &&
        isRecord(value.branchMap) &&
        isRecord(value.s) &&
        isRecord(value.f) &&
        isRecord(value.b)
    );
}

function isCoverageBaseline(value: unknown): value is CoverageBaseline {
    if (!isRecord(value)) return false;
    const thresholds = value.thresholds;
    if (
        value.schemaVersion !== 1 ||
        !Number.isInteger(value.sourceFiles) ||
        (value.sourceFiles as number) <= 0 ||
        !isRecord(thresholds)
    ) {
        return false;
    }
    return (["unit", "gym", "combined"] as const).every((suite) => {
        const metrics = thresholds[suite];
        return (
            isRecord(metrics) &&
            coverageMetricNames.every((name) => {
                const metric = metrics[name];
                return (
                    isRecord(metric) &&
                    Number.isInteger(metric.covered) &&
                    Number.isInteger(metric.total) &&
                    (metric.covered as number) >= 0 &&
                    (metric.total as number) > 0 &&
                    (metric.covered as number) <= (metric.total as number)
                );
            })
        );
    });
}
