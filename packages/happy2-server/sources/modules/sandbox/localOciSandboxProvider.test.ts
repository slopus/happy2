import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SandboxProviderCatalog } from "./catalog.js";
import { LocalOciSandboxProvider } from "./localOciSandboxProvider.js";

describe("LocalOciSandboxProvider", () => {
    let directory: string;
    let command: string;
    let log: string;

    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), "happy2-oci-provider-"));
        command = join(directory, "oci");
        log = join(directory, "calls.jsonl");
        await writeCommand(command, log, "healthy");
    });

    afterEach(async () => {
        await rm(directory, { recursive: true, force: true });
    });

    it("probes Docker and exposes build, sandbox, file, cleanup, and terminal capabilities", async () => {
        const provider = dockerProvider(command);
        await expect(provider.probe()).resolves.toMatchObject({
            id: "docker",
            displayName: "Docker",
            health: "healthy",
            version: "Docker version 27.0.3, build gym",
        });
        const updates: Array<{ logChunk: string; progress?: number }> = [];
        await expect(
            provider.buildImage(
                {
                    buildContext: "https://example.invalid/context.git#commit:runtime",
                    dockerfile: "FROM ubuntu:24.04\n",
                    tag: "happy2-agent:definition",
                },
                { onUpdate: (update) => updates.push(update) },
            ),
        ).resolves.toEqual({ imageId: "sha256:built-image" });
        expect(updates.map(({ progress }) => progress).filter(Boolean)).toEqual([95]);

        await provider.createSandbox(sandboxInput("retry-mount-container"));
        await provider.copyFileToSandbox({
            containerName: "retry-mount-container",
            sourcePath: "/host/input.txt",
            destinationPath: "/workspace/input.txt",
        });
        await provider.copyFileFromSandbox({
            containerName: "retry-mount-container",
            sourcePath: "/workspace/output.txt",
            destinationPath: "/host/output.txt",
        });
        const terminal = provider.attachTerminal({
            containerName: "retry-mount-container",
            command: ["/bin/sh", "-l"],
        });
        terminal.stdin.end("exit\n");
        await expect(terminal.wait).resolves.toEqual({ exitCode: 0, signal: null });
        await provider.removeSandbox("retry-mount-container");

        const calls = await recordedCalls(log);
        expect(calls[0]?.args).toEqual(["--version"]);
        expect(calls[1]?.args).toEqual(["info", "--format", "{{json .}}"]);
        expect(calls[2]).toMatchObject({
            args: [
                "build",
                "--pull",
                "--progress",
                "plain",
                "--tag",
                "happy2-agent:definition",
                "--file",
                "-",
                "https://example.invalid/context.git#commit:runtime",
            ],
            input: "FROM ubuntu:24.04\n",
        });
        const createCalls = calls.filter(({ args }) => args[0] === "create");
        expect(createCalls).toHaveLength(2);
        expect(createCalls[0]?.args).toEqual([
            "create",
            "--name",
            "retry-mount-container",
            "--label",
            "dev.happy2.managed=true",
            "--label",
            "dev.happy2.agent=agent-id",
            "--label",
            "dev.happy2.agent-image=image-record-id",
            "--read-only",
            "--init",
            "--shm-size",
            "1073741824",
            "--tmpfs",
            "/tmp:rw,nosuid,nodev,mode=1777",
            "--tmpfs",
            "/run:rw,nosuid,nodev,mode=755",
            "--tmpfs",
            "/var/tmp:rw,nosuid,nodev,mode=1777",
            "--tmpfs",
            "/var/run:rw,nosuid,nodev,mode=755",
            "--mount",
            "type=bind,source=/Users/example/home,target=/home",
            "--mount",
            "type=bind,source=/Users/example/workspace,target=/workspace",
            "--env",
            "HOME=/home",
            "--env",
            "TMPDIR=/tmp",
            "--workdir",
            "/workspace",
            "--entrypoint",
            "/bin/sh",
            "happy2-agent:definition",
            "-c",
            "trap : TERM INT; while :; do sleep 2073600; done",
        ]);
        expect(createCalls[1]?.args).toEqual(createCalls[0]?.args);
        expect(calls.map(({ args }) => args)).toContainEqual(["start", "retry-mount-container"]);
        expect(calls.map(({ args }) => args).filter(([operation]) => operation === "cp")).toEqual([
            ["cp", "/host/input.txt", "retry-mount-container:/workspace/input.txt"],
            ["cp", "retry-mount-container:/workspace/output.txt", "/host/output.txt"],
        ]);
        expect(calls.map(({ args }) => args)).toContainEqual([
            "exec",
            "--interactive",
            "retry-mount-container",
            "/bin/sh",
            "-l",
        ]);
        expect(calls.at(-1)?.args).toEqual(["rm", "--force", "retry-mount-container"]);
    });

    it("uses the Podman CLI without Docker-only BuildKit arguments", async () => {
        const provider = new LocalOciSandboxProvider({
            id: "podman",
            displayName: "Podman",
            command,
        });
        await expect(provider.probe()).resolves.toMatchObject({ health: "healthy" });
        await provider.buildImage({
            dockerfile: "FROM ubuntu:24.04\n",
            tag: "happy2-agent:podman",
        });
        const build = (await recordedCalls(log)).find(({ args }) => args[0] === "build")!;
        expect(build.args.slice(0, 6)).toEqual([
            "build",
            "--pull",
            "--tag",
            "happy2-agent:podman",
            "--file",
            "-",
        ]);
        expect(build.args).not.toContain("--progress");
    });

    it("creates a dedicated hardened plugin container and passes MCP variables only to its exec process", async () => {
        const provider = dockerProvider(command);
        await provider.createPluginSandbox({
            installationId: "plugin-installation-id",
            containerInstanceId: "plugin-container-instance-id",
            containerName: "happy2-plugin-installation-id",
            imageTag: "happy2-plugin:immutable",
            workspaceDirectory: "/Users/example/plugin-data",
        });
        await expect(
            provider.inspectPluginSandbox("happy2-plugin-installation-id"),
        ).resolves.toEqual({
            installationId: "plugin-installation-id",
            containerInstanceId: "plugin-container-instance-id",
            running: true,
        });
        await provider.startPluginCommand({
            containerName: "happy2-plugin-installation-id",
            command: ["/plugin/worker", "--serve"],
            environment: { API_TOKEN: "secret-value", DISPLAY_MODE: "compact" },
        });
        await expect(
            provider.isPluginCommandRunning("happy2-plugin-installation-id"),
        ).resolves.toBe(true);
        const process = provider.attachTerminal({
            containerName: "happy2-plugin-installation-id",
            command: ["/plugin/server", "--stdio"],
            environment: { API_TOKEN: "secret-value", DISPLAY_MODE: "compact" },
        });
        process.stdin.end();
        await expect(process.wait).resolves.toEqual({ exitCode: 0, signal: null });

        const calls = await recordedCalls(log);
        expect(calls[0]?.args).toEqual([
            "create",
            "--name",
            "happy2-plugin-installation-id",
            "--label",
            "dev.happy2.managed=true",
            "--label",
            "dev.happy2.plugin-installation=plugin-installation-id",
            "--label",
            "dev.happy2.plugin-instance=plugin-container-instance-id",
            "--add-host",
            "happy2.host.internal:host-gateway",
            "--read-only",
            "--init",
            "--cap-drop",
            "ALL",
            "--security-opt",
            "no-new-privileges",
            "--memory",
            "1073741824",
            "--cpus",
            "1",
            "--pids-limit",
            "256",
            "--shm-size",
            "268435456",
            "--tmpfs",
            "/tmp:rw,nosuid,nodev,mode=1777",
            "--tmpfs",
            "/run:rw,nosuid,nodev,mode=755",
            "--mount",
            "type=bind,source=/Users/example/plugin-data,target=/workspace",
            "--env",
            "HOME=/tmp",
            "--env",
            "TMPDIR=/tmp",
            "--workdir",
            "/workspace",
            "--entrypoint",
            "/bin/sh",
            "happy2-plugin:immutable",
            "-c",
            "trap : TERM INT; while :; do sleep 2073600; done",
        ]);
        expect(calls[1]?.args).toEqual(["start", "happy2-plugin-installation-id"]);
        expect(calls[2]?.args).toEqual([
            "inspect",
            "--format",
            "{{json .}}",
            "happy2-plugin-installation-id",
        ]);
        expect(calls[3]?.args).toEqual(
            expect.arrayContaining([
                "exec",
                "--detach",
                "--env",
                "API_TOKEN",
                "--env",
                "DISPLAY_MODE",
                "happy2-plugin-installation-id",
                "/plugin/worker",
                "--serve",
            ]),
        );
        expect(calls[3]?.args.join(" ")).not.toContain("secret-value");
        expect(calls[3]?.inheritedPluginValues).toEqual({
            API_TOKEN: "secret-value",
            DISPLAY_MODE: "compact",
        });
        expect(calls[4]?.args.at(-1)).toBe("happy2-plugin-command-running-check");
        expect(calls[5]?.args.at(-1)).toBe("happy2-plugin-command-running-check");
        expect(calls[6]?.args).toEqual([
            "exec",
            "--interactive",
            "--env",
            "API_TOKEN",
            "--env",
            "DISPLAY_MODE",
            "happy2-plugin-installation-id",
            "/plugin/server",
            "--stdio",
        ]);
        expect(calls[6]?.args.join(" ")).not.toContain("secret-value");
        expect(calls[6]?.inheritedPluginValues).toEqual({
            API_TOKEN: "secret-value",
            DISPLAY_MODE: "compact",
        });
        expect(() =>
            provider.attachTerminal({
                containerName: "happy2-plugin-installation-id",
                command: ["/plugin/server"],
                environment: { CONTAINERS_CONF: "secret-value" },
            }),
        ).toThrow("cannot shadow the container CLI environment");
    });

    it("distinguishes a missing plugin container from engine and metadata failures", async () => {
        await writeCommand(command, log, "missing-container");
        await expect(
            dockerProvider(command).inspectPluginSandbox("missing-plugin"),
        ).resolves.toBeUndefined();

        await writeCommand(command, log, "inspect-failure");
        await expect(dockerProvider(command).inspectPluginSandbox("plugin")).rejects.toThrow(
            "engine is unavailable",
        );

        await writeCommand(command, log, "invalid-inspect");
        await expect(dockerProvider(command).inspectPluginSandbox("plugin")).rejects.toThrow(
            "invalid plugin container metadata",
        );

        await writeCommand(command, log, "stopped-container");
        await expect(
            dockerProvider(command).isPluginCommandRunning("stopped-plugin"),
        ).resolves.toBe(false);
    });

    it("distinguishes unavailable binaries, unhealthy engines, and bounded probe timeouts", async () => {
        const unavailable = dockerProvider(join(directory, "missing"));
        await expect(unavailable.probe({ timeoutMs: 1_000 })).resolves.toMatchObject({
            health: "unavailable",
            remediation: expect.stringContaining("Install Docker"),
        });

        await writeCommand(command, log, "unhealthy");
        await expect(dockerProvider(command).probe({ timeoutMs: 1_000 })).resolves.toMatchObject({
            health: "unhealthy",
            version: "Docker version 27.0.3, build gym",
            remediation: expect.stringContaining("Start Docker"),
        });

        await writeCommand(command, log, "timeout");
        await expect(dockerProvider(command).probe({ timeoutMs: 40 })).resolves.toMatchObject({
            health: "timed_out",
            detail: expect.stringContaining("version probe"),
        });

        await writeCommand(command, log, "multibyte-version");
        const multibyte = await dockerProvider(command).probe({ timeoutMs: 1_000 });
        expect(multibyte).toMatchObject({ health: "healthy" });
        expect(Buffer.byteLength(multibyte.version!, "utf8")).toBeLessThanOrEqual(512);
        expect(multibyte.version).not.toContain("�");
    });

    it("recommends only a sole healthy provider and rejects duplicate catalog ids", async () => {
        const docker = dockerProvider(command);
        const podman = new LocalOciSandboxProvider({
            id: "podman",
            displayName: "Podman",
            command: join(directory, "missing-podman"),
        });
        await expect(
            new SandboxProviderCatalog([docker, podman]).discover(),
        ).resolves.toMatchObject({
            recommendedProviderId: "docker",
            executionNotice: expect.stringContaining("agent code inside"),
        });
        expect(() => new SandboxProviderCatalog([docker, docker])).toThrow(
            "Duplicate sandbox provider id docker",
        );
    });
});

