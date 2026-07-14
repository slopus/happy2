import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MAX_COMMAND_OUTPUT = 32_768;
const BIND_MOUNT_RETRY_DELAYS_MS = [25, 50, 100, 200, 400, 800, 1_600] as const;

export interface AgentImageBuildInput {
    buildContext?: string;
    dockerfile: string;
    tag: string;
}

export interface AgentImageBuildUpdate {
    logChunk: string;
    /** Best-effort completion percentage. Docker only exposes step-level progress. */
    progress?: number;
}

export interface AgentImageBuildOptions {
    onUpdate?: (update: AgentImageBuildUpdate) => void;
    signal?: AbortSignal;
}

export interface AgentContainerInput {
    agentUserId: string;
    containerName: string;
    homeDirectory: string;
    imageId: string;
    imageTag: string;
    security: {
        init: true;
        readonlyRootFilesystem: true;
        sharedMemoryBytes: number;
        tmpfs: ReadonlyArray<{ mode: number; target: string }>;
    };
    workspaceDirectory: string;
}

export interface AgentDockerRuntime {
    buildImage(
        input: AgentImageBuildInput,
        options?: AgentImageBuildOptions,
    ): Promise<{ imageId: string }>;
    createContainer(input: AgentContainerInput, signal?: AbortSignal): Promise<void>;
    removeContainer(containerName: string): Promise<void>;
}

/** Uses the local Docker CLI so builds honor the administrator's active Docker context. */
export class LocalAgentDockerRuntime implements AgentDockerRuntime {
    constructor(private readonly command = "docker") {}

    async buildImage(
        input: AgentImageBuildInput,
        options: AgentImageBuildOptions = {},
    ): Promise<{ imageId: string }> {
        const temporaryContext = input.buildContext
            ? undefined
            : await mkdtemp(join(tmpdir(), "rigged-agent-image-"));
        try {
            const progress = new DockerBuildProgress();
            await this.run(
                [
                    "build",
                    "--pull",
                    "--progress",
                    "plain",
                    "--tag",
                    input.tag,
                    "--file",
                    "-",
                    input.buildContext ?? temporaryContext!,
                ],
                {
                    input: input.dockerfile,
                    onOutput(chunk) {
                        const nextProgress = progress.push(chunk);
                        options.onUpdate?.({
                            logChunk: chunk,
                            ...(nextProgress === undefined ? {} : { progress: nextProgress }),
                        });
                    },
                    signal: options.signal,
                },
            );
            const finalProgress = progress.finish();
            if (finalProgress !== undefined)
                options.onUpdate?.({ logChunk: "", progress: finalProgress });
            const inspected = await this.run(
                ["image", "inspect", "--format", "{{.Id}}", input.tag],
                { signal: options.signal },
            );
            const imageId = inspected.stdout.trim();
            if (!imageId) throw new Error("Docker did not return the built image id.");
            return { imageId };
        } finally {
            if (temporaryContext)
                await rm(temporaryContext, { recursive: true, force: true }).catch(() => undefined);
        }
    }

    async createContainer(input: AgentContainerInput, signal?: AbortSignal): Promise<void> {
        const args = [
            "create",
            "--name",
            input.containerName,
            "--label",
            "dev.rigged.managed=true",
            "--label",
            `dev.rigged.agent=${input.agentUserId}`,
            "--label",
            `dev.rigged.agent-image=${input.imageId}`,
            ...(input.security.readonlyRootFilesystem ? ["--read-only"] : []),
            ...(input.security.init ? ["--init"] : []),
            "--shm-size",
            String(input.security.sharedMemoryBytes),
            ...input.security.tmpfs.flatMap(({ mode, target }) => [
                "--tmpfs",
                `${target}:rw,nosuid,nodev,mode=${mode.toString(8)}`,
            ]),
            "--mount",
            bindMount(input.homeDirectory, "/home"),
            "--mount",
            bindMount(input.workspaceDirectory, "/workspace"),
            "--env",
            "HOME=/home",
            "--env",
            "TMPDIR=/tmp",
            "--workdir",
            "/workspace",
            "--entrypoint",
            "/bin/sh",
            input.imageTag,
            "-c",
            "trap : TERM INT; while :; do sleep 2073600; done",
        ];
        try {
            await this.createWithBindMountRetry(args, input.containerName, signal);
            await this.run(["start", input.containerName], { signal });
        } catch (error) {
            await this.removeContainer(input.containerName);
            throw error;
        }
    }

    async removeContainer(containerName: string): Promise<void> {
        await this.run(["rm", "--force", containerName]).catch(() => undefined);
    }

    private async createWithBindMountRetry(
        args: string[],
        containerName: string,
        signal?: AbortSignal,
    ): Promise<void> {
        for (let attempt = 0; ; attempt += 1) {
            try {
                await this.run(args, { signal });
                return;
            } catch (error) {
                const delay = BIND_MOUNT_RETRY_DELAYS_MS[attempt];
                if (delay === undefined || !isMissingBindSource(error)) throw error;
                await this.removeContainer(containerName);
                await abortableDelay(delay, signal);
            }
        }
    }

