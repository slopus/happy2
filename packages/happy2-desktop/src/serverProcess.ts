import { mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import {
    defaultConfig,
    initializeManagedEnvironment,
    loadConfig,
    startStandaloneHappy2,
    type StandaloneHappy2,
} from "happy2-server";
import type {
    ServerProcessInput,
    ServerProcessOutput,
    ServerProcessStart,
} from "./shared/serverProcessContract";
import { DESKTOP_LOCAL_ACCESS_TOKEN_ENV } from "./shared/serverProcessContract";
import { desktopServerConfigToml } from "./main/desktopServerConfig";

let running: StandaloneHappy2 | undefined;
let starting: Promise<void> | undefined;
let stopping = false;
let rigEndpointRoot: string | undefined;

process.on("message", (message: ServerProcessInput) => {
    if (message.type === "start") {
        if (starting || running) {
            send({ type: "fatal", message: "The Happy desktop server is already running." });
            return;
        }
        starting = start(message.input).finally(() => {
            starting = undefined;
        });
        void starting;
    } else void stop();
});
// The IPC channel is the worker's lifetime lease. If Electron crashes or is
// killed without before-quit cleanup, close the server and release its database.
process.once("disconnect", () => void stop());
for (const signal of ["SIGHUP", "SIGINT", "SIGTERM"] as const)
    process.once(signal, () => void stop());

async function start(input: ServerProcessStart): Promise<void> {
    try {
        if (running) throw new Error("The Happy desktop server is already running.");
        rigEndpointRoot = input.rigEndpointRoot;
        await mkdir(input.runtimeRoot, { mode: 0o700, recursive: true });
        const pluginHostPort = await availablePort();
        const serverPort = 0;
        const publicUrl = "http://127.0.0.1";
        const configSource = desktopServerConfigToml(input, {
            pluginHostPort,
            publicUrl,
            serverPort,
        });
        await mkdir(dirname(input.configPath), { mode: 0o700, recursive: true });
        await writeFile(input.configPath, configSource, { mode: 0o600 });
        const config = await loadConfig(input.configPath, defaultConfig(input.runtimeRoot));
        config.agents.command = await embeddedRigCommandPrepare(
            config.agents.command,
            input.runtimeRoot,
        );
        await initializeManagedEnvironment(input.configPath, config);
        const localAccessToken = config.auth.local.enabled
            ? process.env[DESKTOP_LOCAL_ACCESS_TOKEN_ENV]
            : undefined;
        // Capture the capability before backend startup, then remove it before
        // AgentService can start any managed Rig or plugin/sandbox descendant.
        delete process.env[DESKTOP_LOCAL_ACCESS_TOKEN_ENV];
        running = await startStandaloneHappy2(config, {
            errorLogPath: input.errorLogPath,
            localAccessToken,
            logger: false,
            webRoot: input.webRoot,
        });
        // The bundled renderer is a separate file/Vite origin and must send a
        // CORS preflight for its Authorization header. Speak directly to the
        // private backend, whose CORS plugin owns OPTIONS; keep the web gateway
        // alive for absolute file URLs and the standalone lifecycle.
        send({ type: "ready", url: running.backendUrl });
    } catch (error) {
        delete process.env[DESKTOP_LOCAL_ACCESS_TOKEN_ENV];
        await rigEndpointRootRemove();
        send({ type: "fatal", message: displayError(error) });
        process.exitCode = 1;
    }
}

async function stop(): Promise<void> {
    if (stopping) return;
    stopping = true;
    try {
        await starting?.catch(() => undefined);
        await running?.close();
        await rigEndpointRootRemove();
        send({ type: "stopped" });
    } finally {
        if (process.connected) process.disconnect?.();
    }
}

async function rigEndpointRootRemove(): Promise<void> {
    const path = rigEndpointRoot;
    rigEndpointRoot = undefined;
    if (path) await rm(path, { force: true, recursive: true }).catch(() => undefined);
}

async function availablePort(): Promise<number> {
    const server = createServer();
    return await new Promise<number>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
            const address = server.address();
            const port = typeof address === "object" && address ? address.port : undefined;
            server.close((error) => {
                if (error) reject(error);
                else if (port === undefined) reject(new Error("Could not allocate a local port."));
                else resolve(port);
            });
        });
    });
}

function displayError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

async function embeddedRigCommandPrepare(command: string, runtimeRoot: string): Promise<string> {
    if (!/[/\\]app\.asar[/\\]/u.test(command)) return command;
    const path = join(runtimeRoot, "rig-launcher");
    const source = `#!/bin/sh
ELECTRON_RUN_AS_NODE=1 exec ${shellQuote(process.execPath)} ${shellQuote(command)} "$@"
`;
    await writeFile(path, source, { mode: 0o700 });
    return path;
}

function shellQuote(value: string): string {
    return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function send(message: ServerProcessOutput): void {
    if (process.connected) process.send?.(message);
}
