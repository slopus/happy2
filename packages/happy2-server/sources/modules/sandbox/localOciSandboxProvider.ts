import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
    AgentImageBuildInput,
    AgentImageBuildOptions,
    AgentSandboxCreateInput,
    PluginSandboxCommandInput,
    PluginSandboxCreateInput,
    SandboxFileEgressInput,
    SandboxFileIngressInput,
    SandboxProbeOptions,
    SandboxProvider,
    SandboxProviderStatus,
    SandboxTerminalHandle,
    SandboxTerminalInput,
} from "./types.js";
import { portShareContainerPorts } from "../port-share/types.js";

const DEFAULT_PROBE_TIMEOUT_MS = 3_000;
const MAX_COMMAND_OUTPUT = 32_768;
const MAX_VERSION_BYTES = 512;
const BIND_MOUNT_RETRY_DELAYS_MS = [25, 50, 100, 200, 400, 800, 1_600] as const;
const PLUGIN_MEMORY_BYTES = 1024 * 1024 * 1024;
const PLUGIN_CPUS = "1";
const PLUGIN_PID_LIMIT = "256";
const PLUGIN_COMMAND_MARKER = "/run/happy2-plugin-command.pid";
const PLUGIN_CLI_ENV_PREFIXES = ["CONTAINER_", "CONTAINERS_", "DOCKER_", "DYLD_", "LD_", "PODMAN_"];
const PLUGIN_CLI_ENV_NAMES = new Set([
    "ALL_PROXY",
    "CONMON",
    "CURL_CA_BUNDLE",
    "DBUS_SESSION_BUS_ADDRESS",
    "GIT_CONFIG_GLOBAL",
    "GIT_CONFIG_SYSTEM",
    "GIT_SSL_CAINFO",
    "GODEBUG",
    "GOTRACEBACK",
    "HOME",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "LD_LIBRARY_PATH",
    "LD_PRELOAD",
    "NODE_CHANNEL_FD",
    "NODE_OPTIONS",
    "NODE_PATH",
    "NODE_UNIQUE_ID",
    "NO_PROXY",
    "OCI_RUNTIME",
    "PATH",
    "PATHEXT",
    "REGISTRY_AUTH_FILE",
    "SSH_AUTH_SOCK",
    "SSL_CERT_DIR",
    "SSL_CERT_FILE",
    "STORAGE_DRIVER",
    "STORAGE_OPTS",
    "SYSTEMROOT",
    "TEMP",
    "TMP",
    "TMPDIR",
    "WINDIR",
    "XDG_CACHE_HOME",
    "XDG_CONFIG_HOME",
    "XDG_DATA_HOME",
    "XDG_RUNTIME_DIR",
]);

interface LocalOciSandboxProviderOptions {
    command: string;
    displayName: string;
    id: "docker" | "podman";
}

interface CommandResult {
    stderr: string;
    stdout: string;
}

type ProbeCommandResult =
    | { result: CommandResult; state: "complete" }
    | { error: unknown; state: "failed" | "timed_out" };

/** Local Docker/Podman driver with identical sandbox security, lifecycle, file, and terminal semantics. */
export class LocalOciSandboxProvider implements SandboxProvider {
    readonly locality = "local" as const;
    readonly command: string;
    readonly displayName: string;
    readonly id: "docker" | "podman";

    constructor(options: LocalOciSandboxProviderOptions) {
        this.command = options.command;
        this.displayName = options.displayName;
        this.id = options.id;
    }

