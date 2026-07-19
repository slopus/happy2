import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pluginCatalogLoad } from "happy2-server";
import { createGymServer, type GymRequestClient } from "happy2-gym";
import { createMockRigDaemon, MockAgentSandboxRuntime } from "happy2-gym/rig";
import { describe, expect, it } from "vitest";

const SQUARE_PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
);
const SKILL_SOURCE = `---
name: release-check
description: Check a release using the installed team's durable workflow.
---

# Release check

Confirm the build, migration, and rollback evidence before approving a release.
`;

describe("installed plugin skills in agent runs", () => {
    it("loads a copied SKILL.md through Rig after restart and replays the durable result", async () => {
        const catalogRoot = await mkdtemp(join(tmpdir(), "happy2-plugin-skills-"));
        try {
            const catalog = await pluginCatalogLoad(catalogRoot);
            await using rig = await createMockRigDaemon();
            rig.setAutomaticReply(undefined);
            await using server = await createGymServer({
                agentSandbox: new MockAgentSandboxRuntime(),
                pluginCatalog: catalog,
                configure(config) {
                    config.agents.enabled = true;
                    config.agents.socketPath = rig.socketPath;
                    config.agents.tokenPath = rig.tokenPath;
                    config.agents.defaultCwd = rig.workspaceRoot;
                },
            });
            const owner = await server.createUser({ username: "plugin_skill_owner" });
            const client = server.as(owner);

            const archive = skillPluginArchive();
            const installed = await installUploadedPlugin(client, archive);
            const repeated = await installUploadedPlugin(client, archive);
            expect(installed.statusCode).toBe(202);
            expect(repeated.statusCode).toBe(202);
            expect(installed.json().installation).toMatchObject({
                shortName: "release",
                sourceKind: "upload",
                status: "ready",
            });
            expect(repeated.json().installation.pluginId).toBe(
                installed.json().installation.pluginId,
            );
            expect(repeated.json().installation.id).not.toBe(installed.json().installation.id);
            const chatId = await createAgent(client);

            expect(
                (
                    await client.post(`/v0/chats/${chatId}/sendMessage`, {
                        text: "Use the release-check workflow before we ship.",
                        clientMutationId: "plugin-skill-turn",
                    })
                ).statusCode,
            ).toBe(201);
            await waitFor(() => rig.submittedRuns.length === 1, "Rig submission");
            const run = rig.submittedRuns[0]!;
            expect(run.externalTools).toEqual([]);
            expect(run.skills).toEqual([
                {
                    name: "release-check",
                    description: "Check a release using the installed team's durable workflow.",
                    location: "durable",
                },
            ]);

            rig.pauseGlobalEventDelivery();
            const callId = rig.requestSkillCall(run.runId, "release-check");
            await rm(catalogRoot, { force: true, recursive: true });
            await server.restart();
            rig.resumeGlobalEventDelivery();

            await waitFor(
                () => rig.externalToolCalls.find(({ id }) => id === callId)?.status === "completed",
                "durable plugin skill resolution",
                10_000,
            );
            expect(rig.externalToolCalls.find(({ id }) => id === callId)).toMatchObject({
                arguments: { name: "release-check" },
                skill: {
                    name: "release-check",
                    description: "Check a release using the installed team's durable workflow.",
                    location: "durable",
                },
                resolution: { status: "completed", output: SKILL_SOURCE },
            });

            await rm(server.config.plugins.directory, { force: true, recursive: true });
            rig.redeliverExternalToolCall(callId);
            await new Promise((resolve) => setTimeout(resolve, 100));
            expect(rig.externalToolCalls.find(({ id }) => id === callId)?.resolution).toEqual({
                status: "completed",
                output: SKILL_SOURCE,
            });

            rig.pauseGlobalEventDelivery();
            const revokedCallId = rig.requestSkillCall(run.runId, "release-check");
            const uninstalled = await client.post(
                `/v0/admin/systemPlugins/${installed.json().installation.pluginId}/uninstallPlugin`,
            );
            expect(uninstalled.statusCode).toBe(200);
            rig.resumeGlobalEventDelivery();
            await waitFor(
                () =>
                    rig.externalToolCalls.find(({ id }) => id === revokedCallId)?.status ===
                    "failed",
                "revoked plugin skill failure",
            );
            expect(
                rig.externalToolCalls.find(({ id }) => id === revokedCallId)?.resolution,
            ).toEqual({
                status: "failed",
                error: {
                    code: "plugin_skill_failed",
                    message: "The plugin no longer provides this durable skill",
                },
            });

            rig.completeRun(run.runId, "The release evidence is complete.");
            await waitForMessages(client, chatId, 2);
        } finally {
            await rm(catalogRoot, { force: true, recursive: true });
        }
    });

    it("fails a turn instead of sending an ambiguous cross-plugin skill name to Rig", async () => {
        const catalogRoot = await mkdtemp(join(tmpdir(), "happy2-plugin-skill-collision-"));
        try {
            await writeCatalogPlugin(catalogRoot, "alpha", "shared-check");
            await writeCatalogPlugin(catalogRoot, "beta", "shared-check");
            const catalog = await pluginCatalogLoad(catalogRoot);
            await using rig = await createMockRigDaemon();
            await using server = await createGymServer({
                agentSandbox: new MockAgentSandboxRuntime(),
                pluginCatalog: catalog,
                configure(config) {
                    config.agents.enabled = true;
                    config.agents.socketPath = rig.socketPath;
                    config.agents.tokenPath = rig.tokenPath;
                    config.agents.defaultCwd = rig.workspaceRoot;
                },
            });
            const owner = await server.createUser({ username: "plugin_skill_collision_owner" });
            const client = server.as(owner);
            expect((await client.post("/v0/admin/plugins/alpha/installPlugin")).statusCode).toBe(
                202,
            );
            expect((await client.post("/v0/admin/plugins/beta/installPlugin")).statusCode).toBe(
                202,
            );
            const chatId = await createAgent(client);

            expect(
                (
                    await client.post(`/v0/chats/${chatId}/sendMessage`, {
                        text: "Run the shared check.",
                        clientMutationId: "plugin-skill-collision-turn",
                    })
                ).statusCode,
            ).toBe(201);
            await waitFor(async () => {
                const messages = (await client.get(`/v0/chats/${chatId}/messages`)).json()
                    .messages as Array<{ generationStatus?: string }>;
                return messages.some(({ generationStatus }) => generationStatus === "failed");
            }, "ambiguous skill turn failure");
            expect(rig.submittedRuns).toEqual([]);
        } finally {
            await rm(catalogRoot, { force: true, recursive: true });
        }
    });
});

