import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalAgentDockerRuntime } from "@slopus/rigged";
import { describe, expect, it } from "vitest";
import { createMockRigDaemon } from "gym/rig";
import { createGymServer } from "../../sources/index.js";

describe("agent container bind propagation", () => {
    it("retries Docker Desktop's transient missing bind source response", async () => {
        const directory = await mkdtemp(join(tmpdir(), "rigged-gym-docker-bind-"));
        const command = join(directory, "docker");
        const callsPath = join(directory, "calls.jsonl");
        const markerPath = join(directory, "create-failed.marker");
        await writeFile(
            command,
            `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(callsPath)}, JSON.stringify(args) + "\\n");
if (args[0] === "build") process.stderr.write("#1 [stage-0 1/1] assemble\\n#1 DONE\\n");
if (args[0] === "image" && args[1] === "inspect") process.stdout.write("sha256:gym-image\\n");
if (args[0] === "create" && !fs.existsSync(${JSON.stringify(markerPath)})) {
    fs.writeFileSync(${JSON.stringify(markerPath)}, "failed once");
    process.stderr.write('Error response from daemon: invalid mount config for type "bind": bind source path does not exist: /host_mnt/Users/example/home\\n');
    process.exit(1);
}
`,
            { mode: 0o700 },
        );

        await using rig = await createMockRigDaemon();
        const server = await createGymServer({
            agentDocker: new LocalAgentDockerRuntime(command),
            databaseMode: "file",
            configure(config) {
                config.agents.enabled = true;
                config.agents.socketPath = rig.socketPath;
                config.agents.tokenPath = rig.tokenPath;
                config.agents.defaultCwd = rig.workspaceRoot;
            },
        });
        try {
            const admin = await server.createUser({ username: "bind_retry_admin" });
            const asAdmin = server.as(admin);
            const catalog = (await asAdmin.get("/v0/admin/agentImages")).json() as {
                images: Array<{ builtinKey?: string; id: string; status: string }>;
            };
            const minimal = catalog.images.find(
                ({ builtinKey }) => builtinKey === "daycare-minimal",
            );
            expect(minimal).toBeDefined();

            expect(
                (await asAdmin.post(`/v0/admin/agentImages/${minimal!.id}/buildImage`, {}))
                    .statusCode,
            ).toBe(202);
            await waitFor(async () => {
                const images = (
                    (await asAdmin.get("/v0/admin/agentImages")).json() as {
                        images: Array<{ id: string; status: string }>;
                    }
                ).images;
                return images.find(({ id }) => id === minimal!.id)?.status === "ready";
            });
            expect(
                (await asAdmin.post(`/v0/admin/agentImages/${minimal!.id}/setDefaultImage`, {}))
                    .statusCode,
            ).toBe(200);

            const created = await asAdmin.post("/v0/chats/createAgent", {
                name: "Bind Retry Agent",
                username: "bind_retry_agent",
            });
            expect(created.statusCode).toBe(201);
            expect(rig.createdSessions).toHaveLength(1);

            const calls = (await readFile(callsPath, "utf8"))
                .trim()
                .split("\n")
                .map((line) => JSON.parse(line) as string[]);
            expect(calls.filter(([operation]) => operation === "create")).toHaveLength(2);
            expect(calls.filter(([operation]) => operation === "rm")).toHaveLength(1);
            expect(calls.filter(([operation]) => operation === "start")).toHaveLength(1);
        } finally {
            await server.close();
            await rm(directory, { recursive: true, force: true });
        }
    });
});

async function waitFor(check: () => boolean | Promise<boolean>, timeoutMs = 5_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    do {
        if (await check()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    } while (Date.now() < deadline);
    throw new Error("Timed out waiting for the agent image build");
}