    async probe(options: SandboxProbeOptions = {}): Promise<SandboxProviderStatus> {
        const timeoutMs = options.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;
        if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000)
            throw new Error("Sandbox provider probe timeout must be between 1 and 30000 ms");
        const deadline = Date.now() + timeoutMs;
        const version = await this.probeCommand(["--version"], timeoutMs, options.signal);
        if (version.state !== "complete") {
            if (version.state === "timed_out") return this.timedOutStatus("version probe");
            if (options.signal?.aborted) throw abortError(this.displayName);
            return {
                id: this.id,
                displayName: this.displayName,
                health: "unavailable",
                detail: `${this.displayName} is not installed or is not available on PATH.`,
                remediation: this.installRemediation(),
            };
        }
        const versionText = boundedDetail(version.result.stdout || version.result.stderr);
        const health = await this.probeCommand(
            ["info", "--format", "{{json .}}"],
            Math.max(1, deadline - Date.now()),
            options.signal,
        );
        if (health.state !== "complete") {
            if (health.state === "timed_out")
                return this.timedOutStatus("health probe", versionText);
            if (options.signal?.aborted) throw abortError(this.displayName);
            return {
                id: this.id,
                displayName: this.displayName,
                health: "unhealthy",
                detail: `${this.displayName} is installed, but its local engine is not responding: ${commandFailureDetail(health.error)}`,
                remediation: this.startRemediation(),
                ...(versionText ? { version: versionText } : {}),
            };
        }
        return {
            id: this.id,
            displayName: this.displayName,
            health: "healthy",
            detail: `${this.displayName} is installed and its local engine is ready.`,
            ...(versionText ? { version: versionText } : {}),
        };
    }

    async buildImage(
        input: AgentImageBuildInput,
        options: AgentImageBuildOptions = {},
    ): Promise<{ imageId: string }> {
        const temporaryContext = input.buildContext
            ? undefined
            : await mkdtemp(join(tmpdir(), "happy2-agent-image-"));
        try {
            const progress = new OciBuildProgress();
            await this.run(this.buildArguments(input, temporaryContext!), {
                input: input.dockerfile,
                onOutput: (chunk) => {
                    const nextProgress = progress.push(chunk);
                    options.onUpdate?.({
                        logChunk: chunk,
                        ...(nextProgress === undefined ? {} : { progress: nextProgress }),
                    });
                },
                signal: options.signal,
            });
            const finalProgress = progress.finish();
            if (finalProgress !== undefined)
                options.onUpdate?.({ logChunk: "", progress: finalProgress });
            const inspected = await this.run(
                ["image", "inspect", "--format", "{{.Id}}", input.tag],
                { signal: options.signal },
            );
            const imageId = inspected.stdout.trim();
            if (!imageId) throw new Error(`${this.displayName} did not return the built image id.`);
            return { imageId };
        } finally {
            if (temporaryContext)
                await rm(temporaryContext, { recursive: true, force: true }).catch(() => undefined);
        }
    }

    async createSandbox(input: AgentSandboxCreateInput, signal?: AbortSignal): Promise<void> {
        const args = [
            "create",
            "--name",
            input.containerName,
            "--label",
            "dev.happy2.managed=true",
            "--label",
            `dev.happy2.agent=${input.agentUserId}`,
            "--label",
            `dev.happy2.agent-image=${input.imageId}`,
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
            ...portShareContainerPorts.flatMap((port) => ["--publish", `127.0.0.1::${port}/tcp`]),
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
            await this.removeSandbox(input.containerName);
            throw error;
        }
    }

    async createPluginSandbox(
        input: PluginSandboxCreateInput,
        signal?: AbortSignal,
    ): Promise<void> {
        const args = [
            "create",
            "--name",
            input.containerName,
            "--label",
            "dev.happy2.managed=true",
            "--label",
            `dev.happy2.plugin-installation=${input.installationId}`,
            "--label",
            `dev.happy2.plugin-instance=${input.containerInstanceId}`,
            "--add-host",
            "happy2.host.internal:host-gateway",
            "--read-only",
            "--init",
            "--cap-drop",
            "ALL",
            "--security-opt",
            "no-new-privileges",
            "--memory",
            String(PLUGIN_MEMORY_BYTES),
            "--cpus",
            PLUGIN_CPUS,
            "--pids-limit",
            PLUGIN_PID_LIMIT,
            "--shm-size",
            "268435456",
            "--tmpfs",
            "/tmp:rw,nosuid,nodev,mode=1777",
            "--tmpfs",
            "/run:rw,nosuid,nodev,mode=755",
            "--mount",
            bindMount(input.workspaceDirectory, "/workspace"),
            "--env",
            "HOME=/tmp",
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
            await this.removeSandbox(input.containerName);
            throw error;
        }
    }

    async removeSandbox(containerName: string): Promise<void> {
        await this.run(["rm", "--force", containerName]).catch(() => undefined);
    }

    async resolveSandboxPort(
        containerName: string,
        containerPort: number,
        signal?: AbortSignal,
    ): Promise<{ host: "127.0.0.1"; port: number }> {
        const result = await this.run(["port", containerName, `${containerPort}/tcp`], { signal });
        const mappings = result.stdout
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);
        for (const mapping of mappings) {
            const match = /^127\.0\.0\.1:(\d+)$/.exec(mapping);
            const port = match ? Number(match[1]) : 0;
            if (Number.isInteger(port) && port >= 1 && port <= 65_535)
                return { host: "127.0.0.1", port };
        }
        throw new Error(
            `${this.displayName} did not report a loopback mapping for container port ${containerPort}`,
        );
    }

    async inspectPluginSandbox(
        containerName: string,
        signal?: AbortSignal,
    ): Promise<
        { containerInstanceId: string; installationId: string; running: boolean } | undefined
    > {
        let inspected: CommandResult;
        try {
            inspected = await this.run(["inspect", "--format", "{{json .}}", containerName], {
                signal,
            });
        } catch (error) {
            if (isMissingContainer(error)) return undefined;
            throw error;
        }
        let value: {
            Config?: { Labels?: Record<string, string> };
            State?: { Running?: boolean };
        };
        try {
            value = JSON.parse(inspected.stdout) as typeof value;
        } catch (error) {
            throw new Error(`${this.displayName} returned invalid plugin container metadata`, {
                cause: error,
            });
        }
        const installationId = value.Config?.Labels?.["dev.happy2.plugin-installation"];
        const containerInstanceId = value.Config?.Labels?.["dev.happy2.plugin-instance"];
        if (!installationId || !containerInstanceId) return undefined;
        return { installationId, containerInstanceId, running: value.State?.Running === true };
    }

    async startPluginCommand(
        input: PluginSandboxCommandInput,
        signal?: AbortSignal,
    ): Promise<void> {
        const environment = Object.entries(input.environment);
        const script = [
            "set -eu",
            `marker=${PLUGIN_COMMAND_MARKER}`,
            "trap 'rm -f \"$marker\"' EXIT TERM INT",
            'printf \'%s\\n\' "$$" > "$marker"',
            '"$@"',
        ].join("; ");
        await this.run(
            [
                "exec",
                "--detach",
                ...environment.flatMap(([key]) => ["--env", key]),
                input.containerName,
                "/bin/sh",
                "-c",
                script,
                "happy2-plugin-command",
                ...input.command,
            ],
            { environment, signal },
        );
        for (let attempt = 0; attempt < 50; attempt += 1) {
            if (await this.isPluginCommandRunning(input.containerName, signal)) return;
            await abortableDelay(20, signal, this.displayName);
        }
        throw new Error(`${this.displayName} plugin command exited during startup`);
    }

    async isPluginCommandRunning(containerName: string, signal?: AbortSignal): Promise<boolean> {
        const script = [
            `marker=${PLUGIN_COMMAND_MARKER}`,
            'if test -r "$marker" && kill -0 "$(cat "$marker")" 2>/dev/null',
            "then printf running",
            "else printf stopped",
            "fi",
        ].join("; ");
        let result: CommandResult;
        try {
            result = await this.run(
                [
                    "exec",
                    containerName,
                    "/bin/sh",
                    "-c",
                    script,
                    "happy2-plugin-command-running-check",
                ],
                { signal },
            );
        } catch (error) {
            if (isMissingContainer(error) || isStoppedContainer(error)) return false;
            throw error;
        }
        const state = result.stdout.trim();
        if (state === "running") return true;
        if (state === "stopped") return false;
        throw new Error(`${this.displayName} returned an invalid plugin command state`);
    }

    async copyFileToSandbox(input: SandboxFileIngressInput, signal?: AbortSignal): Promise<void> {
        await this.run(
            ["cp", input.sourcePath, `${input.containerName}:${input.destinationPath}`],
            { signal },
        );
    }

    async copyFileFromSandbox(input: SandboxFileEgressInput, signal?: AbortSignal): Promise<void> {
        await this.run(
            ["cp", `${input.containerName}:${input.sourcePath}`, input.destinationPath],
            { signal },
        );
    }

    attachTerminal(input: SandboxTerminalInput, signal?: AbortSignal): SandboxTerminalHandle {
        const command = input.command?.length ? [...input.command] : ["/bin/sh"];
        const environment = Object.entries(input.environment ?? {});
        const childEnvironment = pluginCliEnvironment(this.commandEnvironment(), environment);
        const child = spawn(
            this.command,
            [
                "exec",
                "--interactive",
                ...environment.flatMap(([key]) => ["--env", key]),
                input.containerName,
                ...command,
            ],
            {
                env: childEnvironment,
                stdio: ["pipe", "pipe", "pipe"],
            },
        );
        const abort = () => child.kill("SIGTERM");
        signal?.addEventListener("abort", abort, { once: true });
        const wait = childResult(child).finally(() => signal?.removeEventListener("abort", abort));
        if (signal?.aborted) abort();
        return {
            stdin: child.stdin,
            stdout: child.stdout,
            stderr: child.stderr,
            wait,
            close: abort,
        };
    }

    private buildArguments(input: AgentImageBuildInput, temporaryContext: string): string[] {
        return [
            "build",
            "--pull",
            ...(this.id === "docker" ? ["--progress", "plain"] : []),
            "--tag",
            input.tag,
            "--file",
            "-",
            input.buildContext ?? temporaryContext,
        ];
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
                if (this.id !== "docker" || delay === undefined || !isMissingBindSource(error))
                    throw error;
                await this.removeSandbox(containerName);
                await abortableDelay(delay, signal, this.displayName);
            }
        }
    }

    private async probeCommand(
        args: string[],
        timeoutMs: number,
        signal?: AbortSignal,
    ): Promise<ProbeCommandResult> {
        const controller = new AbortController();
        let timedOut = false;
        const timeout = setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, timeoutMs);
        const abort = () => controller.abort();
        signal?.addEventListener("abort", abort, { once: true });
        try {
            return {
                state: "complete",
                result: await this.run(args, { signal: controller.signal }),
            };
        } catch (error) {
            return { state: timedOut ? "timed_out" : "failed", error };
        } finally {
            clearTimeout(timeout);
            signal?.removeEventListener("abort", abort);
        }
    }

    private run(
        args: string[],
        options: {
            environment?: ReadonlyArray<readonly [string, string]>;
            input?: string;
            onOutput?: (chunk: string) => void;
            signal?: AbortSignal;
        } = {},
    ): Promise<CommandResult> {
        if (options.signal?.aborted) return Promise.reject(abortError(this.displayName));
        return new Promise((resolve, reject) => {
            let settled = false;
            let forcedKill: ReturnType<typeof setTimeout> | undefined;
            const child = spawn(this.command, args, {
                env: options.environment
                    ? pluginCliEnvironment(this.commandEnvironment(), options.environment)
                    : this.commandEnvironment(),
                stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
            });
            let stdout = "";
            let stderr = "";
            const finish = (action: () => void) => {
                if (settled) return;
                settled = true;
                if (forcedKill) clearTimeout(forcedKill);
                action();
            };
            const abort = () => {
                child.kill("SIGTERM");
                forcedKill = setTimeout(() => child.kill("SIGKILL"), 250);
                forcedKill.unref();
            };
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
                    reject(
                        new Error(`Could not run ${this.displayName}: ${error.message}`, {
                            cause: error,
                        }),
                    ),
                );
            });
            child.once("close", (code, closedSignal) => {
                options.signal?.removeEventListener("abort", abort);
                if (options.signal?.aborted) {
                    finish(() => reject(abortError(this.displayName)));
                    return;
                }
                if (code === 0) {
                    finish(() => resolve({ stderr, stdout }));
                    return;
                }
                const detail =
                    stderr.trim() || stdout.trim() || `signal ${closedSignal ?? "unknown"}`;
                finish(() =>
                    reject(
                        new Error(
                            `${this.displayName} ${args[0] ?? "command"} failed with exit code ${code ?? -1}: ${detail}`,
                        ),
                    ),
                );
            });
            if (options.input !== undefined) child.stdin?.end(options.input);
        });
    }

    private commandEnvironment(): NodeJS.ProcessEnv {
        const environment: NodeJS.ProcessEnv =
            this.id === "docker" ? { ...process.env, DOCKER_BUILDKIT: "1" } : { ...process.env };
        delete environment.NODE_CHANNEL_FD;
        delete environment.NODE_UNIQUE_ID;
        return environment;
    }

    private timedOutStatus(operation: string, version?: string): SandboxProviderStatus {
        return {
            id: this.id,
            displayName: this.displayName,
            health: "timed_out",
            detail: `${this.displayName} ${operation} exceeded its time limit.`,
            remediation: this.startRemediation(),
            ...(version ? { version } : {}),
        };
    }

    private installRemediation(): string {
        return this.id === "docker"
            ? "Install Docker Desktop or Docker Engine and make the docker command available on PATH."
            : "Install Podman and make the podman command available on PATH.";
    }

    private startRemediation(): string {
        return this.id === "docker"
            ? "Start Docker Desktop or the Docker daemon, then try again."
            : "Start the Podman machine or local Podman service, then try again.";
    }
}