function dockerProvider(command: string): LocalOciSandboxProvider {
    return new LocalOciSandboxProvider({ id: "docker", displayName: "Docker", command });
}

function sandboxInput(containerName: string) {
    return {
        agentUserId: "agent-id",
        containerName,
        homeDirectory: "/Users/example/home",
        imageId: "image-record-id",
        imageTag: "happy2-agent:definition",
        security: {
            init: true as const,
            readonlyRootFilesystem: true as const,
            sharedMemoryBytes: 1024 * 1024 * 1024,
            tmpfs: [
                { target: "/tmp", mode: 0o1777 },
                { target: "/run", mode: 0o755 },
                { target: "/var/tmp", mode: 0o1777 },
                { target: "/var/run", mode: 0o755 },
            ],
        },
        workspaceDirectory: "/Users/example/workspace",
    };
}

async function writeCommand(
    command: string,
    log: string,
    mode:
        | "healthy"
        | "inspect-failure"
        | "invalid-inspect"
        | "missing-container"
        | "multibyte-version"
        | "stopped-container"
        | "timeout"
        | "unhealthy",
): Promise<void> {
    await writeFile(
        command,
        `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
let input = "";
try { input = fs.readFileSync(0, "utf8"); } catch {}
const inheritedPluginValues = Object.fromEntries(
    ["API_TOKEN", "DISPLAY_MODE"].filter((key) => process.env[key] !== undefined).map((key) => [key, process.env[key]])
);
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ args, input, inheritedPluginValues }) + "\\n");
if (${JSON.stringify(mode)} === "timeout" && args[0] === "--version") setTimeout(() => {}, 10_000);
if (args[0] === "--version") process.stdout.write(
    ${JSON.stringify(mode)} === "multibyte-version"
        ? "界".repeat(300) + "\\n"
        : "Docker version 27.0.3, build gym\\n"
);
if (${JSON.stringify(mode)} === "unhealthy" && args[0] === "info") {
    process.stderr.write("Cannot connect to the local engine\\n");
    process.exit(1);
}
if (${JSON.stringify(mode)} === "missing-container" && args[0] === "inspect") {
    process.stderr.write("Error: No such object: missing-plugin\\n");
    process.exit(1);
}
if (${JSON.stringify(mode)} === "inspect-failure" && args[0] === "inspect") {
    process.stderr.write("local engine is unavailable\\n");
    process.exit(1);
}
if (${JSON.stringify(mode)} === "invalid-inspect" && args[0] === "inspect") {
    process.stdout.write("not-json\\n");
    process.exit(0);
}
if (${JSON.stringify(mode)} === "stopped-container" && args[0] === "exec") {
    process.stderr.write("Error response from daemon: Container abc is not running\\n");
    process.exit(1);
}
const retryMarker = ${JSON.stringify(join(command, "..", "retry-mount.marker"))};
if (args[0] === "create" && args.includes("retry-mount-container") && !fs.existsSync(retryMarker)) {
    fs.writeFileSync(retryMarker, "failed once");
    process.stderr.write('invalid mount config for type "bind": bind source path does not exist\\n');
    process.exit(1);
}
if (args[0] === "image" && args[1] === "inspect") process.stdout.write("sha256:built-image\\n");
if (args[0] === "inspect") process.stdout.write(JSON.stringify({
    Config: { Labels: {
        "dev.happy2.plugin-installation": "plugin-installation-id",
        "dev.happy2.plugin-instance": "plugin-container-instance-id"
    } },
    State: { Running: true }
}) + "\\n");
if (args[0] === "exec" && args.at(-1) === "happy2-plugin-command-running-check") {
    process.stdout.write("running\\n");
}
if (args[0] === "build") process.stderr.write("#1 [stage-0 1/2] prepare\\n#1 DONE\\n#2 [stage-0 2/2] assemble\\n#2 DONE\\n");
`,
        { mode: 0o700 },
    );
    await chmod(command, 0o700);
}

async function recordedCalls(log: string): Promise<
    Array<{
        args: string[];
        input: string;
        inheritedPluginValues: Record<string, string>;
    }>
> {
    return (await readFile(log, "utf8"))
        .trim()
        .split("\n")
        .filter(Boolean)
        .map(
            (line) =>
                JSON.parse(line) as {
                    args: string[];
                    input: string;
                    inheritedPluginValues: Record<string, string>;
                },
        );
}
