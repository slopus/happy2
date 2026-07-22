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
    const url = await serverChildWaitForReady(child, input.start, log);
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
    for (const name of Object.keys(environment))
        if (name.startsWith("RIG_")) delete environment[name];
    delete environment[DESKTOP_LOCAL_ACCESS_TOKEN_ENV];
    if (localAccessToken) environment[DESKTOP_LOCAL_ACCESS_TOKEN_ENV] = localAccessToken;
    return environment;
}

type ChildLog = Pick<WriteStream, "closed" | "end">;

export async function serverChildWaitForReady(
    child: ChildProcess,
    start: ServerProcessStart,
    log: ChildLog,
    timeoutMs = 30_000,
    shutdownTimeoutMs = 5_000,
): Promise<string> {
    return await new Promise<string>((resolve, reject) => {
        let finished = false;
        const timeout = setTimeout(() => {
            void finish(new Error("The local Happy server timed out."));
        }, timeoutMs);
        const onError = (error: Error) => void finish(error);
        const onExit = (code: number | null) =>
            void finish(new Error(`The local Happy server exited during startup (${code ?? 1}).`));
        const onMessage = (message: ServerProcessOutput) => {
            if (message.type === "ready") void finish(undefined, message.url);
            else if (message.type === "fatal") void finish(new Error(message.message));
        };
        const finish = async (error?: Error, url?: string) => {
            if (finished) return;
            finished = true;
            clearTimeout(timeout);
            child.off("error", onError);
            child.off("exit", onExit);
            child.off("message", onMessage);
            if (error) {
                await childStop(child, shutdownTimeoutMs);
                closeLog(log);
                reject(error);
            } else resolve(url!);
        };
        child.once("error", onError);
        child.once("exit", onExit);
        child.on("message", onMessage);
        try {
            child.send({ type: "start", input: start } satisfies ServerProcessInput);
        } catch (error) {
            void finish(error instanceof Error ? error : new Error(String(error)));
        }
    });
}

async function childStop(child: ChildProcess, forceAfterMs = 5_000): Promise<void> {
    if (child.exitCode !== null || child.signalCode !== null) return;
    await new Promise<void>((resolve) => {
        const force = setTimeout(() => child.kill("SIGKILL"), forceAfterMs);
        child.once("exit", () => {
            clearTimeout(force);
            resolve();
        });
        try {
            child.send({ type: "shutdown" } satisfies ServerProcessInput, (error) => {
                if (error) child.kill("SIGTERM");
            });
        } catch {
            child.kill("SIGTERM");
        }
    });
}

function closeLog(log: ChildLog): void {
    if (!log.closed) log.end();
}
