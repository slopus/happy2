import { spawn } from "node:child_process";
import { close, open, writeFileSync } from "node:fs";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { parseArgs } from "node:util";

const daemonDirectoryName = ".happy2";
const daemonPidFileName = "happy2.pid";
const daemonLogFileName = "happy2.log";
const gracefulStopTimeoutMs = 10_000;
const forcedStopTimeoutMs = 2_000;
const processExitPollMs = 50;

export interface DaemonHost {
    cwd: string;
    environment: NodeJS.ProcessEnv;
    executablePath: string;
    executableArguments: readonly string[];
    scriptPath: string;
    directoryCreate(path: string): Promise<void>;
    fileCreate(path: string, contents: string): Promise<boolean>;
    fileExists(path: string): Promise<boolean>;
    fileRead(path: string): Promise<string>;
    fileRemove(path: string): Promise<void>;
    processStart(input: {
        arguments_: readonly string[];
        cwd: string;
        environment: NodeJS.ProcessEnv;
        executablePath: string;
        logPath: string;
        pidPath: string;
    }): Promise<number>;
    processAlive(pid: number): boolean;
    processTreeAlive(pid: number): boolean;
    processTreeSignal(pid: number, signal: NodeJS.Signals): void;
    wait(milliseconds: number): Promise<void>;
    log(message: string): void;
}

export type ParsedDaemonCommand =
    | { action: "help" | "invalid" | "stop" }
    | { action: "start"; configPath?: string };

export function parseDaemonCommand(arguments_: readonly string[]): ParsedDaemonCommand {
    let positionals: string[];
    let values: { config?: string; help?: boolean };
    try {
        const parsed = parseArgs({
            args: [...arguments_],
            allowPositionals: true,
            options: {
                config: { type: "string" },
                help: { type: "boolean", short: "h" },
            },
        });
        positionals = parsed.positionals;
        values = parsed.values;
    } catch {
        return { action: "invalid" };
    }
    const action = positionals[0];
    if (
        (values.help || action === "help") &&
        positionals.length <= 1 &&
        values.config === undefined
    ) {
        return { action: "help" };
    }
    if (action === "start" && positionals.length === 1) {
        return { action: "start", configPath: values.config };
    }
    if (action === "stop" && positionals.length === 1 && values.config === undefined) {
        return { action: "stop" };
    }
    return { action: "invalid" };
}

export async function daemonStart(
    options: { configPath?: string },
    host: DaemonHost = createDaemonHost(),
): Promise<void> {
    const paths = daemonPaths(host.cwd);
    await host.directoryCreate(paths.directory);
    const existing = await pidFileRead(paths.pid, host);
    if (existing.kind === "starting" && host.processAlive(existing.pid)) {
        throw new Error(`Happy (2) daemon is already starting as process ${existing.pid}.`);
    }
    if (existing.kind === "pid" && host.processTreeAlive(existing.pid)) {
        throw new Error(`Happy (2) is already running as daemon process ${existing.pid}.`);
    }
    if (existing.kind !== "missing") {
        await host.fileRemove(paths.pid);
    }

    const configPath = await configPathResolve(options.configPath, host);
    if (!(await host.fileCreate(paths.pid, `starting:${process.pid}\n`))) {
        throw new Error("Happy (2) daemon is already starting.");
    }
    const childArguments = [
        ...host.executableArguments,
        host.scriptPath,
        ...(configPath ? ["--config", configPath] : []),
    ];
    let pid: number | undefined;
    try {
        pid = await host.processStart({
            arguments_: childArguments,
            cwd: host.cwd,
            environment: host.environment,
            executablePath: host.executablePath,
            logPath: paths.log,
            pidPath: paths.pid,
        });
    } catch (error) {
        if (pid !== undefined) signalIfAlive(pid, "SIGKILL", host);
        await host.fileRemove(paths.pid);
        throw error;
    }
    host.log(`Happy (2) daemon started as process ${pid}.`);
    host.log(`PID file: ${paths.pid}`);
    host.log(`Logs: ${paths.log}`);
}

export async function daemonStop(host: DaemonHost = createDaemonHost()): Promise<void> {
    const { pid: pidPath } = daemonPaths(host.cwd);
    const state = await pidFileRead(pidPath, host);
    if (state.kind === "starting" && host.processAlive(state.pid)) {
        throw new Error(`Happy (2) daemon is still starting as process ${state.pid}.`);
    }
    if (state.kind === "missing" || state.kind === "invalid" || state.kind === "starting") {
        if (state.kind !== "missing") await host.fileRemove(pidPath);
        host.log("Happy (2) daemon is not running.");
        return;
    }
    const { pid } = state;
    if (!host.processTreeAlive(pid)) {
        await host.fileRemove(pidPath);
        host.log(`Removed stale Happy (2) daemon PID file for process ${pid}.`);
        return;
    }

    try {
        host.processTreeSignal(pid, "SIGTERM");
        if (!(await processExitWait(pid, gracefulStopTimeoutMs, host))) {
            host.processTreeSignal(pid, "SIGKILL");
            if (!(await processExitWait(pid, forcedStopTimeoutMs, host))) {
                throw new Error(`Happy (2) daemon process ${pid} did not stop.`);
            }
        }
    } catch (error) {
        if (host.processTreeAlive(pid)) throw error;
    }
    await host.fileRemove(pidPath);
    host.log(`Happy (2) daemon process ${pid} was stopped.`);
}

