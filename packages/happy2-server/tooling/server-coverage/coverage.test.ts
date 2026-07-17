import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import libCoverage from "istanbul-lib-coverage";
import type { CoverageMap, FileCoverageData } from "istanbul-lib-coverage";
import {
    assertCompleteSourceUniverse,
    assertCoverageThresholds,
    canonicalServerSourcePath,
    coverageMetrics,
    createBaseline,
    listServerSourceFiles,
    loadCoverageBaseline,
    loadCoverageMap,
    mergeCoverageMapsAsUnion,
    uncoveredFilesAndLines,
    type CoverageMetrics,
} from "./coverage.js";
import { isServerProductionSource, repositoryRoot, serverSourcesRoot } from "./config.js";

const { createCoverageMap, createFileCoverage } = libCoverage;

const temporaryDirectories: string[] = [];

afterEach(async () => {
    await Promise.all(
        temporaryDirectories
            .splice(0)
            .map((directory) => rm(directory, { recursive: true, force: true })),
    );
});

describe("server coverage tooling", () => {
    test("canonicalizes equivalent server source paths before merging", async () => {
        const canonical = path.join(serverSourcesRoot, "modules/schema.ts");
        const relative = "packages/happy2-server/sources/modules/../modules/schema.ts";
        expect(canonicalServerSourcePath(relative)).toBe(canonical);
        expect(canonicalServerSourcePath(canonical)).toBe(canonical);

        const directory = await makeTemporaryDirectory();
        const firstPath = path.join(directory, "first.json");
        const secondPath = path.join(directory, "second.json");
        await writeCoverageInput(firstPath, relative, 1);
        await writeCoverageInput(secondPath, canonical, 1);

        const first = await loadCoverageMap(firstPath, [canonical]);
        const second = await loadCoverageMap(secondPath, [canonical]);
        expect(mergeCoverageMapsAsUnion([first, second]).files()).toEqual([canonical]);
    });

    test("uses boolean union counts when both suites cover the same line", () => {
        const filename = path.join(serverSourcesRoot, "overlap.ts");
        const first = syntheticMap(filename, 0);
        const second = syntheticMap(filename, 13);
        const combined = mergeCoverageMapsAsUnion([first, second]);

        expect(combined.fileCoverageFor(filename).data.s).toEqual({ 0: 1 });
        expect(coverageMetrics(combined).lines).toEqual({ covered: 1, total: 1 });
        expect(coverageMetrics(combined).statements).toEqual({ covered: 1, total: 1 });
        expect(first.fileCoverageFor(filename).data.s).toEqual({ 0: 0 });
        expect(second.fileCoverageFor(filename).data.s).toEqual({ 0: 13 });
    });

    test("keeps an entirely uncovered production file in metrics and diagnostics", () => {
        const filename = path.join(serverSourcesRoot, "uncovered.ts");
        const map = syntheticMap(filename, 0);

        expect(() => assertCompleteSourceUniverse(map, [filename])).not.toThrow();
        expect(coverageMetrics(map).statements).toEqual({ covered: 0, total: 1 });
        expect(uncoveredFilesAndLines(map)).toEqual(["uncovered.ts: 1"]);
    });

    test("rejects missing, malformed, and incomplete coverage inputs", async () => {
        const filename = path.join(serverSourcesRoot, "required.ts");
        const directory = await makeTemporaryDirectory();
        const missing = path.join(directory, "missing.json");
        const malformed = path.join(directory, "malformed.json");
        const incomplete = path.join(directory, "incomplete.json");
        await writeFile(malformed, "{not-json", "utf8");
        await writeFile(incomplete, "{}", "utf8");

        await expect(loadCoverageMap(missing, [filename])).rejects.toThrow(
            "Coverage input is missing or unreadable",
        );
        await expect(loadCoverageMap(malformed, [filename])).rejects.toThrow(
            "Coverage input is malformed JSON",
        );
        await expect(loadCoverageMap(incomplete, [filename])).rejects.toThrow(
            "is missing 1 production source file",
        );
    });

    test("rejects missing, malformed, and structurally invalid baselines", async () => {
        const directory = await makeTemporaryDirectory();
        const missing = path.join(directory, "missing-baseline.json");
        const malformed = path.join(directory, "malformed-baseline.json");
        const invalid = path.join(directory, "invalid-baseline.json");
        await writeFile(malformed, "{not-json", "utf8");
        await writeFile(invalid, JSON.stringify({ schemaVersion: 1 }), "utf8");

        await expect(loadCoverageBaseline(missing)).rejects.toThrow(
            "Coverage baseline is missing or unreadable",
        );
        await expect(loadCoverageBaseline(malformed)).rejects.toThrow(
            "Coverage baseline is malformed JSON",
        );
        await expect(loadCoverageBaseline(invalid)).rejects.toThrow(
            "Coverage baseline has an invalid schema",
        );
    });

    test("compares exact coverage ratios when displayed percentages are identical", () => {
        const baselineMetrics = allSuiteMetrics(metricSet(33_333, 100_000));
        const baseline = createBaseline(1, baselineMetrics);
        expect(() =>
            assertCoverageThresholds(allSuiteMetrics(metricSet(3_334, 10_000)), baseline),
        ).not.toThrow();
        expect(() =>
            assertCoverageThresholds(allSuiteMetrics(metricSet(3_333, 10_000)), baseline),
        ).toThrow("Server coverage regression");
    });

    test("enumerates only production server TypeScript files", async () => {
        const files = await listServerSourceFiles();

        expect(files).toContain(path.join(serverSourcesRoot, "index.ts"));
        expect(files.every(isServerProductionSource)).toBe(true);
        expect(isServerProductionSource(path.join(serverSourcesRoot, "example.test.ts"))).toBe(
            false,
        );
        expect(
            isServerProductionSource(path.join(serverSourcesRoot, "fixtures", "example.ts")),
        ).toBe(false);
        expect(isServerProductionSource(path.join(repositoryRoot, "outside.ts"))).toBe(false);
    });

    test("rejects an empty source universe and coverage baseline", () => {
        expect(() => assertCompleteSourceUniverse(createCoverageMap({}), [])).toThrow(
            "Server source universe is empty",
        );
        expect(() => createBaseline(0, allSuiteMetrics(metricSet(1, 1)))).toThrow(
            "empty source universe",
        );
    });
});

