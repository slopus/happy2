import { spawn } from "node:child_process";
import { join, resolve } from "node:path";

const endpoint = "https://happy-api.bulkovo.com";

const appPort = process.env.CONDUCTOR_PORT ?? process.env.PORT;
if (appPort && (!/^\d+$/.test(appPort) || Number(appPort) < 1 || Number(appPort) > 65_535)) {
    throw new Error("CONDUCTOR_PORT or PORT must be a valid web-server port.");
}

const workspace = resolve(import.meta.dirname, "..");
const portless = join(workspace, "node_modules", ".bin", "portless");
const portlessArguments = ["run", "--name", "happy2-web"];
if (appPort) portlessArguments.push("--app-port", appPort);
portlessArguments.push("node", "scripts/dev-web.mjs");
const child = spawn(portless, portlessArguments, {
    cwd: workspace,
    env: {
        ...process.env,
        VITE_HAPPY2_SERVER_URL: endpoint,
        // This standalone workspace preview is intentionally development-token
        // gated. The full `pnpm dev` stack keeps its regular password auth flow.
        VITE_HAPPY2_REQUIRE_DEVELOPMENT_TOKEN: "1",
        // The worktree preview uses a subdomain, so persist its session at the
        // parent preview domain as well.
        HAPPY2_WEB_AUTH_COOKIE_DOMAIN: "happy2-web.localhost",
    },
    stdio: "inherit",
});

for (const signal of ["SIGHUP", "SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));

const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
});
process.exitCode = exitCode;
