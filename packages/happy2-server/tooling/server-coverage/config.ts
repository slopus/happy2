import { fileURLToPath } from "node:url";
import path from "node:path";

export type CoverageSuite = "unit" | "gym" | "combined";

export const repositoryRoot = fileURLToPath(new URL("../../../..", import.meta.url));
export const serverSourcesRoot = path.join(repositoryRoot, "packages/happy2-server/sources");
export const serverCoverageRoot = path.join(repositoryRoot, "packages/happy2-server/coverage");
export const serverCoverageBaselinePath = path.join(
    repositoryRoot,
    "packages/happy2-server/coverage-baseline.json",
);

export const serverSourceExcludedSuffixes = [".test.ts", ".spec.ts", ".d.ts"] as const;
export const serverSourceExcludedDirectories = [
    "__tests__",
    "testing",
    "fixtures",
    "__fixtures__",
] as const;
export const serverSourceExcludePatterns = [
    ...serverSourceExcludedSuffixes.map((suffix) => `**/*${suffix}`),
    ...serverSourceExcludedDirectories.map((directory) => `**/${directory}/**`),
];

export function createServerCoverageOptions(suite: Exclude<CoverageSuite, "combined">) {
    const sourceGlob = path.posix.join(toPosix(serverSourcesRoot), "**/*.ts");
    return {
        provider: "v8" as const,
        allowExternal: true,
        include: [sourceGlob],
        exclude: [...serverSourceExcludePatterns],
        reportsDirectory: path.join(serverCoverageRoot, suite),
        reporter: [
            ["text", { file: "coverage.txt" }] as ["text", { file: string }],
            "html" as const,
            "lcov" as const,
            "json" as const,
            "json-summary" as const,
        ],
        clean: true,
        cleanOnRerun: true,
        reportOnFailure: true,
    };
}

export function toPosix(value: string): string {
    return value.split(path.sep).join("/");
}

export function isServerProductionSource(filename: string): boolean {
    const absolute = path.resolve(filename);
    const relative = path.relative(serverSourcesRoot, absolute);
    if (relative.startsWith("..") || path.isAbsolute(relative) || !relative.endsWith(".ts")) {
        return false;
    }
    const segments = toPosix(relative).split("/");
    return (
        !segments.some((segment) =>
            serverSourceExcludedDirectories.includes(
                segment as (typeof serverSourceExcludedDirectories)[number],
            ),
        ) && !serverSourceExcludedSuffixes.some((suffix) => relative.endsWith(suffix))
    );
}
