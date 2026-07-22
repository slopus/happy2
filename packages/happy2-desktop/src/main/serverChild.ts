import { spawn, type ChildProcess } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createWriteStream, type WriteStream } from "node:fs";
import { dirname } from "node:path";
import type {
    ServerProcessInput,
    ServerProcessOutput,
    ServerProcessStart,
} from "../shared/serverProcessContract";
import { DESKTOP_LOCAL_ACCESS_TOKEN_ENV } from "../shared/serverProcessContract";

export interface ServerChildHandle {
    child: ChildProcess;
    close(): Promise<void>;
    url: string;
}

export async function serverChildStart(input: {
    executablePath: string;
    localAccessToken?: string;
    logPath: string;
    start: ServerProcessStart;
    workerPath: string;
    onUnexpectedExit: (error: Error) => void;
}): Promise<ServerChildHandle> {
    await mkdir(dirname(input.logPath), { mode: 0o700, recursive: true });
    const log = createWriteStream(input.logPath, { flags: "a", mode: 0o600 });
    const child = spawn(input.executablePath, [input.workerPath], {
        env: serverChildEnvironment(input.localAccessToken),
        stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    child.stdout?.pipe(log, { end: false });
    child.stderr?.pipe(log, { end: false });
    let closing = false;
    let ready = false;
    child.once("exit", (code, signal) => {
        closeLog(log);
        if (ready && !closing)
            input.onUnexpectedExit(
                new Error(
                    `The local Happy server stopped unexpectedly (${signal ?? `exit ${code ?? 1}`}).`,
                ),
            );
    });
    const url = await waitForReady(child, input.start, log);
    ready = true;
    if (child.exitCode !== null || child.signalCode !== null)
        throw new Error("The local Happy server exited immediately after startup.");
    return {
        child,
        url,
        async close() {
            if (closing) return;
            closing = true;
            await childStop(child);
            closeLog(log);
        },
    };
}

export function serverChildEnvironment(localAccessToken?: string): NodeJS.ProcessEnv {
    const environment: NodeJS.ProcessEnv = { ...process.env, ELECTRON_RUN_AS_NODE: "1" };
    delete environment[DESKTOP_LOCAL_ACCESS_TOKEN_ENV];
    if (localAccessToken) environment[DESKTOP_LOCAL_ACCESS_TOKEN_ENV] = localAccessToken;
    return environment;
}

async function waitForReady(
    child: ChildProcess,
    start: ServerProcessStart,
    log: WriteStream,
): Promise<string> {
    return await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(
            () => finish(new Error("The local Happy server timed out.")),
            30_000,
        );
        const onError = (error: Error) => finish(error);
        const onExit = (code: number | null) =>
            finish(new Error(`The local Happy server exited during startup (${code ?? 1}).`));
        const onMessage = (message: ServerProcessOutput) => {
            if (message.type === "ready") finish(undefined, message.url);
            else if (message.type === "fatal") finish(new Error(message.message));
        };
        const finish = (error?: Error, url?: string) => {
            clearTimeout(timeout);
            child.off("error", onError);
            child.off("exit", onExit);
            child.off("message", onMessage);
            if (error) {
                child.kill("SIGTERM");
                closeLog(log);
                reject(error);
            } else resolve(url!);
        };
        child.once("error", onError);
        child.once("exit", onExit);
        child.on("message", onMessage);
        child.send({ type: "start", input: start } satisfies ServerProcessInput);
    });
}

async function childStop(child: ChildProcess): Promise<void> {
    if (child.exitCode !== null || child.signalCode !== null) return;
    await new Promise<void>((resolve) => {
        const force = setTimeout(() => child.kill("SIGKILL"), 5_000);
        child.once("exit", () => {
            clearTimeout(force);
            resolve();
        });
        child.send({ type: "shutdown" } satisfies ServerProcessInput, (error) => {
            if (error) child.kill("SIGTERM");
        });
    });
}

function closeLog(log: WriteStream): void {
    if (!log.closed) log.end();
}
