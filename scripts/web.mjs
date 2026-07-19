import { spawn } from "node:child_process";
import { resolve } from "node:path";

const endpoint = "https://happy.bulkovo.com";

const port = process.env.CONDUCTOR_PORT ?? process.env.PORT ?? "5173";
if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65_535) {
    throw new Error("CONDUCTOR_PORT or PORT must be a valid web-server port.");
}

const workspace = resolve(import.meta.dirname, "..");
const child = spawn(
    "pnpm",
    [
        "--filter",
        "happy2-web",
        "exec",
        "vite",
        "--host",
        "127.0.0.1",
        "--port",
        port,
        "--strictPort",
    ],
    {
        cwd: workspace,
        env: {
            ...process.env,
            VITE_HAPPY2_SERVER_URL: endpoint,
            // This standalone workspace preview is intentionally development-token
            // gated. The full `pnpm dev` stack keeps its regular password auth flow.
            VITE_HAPPY2_REQUIRE_DEVELOPMENT_TOKEN: "1",
        },
        stdio: "inherit",
    },
);

for (const signal of ["SIGHUP", "SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));

const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
});
process.exitCode = exitCode;