async function makeTemporaryDirectory(): Promise<string> {
    const directory = await mkdtemp(path.join(tmpdir(), "happy2-server-coverage-"));
    temporaryDirectories.push(directory);
    return directory;
}

async function writeCoverageInput(
    filename: string,
    sourcePath: string,
    hits: number,
): Promise<void> {
    await writeFile(filename, JSON.stringify(syntheticMap(sourcePath, hits).toJSON()), "utf8");
}

function syntheticMap(filename: string, hits: number): CoverageMap {
    const data: FileCoverageData = {
        path: filename,
        statementMap: {
            0: {
                start: { line: 1, column: 0 },
                end: { line: 1, column: 10 },
            },
        },
        fnMap: {},
        branchMap: {},
        s: { 0: hits },
        f: {},
        b: {},
    };
    return createCoverageMap({ [filename]: createFileCoverage(data) });
}

function metricSet(covered: number, total: number): CoverageMetrics {
    return {
        statements: { covered, total },
        branches: { covered, total },
        functions: { covered, total },
        lines: { covered, total },
    };
}

function allSuiteMetrics(metrics: CoverageMetrics) {
    return { unit: metrics, gym: metrics, combined: metrics };
}

test("test fixture resolves repository-relative paths from the real repository root", () => {
    expect(path.resolve(repositoryRoot, "packages/happy2-server/sources")).toBe(serverSourcesRoot);
});
