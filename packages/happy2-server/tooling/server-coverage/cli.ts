import { writeFile } from "node:fs/promises";
import {
    assertCoverageThresholds,
    coverageInputPath,
    coverageMetrics,
    coverageOutputPath,
    createBaseline,
    listServerSourceFiles,
    loadCoverageBaseline,
    loadCoverageMap,
    mergeCoverageMapsAsUnion,
    printCoverageSummary,
    writeCoverageReports,
} from "./coverage.js";
import { serverCoverageBaselinePath } from "./config.js";

const command = process.argv[2];
if (command !== "check" && command !== "baseline") {
    throw new Error(
        "Usage: tsx packages/happy2-server/tooling/server-coverage/cli.ts <check|baseline>",
    );
}

const sourceUniverse = await listServerSourceFiles();
const unit = await loadCoverageMap(coverageInputPath("unit"), sourceUniverse);
const gym = await loadCoverageMap(coverageInputPath("gym"), sourceUniverse);
const combined = mergeCoverageMapsAsUnion([unit, gym]);
const maps = { unit, gym, combined };
const metrics = {
    unit: coverageMetrics(unit),
    gym: coverageMetrics(gym),
    combined: coverageMetrics(combined),
};

await writeCoverageReports(combined, coverageOutputPath("combined"));
console.log(printCoverageSummary(maps, metrics));

if (command === "baseline") {
    const baseline = createBaseline(sourceUniverse.length, metrics);
    await writeFile(serverCoverageBaselinePath, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
    console.log(`\nWrote baseline: ${serverCoverageBaselinePath}`);
} else {
    const baseline = await loadCoverageBaseline(serverCoverageBaselinePath);
    if (baseline.sourceFiles !== sourceUniverse.length) {
        throw new Error(
            `Server source universe changed from ${baseline.sourceFiles} to ${sourceUniverse.length} files; review and regenerate the coverage baseline`,
        );
    }
    assertCoverageThresholds(metrics, baseline);
    console.log(`\nCoverage meets baseline: ${serverCoverageBaselinePath}`);
}