async function writeCatalogPlugin(
    root: string,
    shortName: string,
    skillName: string,
): Promise<void> {
    const plugin = join(root, shortName);
    await mkdir(join(plugin, "skills", skillName), { recursive: true });
    await writeFile(join(plugin, "plugin.png"), SQUARE_PNG);
    await writeFile(
        join(plugin, "plugin.json"),
        JSON.stringify({
            schemaVersion: 1,
            version: "1.0.0",
            displayName: `${shortName} workflow`,
            shortName,
            description: `Provides the ${shortName} workflow.`,
            variables: [],
        }),
    );
    await writeFile(
        join(plugin, "skills", skillName, "SKILL.md"),
        `---\nname: ${skillName}\ndescription: Runs the ${shortName} shared check.\n---\n\n# Shared check\n`,
    );
}

async function installUploadedPlugin(client: GymRequestClient, archive: Buffer) {
    const boundary = "happy2-skill-plugin-boundary";
    const prepared = await client.post(
        "/v0/admin/pluginPackages/preparePlugin",
        Buffer.concat([
            Buffer.from(
                `--${boundary}\r\nContent-Disposition: form-data; name="plugin"; filename="release.zip"\r\nContent-Type: application/zip\r\n\r\n`,
            ),
            archive,
            Buffer.from(`\r\n--${boundary}--\r\n`),
        ]),
        { headers: { "content-type": `multipart/form-data; boundary=${boundary}` } },
    );
    expect(prepared.statusCode).toBe(200);
    const finalFrame = prepared.payload.split("\n\n").filter(Boolean).at(-1)!;
    const data = JSON.parse(
        finalFrame
            .split("\n")
            .find((line) => line.startsWith("data: "))!
            .slice(6),
    ) as { candidates: Array<{ preparedToken: string }> };
    return client.post("/v0/admin/pluginPackages/installPlugin", {
        preparedToken: data.candidates[0]!.preparedToken,
    });
}