export function daemonUsage(): string {
    return [
        "Usage:",
        "  happy2 daemon start [--config /path/to/happy2.toml]",
        "  happy2 daemon stop",
        "",
        "The daemon runs in the background. Its PID and logs are stored under ./.happy2.",
    ].join("\n");
}

function daemonPaths(cwd: string): { directory: string; log: string; pid: string } {
    const directory = join(cwd, daemonDirectoryName);
    return {
        directory,
        log: join(directory, daemonLogFileName),
        pid: join(directory, daemonPidFileName),
    };
}

async function configPathResolve(
    configPath: string | undefined,
    host: DaemonHost,
): Promise<string | undefined> {
    if (!configPath) return undefined;
    const absolute = isAbsolute(configPath) ? configPath : resolve(host.cwd, configPath);
    if (!(await host.fileExists(absolute))) {
        throw new Error(`Happy (2) config does not exist: ${absolute}`);
    }
    return absolute;
}

type DaemonPidState =
    | { kind: "invalid" }
    | { kind: "missing" }
    | { kind: "starting"; pid: number }
    | { kind: "pid"; pid: number };

async function pidFileRead(path: string, host: DaemonHost): Promise<DaemonPidState> {
    if (!(await host.fileExists(path))) return { kind: "missing" };
    const contents = (await host.fileRead(path)).trim();
    const starting = /^starting:([1-9]\d*)$/.exec(contents);
    if (starting) {
        const pid = Number(starting[1]);
        return Number.isSafeInteger(pid) ? { kind: "starting", pid } : { kind: "invalid" };
    }
    if (!/^[1-9]\d*$/.test(contents)) return { kind: "invalid" };
    const pid = Number(contents);
    return Number.isSafeInteger(pid) ? { kind: "pid", pid } : { kind: "invalid" };
}

async function processExitWait(pid: number, timeoutMs: number, host: DaemonHost): Promise<boolean> {
    const attempts = Math.ceil(timeoutMs / processExitPollMs);
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        if (!host.processTreeAlive(pid)) return true;
        await host.wait(processExitPollMs);
    }
    return !host.processTreeAlive(pid);
}

function signalIfAlive(pid: number, signal: NodeJS.Signals, host: DaemonHost): void {
    if (!host.processTreeAlive(pid)) return;
    try {
        host.processTreeSignal(pid, signal);
    } catch {
        // Preserve the original file-write error from daemonStart.
    }
}

export function createDaemonHost(): DaemonHost {
    return {
        cwd: process.cwd(),
        environment: process.env,
        executablePath: process.execPath,
        executableArguments: process.execArgv,
        scriptPath: resolve(process.argv[1] ?? ""),
        async directoryCreate(path) {
            await mkdir(path, { mode: 0o700, recursive: true });
        },
        async fileCreate(path, contents) {
            try {
                await writeFile(path, contents, { encoding: "utf8", flag: "wx", mode: 0o600 });
                return true;
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
                throw error;
            }
        },
        async fileExists(path) {
            try {
                await access(path);
                return true;
            } catch {
                return false;
            }
        },
        async fileRead(path) {
            return await readFile(path, "utf8");
        },
        async fileRemove(path) {
            await rm(path, { force: true });
        },
        processAlive(pid) {
            try {
                process.kill(pid, 0);
                return true;
            } catch (error) {
                return (error as NodeJS.ErrnoException).code === "EPERM";
            }
        },
        processTreeAlive(pid) {
            try {
                process.kill(-pid, 0);
                return true;
            } catch (error) {
                return (error as NodeJS.ErrnoException).code === "EPERM";
            }
        },
        async processStart(input) {
            const descriptor = await new Promise<number>((resolveDescriptor, reject) => {
                open(input.logPath, "a", 0o600, (error, openedDescriptor) => {
                    if (error) reject(error);
                    else resolveDescriptor(openedDescriptor);
                });
            });
            try {
                const child = spawn(input.executablePath, [...input.arguments_], {
                    cwd: input.cwd,
                    detached: true,
                    env: input.environment,
                    stdio: ["ignore", descriptor, descriptor],
                });
                const spawned = new Promise<void>((resolveSpawn, reject) => {
                    child.once("error", reject);
                    child.once("spawn", resolveSpawn);
                });
                if (child.pid === undefined) {
                    await spawned;
                    throw new Error("Happy (2) daemon did not start.");
                }
                try {
                    writeFileSync(input.pidPath, `${child.pid}\n`, {
                        encoding: "utf8",
                        flag: "w",
                        mode: 0o600,
                    });
                } catch (error) {
                    signalProcessGroupIfAlive(child.pid, "SIGKILL");
                    throw error;
                }
                try {
                    await spawned;
                } catch (error) {
                    signalProcessGroupIfAlive(child.pid, "SIGKILL");
                    throw error;
                }
                child.unref();
                return child.pid;
            } finally {
                close(descriptor, () => {});
            }
        },
        processTreeSignal(pid, signal) {
            process.kill(-pid, signal);
        },
        async wait(milliseconds) {
            await new Promise<void>((resolveWait) => setTimeout(resolveWait, milliseconds));
        },
        log(message) {
            console.log(message);
        },
    };
}

function signalProcessGroupIfAlive(pid: number, signal: NodeJS.Signals): void {
    try {
        process.kill(-pid, signal);
    } catch {
        // The process group may already have exited after a failed spawn.
    }
}
