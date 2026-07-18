import { spawnSync } from "node:child_process";

if (process.env.CI) {
    console.log("Skipping UI alignment tests in remote CI.");
    process.exit(0);
}

function run(command, args) {
    const result = spawnSync(command, args, { stdio: "inherit" });
    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}

run("pnpm", ["exec", "playwright", "install", "chromium", "firefox", "webkit"]);
run("pnpm", ["exec", "vitest", "run", ...process.argv.slice(2)]);
