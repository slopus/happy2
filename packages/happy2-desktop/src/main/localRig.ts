import { execFile as execFileCallback } from "node:child_process";
import { realpath } from "node:fs/promises";
import { isAbsolute, normalize, resolve } from "node:path";
import { userInfo } from "node:os";
import type { HealthResponse } from "@slopus/rig/types";
import {
    ProtocolHttpClient,
    readTokenIfPresent,
} from "@slopus/rig-client-runtime/dist/client/index.js";
import { getEnvironmentLocalServerPaths } from "@slopus/rig-client-runtime/dist/server/index.js";

const discoveryMarker = "__HAPPY2_RIG_PATH__=";
const discoveryCommand = `printf '${discoveryMarker}%s\\0' "$(command -v rig 2>/dev/null)"; /usr/bin/env -0`;
const maximumOutputBytes = 1024 * 1024;

export interface RigLoginEnvironment {
    readonly command: string;
    readonly environment: NodeJS.ProcessEnv;
    readonly shell: string;
    readonly version: string;
}

export interface LocalRigConnection {
    readonly client: ProtocolHttpClient;
    readonly command: string;
    readonly environment: NodeJS.ProcessEnv;
    readonly version: string;
    close(): void;
}

export interface LocalRigConnector {
    connect(): Promise<LocalRigConnection>;
}

export class RigCommandMissingError extends Error {
    constructor() {
        super("Rig is not installed in the login-shell environment.");
        this.name = "RigCommandMissingError";
    }
}

export class RigDaemonIncompatibleError extends Error {
    constructor(commandVersion: string, daemonVersion: string) {
        super(
            `The running Rig daemon is version ${daemonVersion}, but the installed command is ${commandVersion}. Restart it explicitly before connecting.`,
        );
        this.name = "RigDaemonIncompatibleError";
    }
}

export interface RigProcessResult {
    readonly stdout: string;
    readonly stderr: string;
}

export interface RigProcessHost {
    execFile(
        executable: string,
        arguments_: readonly string[],
        options: { readonly env?: NodeJS.ProcessEnv },
    ): Promise<RigProcessResult>;
}

const defaultProcessHost: RigProcessHost = {
    execFile: (executable, arguments_, options) =>
        new Promise((resolvePromise, reject) => {
            execFileCallback(
                executable,
                [...arguments_],
                {
                    encoding: "utf8",
                    env: options.env,
                    maxBuffer: maximumOutputBytes,
                    timeout: 30_000,
                },
                (error, stdout, stderr) => {
                    if (error) reject(error);
                    else resolvePromise({ stdout, stderr });
                },
            );
        }),
};

/** Resolves Rig and its environment through the user's configured login shell. */
export async function rigLoginEnvironmentDiscover(
    host: RigProcessHost = defaultProcessHost,
    environment: NodeJS.ProcessEnv = process.env,
    configuredShell?: string,
): Promise<RigLoginEnvironment> {
    const shell = loginShellResolve(environment, configuredShell);
    const result = await host.execFile(shell, ["-l", "-c", discoveryCommand], {
        env: minimalShellEnvironment(environment),
    });
    const parsed = discoveryOutputParse(result.stdout);
    if (!parsed.command) throw new RigCommandMissingError();
    const versionResult = await host.execFile(parsed.command, ["--version"], {
        env: parsed.environment,
    });
    return {
        command: parsed.command,
        environment: parsed.environment,
        shell,
        version: rigVersionParse(versionResult.stdout),
    };
}

/** Connects to a compatible normal daemon, starting it through the discovered command if absent. */
export function localRigConnectorCreate(
    options: {
        readonly host?: RigProcessHost;
        readonly environment?: NodeJS.ProcessEnv;
        readonly configuredShell?: string;
        readonly wait?: (milliseconds: number) => Promise<void>;
        readonly clientCreate?: (input: {
            readonly socketPath: string;
            readonly token: string;
        }) => ProtocolHttpClient;
    } = {},
): LocalRigConnector {
    const host = options.host ?? defaultProcessHost;
    const wait = options.wait ?? delay;
    const baseEnvironment = options.environment ?? process.env;
    const clientCreate = options.clientCreate ?? ((input) => new ProtocolHttpClient(input));
    return {
        async connect(): Promise<LocalRigConnection> {
            const login = await rigLoginEnvironmentDiscover(
                host,
                baseEnvironment,
                options.configuredShell,
            );
            const paths = getEnvironmentLocalServerPaths(login.environment);
            let connection = await daemonProbe(paths.socketPath, paths.tokenPath, clientCreate);
            if (!connection) {
                await host.execFile(login.command, ["daemon", "start"], {
                    env: login.environment,
                });
                connection = await daemonWait(
                    paths.socketPath,
                    paths.tokenPath,
                    clientCreate,
                    wait,
                );
            }
            const health = await readyHealthWait(connection.client, wait);
            if (health.identity.version !== login.version)
                throw new RigDaemonIncompatibleError(login.version, health.identity.version);
            return {
                client: connection.client,
                command: login.command,
                environment: login.environment,
                version: login.version,
                // ProtocolHttpClient is request-scoped and owns no persistent
                // socket. Stream and terminal leases are closed by their IPC
                // owners, so closing the connection deliberately does not stop
                // the normal user daemon.
                close: () => undefined,
            };
        },
    };
}