    private run(
        args: string[],
        options: { input?: string; onOutput?: (chunk: string) => void; signal?: AbortSignal } = {},
    ): Promise<{ stderr: string; stdout: string }> {
        if (options.signal?.aborted) return Promise.reject(abortError());
        return new Promise((resolve, reject) => {
            let settled = false;
            const child = spawn(this.command, args, {
                env: { ...process.env, DOCKER_BUILDKIT: "1" },
                stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
            });
            let stdout = "";
            let stderr = "";
            const finish = (action: () => void) => {
                if (settled) return;
                settled = true;
                action();
            };
            const abort = () => child.kill("SIGTERM");
            options.signal?.addEventListener("abort", abort, { once: true });
            child.stdout?.on("data", (chunk: Buffer | string) => {
                const text = chunk.toString();
                stdout = appendOutput(stdout, text);
                options.onOutput?.(text);
            });
            child.stderr?.on("data", (chunk: Buffer | string) => {
                const text = chunk.toString();
                stderr = appendOutput(stderr, text);
                options.onOutput?.(text);
            });
            child.once("error", (error) => {
                options.signal?.removeEventListener("abort", abort);
                finish(() =>
                    reject(new Error(`Could not run Docker: ${error.message}`, { cause: error })),
                );
            });
            child.once("close", (code, signal) => {
                options.signal?.removeEventListener("abort", abort);
                if (options.signal?.aborted) {
                    finish(() => reject(abortError()));
                    return;
                }
                if (code === 0) {
                    finish(() => resolve({ stderr, stdout }));
                    return;
                }
                const detail = stderr.trim() || stdout.trim() || `signal ${signal ?? "unknown"}`;
                finish(() =>
                    reject(
                        new Error(
                            `Docker ${args[0] ?? "command"} failed with exit code ${code ?? -1}: ${detail}`,
                        ),
                    ),
                );
            });
            if (options.input !== undefined) child.stdin?.end(options.input);
        });
    }
}

class DockerBuildProgress {
    private buffer = "";
    private readonly completedSteps = new Set<string>();
    private current = 1;
    private readonly stages = new Map<string, number>();
    private readonly vertices = new Map<string, { index: number; stage: string }>();

    push(chunk: string): number | undefined {
        this.buffer += chunk.replaceAll("\r", "\n");
        let changed = false;
        for (;;) {
            const newline = this.buffer.indexOf("\n");
            if (newline < 0) break;
            const line = this.buffer.slice(0, newline);
            this.buffer = this.buffer.slice(newline + 1);
            changed = this.readLine(line) || changed;
        }
        return changed ? this.current : undefined;
    }

    finish(): number | undefined {
        if (!this.buffer) return undefined;
        const changed = this.readLine(this.buffer);
        this.buffer = "";
        return changed ? this.current : undefined;
    }

    private readLine(line: string): boolean {
        const step = line.match(/^(#\d+) \[(.+) (\d+)\/(\d+)\]/);
        if (step) {
            const [, vertex, stage, rawIndex, rawTotal] = step;
            const index = Number(rawIndex);
            const total = Number(rawTotal);
            this.vertices.set(vertex!, { index, stage: stage! });
            this.stages.set(stage!, Math.max(this.stages.get(stage!) ?? 0, total));
            for (let previous = 1; previous < index; previous += 1)
                this.completedSteps.add(`${stage}:${previous}`);
        }
        const terminal = line.match(/^(#\d+)\s+(?:DONE|CACHED)\b/);
        if (terminal) {
            const known = this.vertices.get(terminal[1]!);
            if (known) this.completedSteps.add(`${known.stage}:${known.index}`);
        }
        const total = [...this.stages.values()].reduce((sum, value) => sum + value, 0);
        if (!total) return false;
        const next = Math.min(95, 5 + Math.floor((this.completedSteps.size / total) * 90));
        if (next <= this.current) return false;
        this.current = next;
        return true;
    }
}

function bindMount(source: string, target: string): string {
    if (source.includes(","))
        throw new Error("Agent sandbox paths cannot contain commas when used as Docker mounts.");
    return `type=bind,source=${source},target=${target}`;
}

function appendOutput(current: string, addition: string): string {
    const combined = current + addition;
    return combined.length <= MAX_COMMAND_OUTPUT
        ? combined
        : combined.slice(combined.length - MAX_COMMAND_OUTPUT);
}

function abortError(): Error {
    const error = new Error("Docker operation was aborted.");
    error.name = "AbortError";
    return error;
}

function isMissingBindSource(error: unknown): boolean {
    return (
        error instanceof Error &&
        error.message.includes('invalid mount config for type "bind"') &&
        error.message.includes("bind source path does not exist")
    );
}

function abortableDelay(milliseconds: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.reject(abortError());
    return new Promise((resolve, reject) => {
        const abort = () => {
            clearTimeout(timer);
            reject(abortError());
        };
        const timer = setTimeout(() => {
            signal?.removeEventListener("abort", abort);
            resolve();
        }, milliseconds);
        signal?.addEventListener("abort", abort, { once: true });
    });
}
