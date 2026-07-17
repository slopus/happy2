import { resolve } from "node:path";
import { scanServerArchitecture } from "./architecture.js";

const sourceRoot = resolve(import.meta.dirname, "../../sources");
const violations = await scanServerArchitecture(sourceRoot);
if (violations.length === 0) {
    console.log("Server action architecture is valid.");
} else {
    for (const violation of violations)
        console.error(`${violation.file}:${violation.line}: ${violation.message}`);
    process.exitCode = 1;
}