export function localSandboxProviders(): readonly SandboxProvider[] {
    return [
        new LocalOciSandboxProvider({ id: "docker", displayName: "Docker", command: "docker" }),
        new LocalOciSandboxProvider({ id: "podman", displayName: "Podman", command: "podman" }),
    ];
}

function pluginCliEnvironment(
    base: NodeJS.ProcessEnv,
    plugin: ReadonlyArray<readonly [string, string]>,
): NodeJS.ProcessEnv {
    const seen = new Set<string>();
    for (const [key] of plugin) {
        const normalized = key.toUpperCase();
        if (
            seen.has(normalized) ||
            PLUGIN_CLI_ENV_NAMES.has(normalized) ||
            PLUGIN_CLI_ENV_PREFIXES.some((prefix) => normalized.startsWith(prefix))
        )
            throw new Error(`Plugin variable ${key} cannot shadow the container CLI environment`);
        seen.add(normalized);
    }
    return { ...base, ...Object.fromEntries(plugin) };
}

class OciBuildProgress {
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
        throw new Error("Agent sandbox paths cannot contain commas when used as OCI mounts.");
    return `type=bind,source=${source},target=${target}`;
}

function appendOutput(current: string, addition: string): string {
    const combined = current + addition;
    return combined.length <= MAX_COMMAND_OUTPUT
        ? combined
        : combined.slice(combined.length - MAX_COMMAND_OUTPUT);
}