function skillPluginArchive(): Buffer {
    const files: Record<string, Buffer> = {
        "plugin.json": Buffer.from(
            JSON.stringify({
                schemaVersion: 1,
                version: "1.0.0",
                displayName: "Release workflow",
                shortName: "release",
                description: "Provides the team's release verification workflow.",
                variables: [],
            }),
        ),
        "plugin.png": SQUARE_PNG,
        "skills/release-check/SKILL.md": Buffer.from(SKILL_SOURCE),
    };
    const locals: Buffer[] = [];
    const centrals: Buffer[] = [];
    let offset = 0;
    for (const [name, body] of Object.entries(files)) {
        const filename = Buffer.from(name, "utf8");
        const checksum = crc32(body);
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0x800, 6);
        local.writeUInt32LE(checksum, 14);
        local.writeUInt32LE(body.byteLength, 18);
        local.writeUInt32LE(body.byteLength, 22);
        local.writeUInt16LE(filename.byteLength, 26);
        locals.push(local, filename, body);

        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(0x0314, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0x800, 8);
        central.writeUInt32LE(checksum, 16);
        central.writeUInt32LE(body.byteLength, 20);
        central.writeUInt32LE(body.byteLength, 24);
        central.writeUInt16LE(filename.byteLength, 28);
        central.writeUInt32LE((0o100600 << 16) >>> 0, 38);
        central.writeUInt32LE(offset, 42);
        centrals.push(central, filename);
        offset += local.byteLength + filename.byteLength + body.byteLength;
    }
    const centralDirectory = Buffer.concat(centrals);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(Object.keys(files).length, 8);
    end.writeUInt16LE(Object.keys(files).length, 10);
    end.writeUInt32LE(centralDirectory.byteLength, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...locals, centralDirectory, end]);
}

let crcTable: Uint32Array | undefined;

function crc32(value: Buffer): number {
    crcTable ??= Uint32Array.from({ length: 256 }, (_, index) => {
        let current = index;
        for (let bit = 0; bit < 8; bit += 1)
            current = (current & 1) !== 0 ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
        return current >>> 0;
    });
    let result = 0xffffffff;
    for (const byte of value) result = crcTable[(result ^ byte) & 0xff]! ^ (result >>> 8);
    return (result ^ 0xffffffff) >>> 0;
}

async function createAgent(client: GymRequestClient): Promise<string> {
    let catalog = (await client.get("/v0/admin/agentImages")).json() as {
        defaultImageId?: string;
        images: Array<{ builtinKey?: string; id: string; status: string }>;
    };
    const image = catalog.images.find(({ builtinKey }) => builtinKey === "daycare-minimal");
    if (!image) throw new Error("Daycare Minimal image was not seeded");
    if (image.status !== "ready") {
        expect(
            (await client.post(`/v0/admin/agentImages/${image.id}/buildImage`, {})).statusCode,
        ).toBe(202);
        await waitFor(async () => {
            catalog = (await client.get("/v0/admin/agentImages")).json() as typeof catalog;
            return catalog.images.find(({ id }) => id === image.id)?.status === "ready";
        }, "agent image build");
    }
    expect(
        (await client.post(`/v0/admin/agentImages/${image.id}/setDefaultImage`, {})).statusCode,
    ).toBe(200);
    const created = await client.post("/v0/chats/createAgent", {
        name: "Release reviewer",
        username: "plugin_release_reviewer",
    });
    expect(created.statusCode).toBe(201);
    return created.json().chat.id as string;
}

async function waitForMessages(
    client: GymRequestClient,
    chatId: string,
    count: number,
): Promise<void> {
    await waitFor(
        async () =>
            ((await client.get(`/v0/chats/${chatId}/messages`)).json().messages as unknown[])
                .length >= count,
        `${count} chat messages`,
    );
}

async function waitFor(
    check: () => boolean | Promise<boolean>,
    description: string,
    timeoutMs = 5_000,
): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await check()) return;
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`Timed out waiting for ${description}`);
}
