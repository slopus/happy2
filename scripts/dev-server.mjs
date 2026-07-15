import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

function port(value) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
        throw new Error("Portless must provide a valid PORT for the Happy (2) server");
    }
    return parsed;
}

function tomlString(value) {
    return JSON.stringify(value);
}

const workspace = resolve(import.meta.dirname, "..");
const runtimeDirectory = join(workspace, ".context", "dev");
const configPath = join(runtimeDirectory, "happy2.toml");
const serverPort = port(process.env.PORT);
const serverUrl = process.env.PORTLESS_URL;
if (!serverUrl) throw new Error("Portless must provide PORTLESS_URL for the Happy (2) server");

await mkdir(runtimeDirectory, { recursive: true });
await writeFile(
    configPath,
    `[server]
role = "all"
host = "127.0.0.1"
port = ${serverPort}
public_url = ${tomlString(serverUrl)}
trusted_proxy_hops = 0

[database]
url = ${tomlString(`file:${join(runtimeDirectory, "happy2.db")}`)}

[agents]
enabled = true
default_cwd = ${tomlString(join(runtimeDirectory, "workspaces"))}

[files]
directory = ${tomlString(join(runtimeDirectory, "files"))}
signed_url_expiry_seconds = 300
max_upload_bytes = 536870912

[jwt]
issuer = ${tomlString(serverUrl)}
audience = "happy2-desktop"
key_id = "local-generated"
expiry_days = 30

[auth.password]
enabled = true
signup_enabled = true
`,
    { mode: 0o600 },
);

const child = spawn(
    "pnpm",
    [
        "--dir",
        "packages/happy2-server",
        "exec",
        "tsx",
        "watch",
        "sources/cli.ts",
        "--config",
        configPath,
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
