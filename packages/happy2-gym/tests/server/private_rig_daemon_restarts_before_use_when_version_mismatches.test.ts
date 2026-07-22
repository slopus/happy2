import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMockRigDaemon, MockAgentSandboxRuntime } from "happy2-gym/rig";
import { expect, it } from "vitest";
import { createGymServer } from "../../sources/index.js";

it("restarts the private Rig before use when its version mismatches", async () => {
    await using rig = await createMockRigDaemon();
    rig.setDaemonVersion("0.0.26");
    const directory = await mkdtemp(join(tmpdir(), "happy2-private-rig-restart-"));
    const rigHome = join(directory, "rig");
    const invocationsPath = join(directory, "invocations.jsonl");
    const lifecyclePath = join(directory, "daemon-lifecycle");
    const wrapperPath = join(directory, "rig-wrapper.mjs");
    rig.setDaemonLifecycleStatePath(lifecyclePath);
    await writeFile(lifecyclePath, "started\n", { mode: 0o600 });
    await writeFile(
        wrapperPath,
        `#!/usr/bin/env node
import { appendFile, writeFile } from "node:fs/promises";
const arguments_ = process.argv.slice(2);
await appendFile(${JSON.stringify(invocationsPath)}, JSON.stringify({
    arguments: arguments_,
    disableHappySync: process.env.RIG_DISABLE_HAPPY_SYNC,
    rigHome: process.env.RIG_HOME,
    socketPath: process.env.RIG_SERVER_SOCKET_PATH,
}) + "\\n");
if (arguments_.join(" ") === "daemon stop")
    await writeFile(${JSON.stringify(lifecyclePath)}, "stopped\\n");
if (arguments_.join(" ") === "daemon start")
    await writeFile(${JSON.stringify(lifecyclePath)}, "started\\n");
`,
        { mode: 0o700 },
    );
    try {
        await using server = await createGymServer({
            agentSandbox: new MockAgentSandboxRuntime(),
            configure(config) {
                config.agents.enabled = true;
                config.agents.daemonMode = "managed";
                config.agents.command = wrapperPath;
                config.agents.directory = rigHome;
                // The desktop uses short endpoints outside its deeper topology root.
                config.agents.socketPath = rig.socketPath;
                config.agents.tokenPath = rig.tokenPath;
                config.agents.defaultCwd = rig.workspaceRoot;
            },
        });

        expect(
            (await readFile(invocationsPath, "utf8"))
                .trim()
                .split("\n")
                .map(
                    (line) =>
                        JSON.parse(line) as {
                            arguments: string[];
                            disableHappySync?: string;
                            rigHome?: string;
                            socketPath?: string;
                        },
                ),
        ).toEqual([
            {
                arguments: ["daemon", "stop"],
                disableHappySync: "1",
                rigHome,
                socketPath: rig.socketPath,
            },
            {
                arguments: ["daemon", "start"],
                disableHappySync: "1",
                rigHome,
                socketPath: rig.socketPath,
            },
        ]);
        expect(await readFile(join(rigHome, "runtime.toml"), "utf8")).toBe(
            `[settings]\ndurable_global_event_queue = true\nhappy_integration = false\n`,
        );
    } finally {
        await rm(directory, { force: true, recursive: true });
    }
});
