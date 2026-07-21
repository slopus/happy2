import { spawn } from "node:child_process";
import { resolve } from "node:path";

function port(value) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
        throw new Error("Portless must provide a valid PORT for the Happy (2) Blueprint");
    }
    return String(parsed);
}

const workspace = resolve(import.meta.dirname, "..");
const child = spawn(
    "pnpm",
    [
        "--filter",
        "happy2-ui",
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

for (const signal of ["SIGHUP", "SIGINT", "SIGTERM"]) {
    process.on(signal, () => child.kill(signal));
}

const exitCode = await new Promise((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolveExit(code ?? 1));
});
process.exitCode = exitCode;