function boundedDetail(value: string): string | undefined {
    const result = value.trim();
    if (!result) return undefined;
    const bytes = Buffer.from(result, "utf8");
    if (bytes.byteLength <= MAX_VERSION_BYTES) return result;
    let end = MAX_VERSION_BYTES;
    while (end > 0 && (bytes[end]! & 0xc0) === 0x80) end -= 1;
    return bytes.subarray(0, end).toString("utf8");
}

function commandFailureDetail(error: unknown): string {
    return boundedDetail(error instanceof Error ? error.message : String(error)) ?? "unknown error";
}

function abortError(displayName: string): Error {
    const error = new Error(`${displayName} operation was aborted.`);
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

function isMissingContainer(error: unknown): boolean {
    return (
        error instanceof Error &&
        /(?:no such (?:object|container)|container .* not found|no container with name or id)/i.test(
            error.message,
        )
    );
}

function isStoppedContainer(error: unknown): boolean {
    return (
        error instanceof Error &&
        /(?:container .* is not running|can only create exec sessions on running containers|container state improper)/i.test(
            error.message,
        )
    );
}

function abortableDelay(
    milliseconds: number,
    signal: AbortSignal | undefined,
    displayName: string,
): Promise<void> {
    if (signal?.aborted) return Promise.reject(abortError(displayName));
    return new Promise((resolve, reject) => {
        const abort = () => {
            clearTimeout(timer);
            reject(abortError(displayName));
        };
        const timer = setTimeout(() => {
            signal?.removeEventListener("abort", abort);
            resolve();
        }, milliseconds);
        signal?.addEventListener("abort", abort, { once: true });
    });
}

function childResult(
    child: ChildProcessWithoutNullStreams,
): Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }> {
    return new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("close", (exitCode, signal) => resolve({ exitCode, signal }));
    });
}
