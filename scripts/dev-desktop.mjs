import { spawn } from "node:child_process";
import { join, resolve } from "node:path";

const workspace = resolve(import.meta.dirname, "..");
const portless = join(workspace, "node_modules", ".bin", "portless");
console.log("Happy (2) desktop development: managed local runtime");

const portlessArguments = ["run", "--name", "happy2-desktop"];
if (process.env.PORT) portlessArguments.push("--app-port", process.env.PORT);
portlessArguments.push("pnpm", "--filter", "happy2-desktop", "dev");

const child = spawn(portless, portlessArguments, {
    cwd: workspace,
    env: process.env,
    stdio: "inherit",
});

const signals = ["SIGHUP", "SIGINT", "SIGTERM"];
for (const signal of signals) process.on(signal, () => child.kill(signal));

const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
});
process.exitCode = exitCode;