/** Canonicalizes an existing cwd while retaining inaccessible Rig history paths. */
export async function rigWorkingDirectoryCanonicalize(value: string): Promise<string> {
    const absolute = normalize(isAbsolute(value) ? value : resolve(value));
    try {
        return await realpath(absolute);
    } catch {
        return absolute;
    }
}

export function rigVersionParse(value: string): string {
    const match = /^\s*Rig\s+(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\s*$/u.exec(value);
    if (!match?.[1]) throw new Error("The discovered rig command returned an invalid version.");
    return match[1];
}

export function discoveryOutputParse(value: string): {
    readonly command?: string;
    readonly environment: NodeJS.ProcessEnv;
} {
    const markerIndex = value.indexOf(discoveryMarker);
    if (markerIndex < 0)
        throw new Error("The login shell did not return a machine-readable Rig environment.");
    const records = value.slice(markerIndex).split("\0");
    const pathRecord = records.shift() ?? "";
    const command = pathRecord.slice(discoveryMarker.length).trim();
    if (command && (!isAbsolute(command) || command.includes("\n")))
        throw new Error("The login shell returned an invalid Rig executable path.");
    const environment: NodeJS.ProcessEnv = {};
    for (const record of records) {
        const separator = record.indexOf("=");
        if (separator <= 0) continue;
        const key = record.slice(0, separator);
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key)) continue;
        environment[key] = record.slice(separator + 1);
    }
    if (!environment.PATH) throw new Error("The login shell environment did not include PATH.");
    return { ...(command ? { command } : {}), environment };
}

function loginShellResolve(environment: NodeJS.ProcessEnv, configuredShell?: string): string {
    const shell = configuredShell ?? environment.SHELL ?? userInfo().shell;
    if (!shell || !isAbsolute(shell))
        throw new Error("The user's configured login shell is unavailable.");
    return shell;
}

function minimalShellEnvironment(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    return {
        HOME: environment.HOME,
        LOGNAME: environment.LOGNAME,
        PATH: environment.PATH,
        SHELL: environment.SHELL,
        TMPDIR: environment.TMPDIR,
        USER: environment.USER,
    };
}

async function daemonProbe(
    socketPath: string,
    tokenPath: string,
    create: (input: { readonly socketPath: string; readonly token: string }) => ProtocolHttpClient,
): Promise<{ readonly client: ProtocolHttpClient; readonly health: HealthResponse } | undefined> {
    const token = await readTokenIfPresent(tokenPath);
    if (!token) return undefined;
    const client = create({ socketPath, token });
    try {
        return { client, health: await client.health() };
    } catch {
        return undefined;
    }
}

async function daemonWait(
    socketPath: string,
    tokenPath: string,
    create: (input: { readonly socketPath: string; readonly token: string }) => ProtocolHttpClient,
    wait: (milliseconds: number) => Promise<void>,
): Promise<{ readonly client: ProtocolHttpClient; readonly health: HealthResponse }> {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
        const connection = await daemonProbe(socketPath, tokenPath, create);
        if (connection) return connection;
        await wait(50);
    }
    throw new Error("Timed out while waiting for the normal Rig daemon.");
}

async function readyHealthWait(
    client: ProtocolHttpClient,
    wait: (milliseconds: number) => Promise<void>,
): Promise<Extract<HealthResponse, { readonly status: "ready" }>> {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
        const health = await client.health();
        if (health.status === "ready") return health;
        if (health.status === "error")
            throw new Error(`Rig daemon could not start: ${health.error}`);
        await wait(50);
    }
    throw new Error("The normal Rig daemon did not become ready.");
}

function delay(milliseconds: number): Promise<void> {
    return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}
