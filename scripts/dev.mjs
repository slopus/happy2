import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import concurrently from "concurrently";

const workspace = resolve(import.meta.dirname, "..");
const portless = join(workspace, "node_modules", ".bin", "portless");
const portlessUrl = (name) =>
    execFileSync(portless, ["get", name], {
        cwd: workspace,
        encoding: "utf8",
    }).trim();

const webUrl = portlessUrl("happy2");
const serverUrl = portlessUrl("happy2-api");

console.log(`Happy (2) development: web ${webUrl} · server ${serverUrl}`);

const { result } = concurrently(
    [
        {
            command: "pnpm exec portless run --name happy2-api node scripts/dev-server.mjs",
            name: "server",
            prefixColor: "magenta",
        },
        {
            command: "pnpm exec portless run --name happy2 node scripts/dev-web.mjs",
            name: "web",
            prefixColor: "cyan",
            env: {
                VITE_HAPPY2_REQUIRE_DEVELOPMENT_TOKEN: "0",
                VITE_HAPPY2_SERVER_URL: serverUrl,
            },
        },
    ],
    {
        cwd: workspace,
        killOthersOn: ["failure", "success"],
        prefix: "[{color}{name}{/color}]",
    },
);

try {
    await result;
} catch {
    process.exitCode = 1;
}
