import { spawn } from "node:child_process";
import { resolve } from "node:path";

function port(value) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
        throw new Error("Portless must provide a valid PORT for the Rigged web app");
    }
    return String(parsed);
}

const workspace = resolve(import.meta.dirname, "..");
const child = spawn(
    "pnpm",
    [
        "--filter",
        "@rigged/web",
        "exec",
        "vite",
        "--host",
        process.env.HOST ?? "127.0.0.1",
        "--port",
        port(process.env.PORT),
        "--strictPort",
    ],
    { cwd: workspace, env: process.env, stdio: "inherit" },
);
const signals = ["SIGHUP", "SIGINT", "SIGTERM"];
for (const signal of signals) process.on(signal, () => child.kill(signal));

const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
});
process.exitCode = exitCode;
