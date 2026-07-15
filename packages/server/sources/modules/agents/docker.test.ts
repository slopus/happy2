import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalAgentDockerRuntime } from "./docker.js";

describe("LocalAgentDockerRuntime", () => {
    let directory: string;
    let command: string;
    let log: string;

    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), "happy2-docker-runtime-"));
        command = join(directory, "docker");
        log = join(directory, "calls.jsonl");
        await writeFile(
            command,
            `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
let input = "";
try { input = fs.readFileSync(0, "utf8"); } catch {}
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ args, input }) + "\\n");
const retryMarker = ${JSON.stringify(join(directory, "retry-mount.marker"))};
if (args[0] === "create" && args.includes("retry-mount-container") && !fs.existsSync(retryMarker)) {
    fs.writeFileSync(retryMarker, "failed once");
    process.stderr.write('Error response from daemon: invalid mount config for type "bind": bind source path does not exist: /host_mnt/Users/example/home\\n');
    process.exit(1);
}
if (args[0] === "image" && args[1] === "inspect") process.stdout.write("sha256:built-image\\n");
if (args[0] === "build") process.stderr.write("#1 [stage-0 1/2] prepare\\n#1 DONE\\n#2 [stage-0 2/2] assemble\\n#2 DONE\\n");
`,
            { mode: 0o700 },
        );
        await chmod(command, 0o700);
    });

    afterEach(async () => {
        await rm(directory, { recursive: true, force: true });
    });

    it("builds from persisted input and creates the Daycare-style readonly container", async () => {
        const runtime = new LocalAgentDockerRuntime(command);
        const updates: Array<{ logChunk: string; progress?: number }> = [];
        await expect(
            runtime.buildImage(
                {
                    buildContext: "https://example.invalid/context.git#commit:runtime",
                    dockerfile: "FROM ubuntu:24.04\n",
                    tag: "happy2-agent:definition",
                },
                { onUpdate: (update) => updates.push(update) },
            ),
        ).resolves.toEqual({ imageId: "sha256:built-image" });
        expect(updates.map(({ progress }) => progress).filter(Boolean)).toEqual([95]);
        expect(updates.map(({ logChunk }) => logChunk).join("")).toContain("#2 DONE");

        await runtime.createContainer({
            agentUserId: "agent-id",
            containerName: "happy2-agent-container",
            homeDirectory: "/host/agent/user/home",
            imageId: "image-record-id",
            imageTag: "happy2-agent:definition",
            security: {
                init: true,
                readonlyRootFilesystem: true,
                sharedMemoryBytes: 1024 * 1024 * 1024,
                tmpfs: [
                    { target: "/tmp", mode: 0o1777 },
                    { target: "/run", mode: 0o755 },
                    { target: "/var/tmp", mode: 0o1777 },
                    { target: "/var/run", mode: 0o755 },
                ],
            },
            workspaceDirectory: "/host/agent/user/workspace",
        });

        const calls = (await readFile(log, "utf8"))
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line) as { args: string[]; input: string });
        expect(calls[0]).toEqual({
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
        expect(calls[1]?.args).toEqual([
            "image",
            "inspect",
            "--format",
            "{{.Id}}",
            "happy2-agent:definition",
        ]);
        expect(calls[2]?.args).toEqual([
            "create",
            "--name",
            "happy2-agent-container",
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
            "type=bind,source=/host/agent/user/home,target=/home",
            "--mount",
            "type=bind,source=/host/agent/user/workspace,target=/workspace",
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
        expect(calls[3]?.args).toEqual(["start", "happy2-agent-container"]);
    });

    it("retries the transient Docker Desktop bind propagation failure", async () => {
        const runtime = new LocalAgentDockerRuntime(command);

        await expect(
            runtime.createContainer({
                agentUserId: "agent-id",
                containerName: "retry-mount-container",
                homeDirectory: "/Users/example/home",
                imageId: "image-record-id",
                imageTag: "happy2-agent:definition",
                security: {
                    init: true,
                    readonlyRootFilesystem: true,
                    sharedMemoryBytes: 1024,
                    tmpfs: [],
                },
                workspaceDirectory: "/Users/example/workspace",
            }),
        ).resolves.toBeUndefined();

        const calls = (await readFile(log, "utf8"))
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line) as { args: string[] });
        expect(calls.filter(({ args }) => args[0] === "create")).toHaveLength(2);
        expect(calls.map(({ args }) => args).filter(([command]) => command === "rm")).toEqual([
            ["rm", "--force", "retry-mount-container"],
        ]);
        expect(calls.at(-1)?.args).toEqual(["start", "retry-mount-container"]);
    });
});
