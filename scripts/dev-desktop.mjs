import { execFileSync, spawn } from "node:child_process";
import { join, resolve } from "node:path";

const workspace = resolve(import.meta.dirname, "..");
const portless = join(workspace, "node_modules", ".bin", "portless");
const serverUrl = execFileSync(portless, ["get", "rigged-api"], {
    cwd: workspace,
    encoding: "utf8",
}).trim();

console.log(`Rigged desktop development: server ${serverUrl}`);

const portlessArguments = ["run", "--name", "rigged-desktop"];
if (process.env.PORT) portlessArguments.push("--app-port", process.env.PORT);
portlessArguments.push("pnpm", "--filter", "@rigged/desktop", "dev");

const child = spawn(portless, portlessArguments, {
    cwd: workspace,
    env: { ...process.env, VITE_RIGGED_SERVER_URL: serverUrl },
    stdio: "inherit",
});

const signals = ["SIGHUP", "SIGINT", "SIGTERM"];
for (const signal of signals) process.on(signal, () => child.kill(signal));

const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
});
process.exitCode = exitCode;
