import { symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createMockRigDaemon, MockAgentDockerRuntime } from "happy2-gym/rig";
import { createGymServer, type GymRequestClient } from "../../sources/index.js";

interface TextFile {
    path: string;
    content: string;
    size: number;
    version: string;
}

describe("versioned workspace file editing", () => {
    it("creates, reads, patches, conflict-checks, and deletes the mounted Rig files", async () => {
        await using rig = await createMockRigDaemon();
        await using server = await createGymServer({
            agentDocker: new MockAgentDockerRuntime(),
            configure(config) {
                config.agents.enabled = true;
                config.agents.socketPath = rig.socketPath;
                config.agents.tokenPath = rig.tokenPath;
                config.agents.defaultCwd = rig.workspaceRoot;
            },
        });
        const owner = await server.createUser({ username: "workspace_editor_owner" });
        const outsider = await server.createUser({ username: "workspace_editor_outsider" });
        const asOwner = server.as(owner);
        await configureAgentImage(asOwner);
        const createdAgent = await asOwner.post("/v0/chats/createAgent", {
            name: "Workspace Editor",
            username: "workspace_editor_agent",
        });
        expect(createdAgent.statusCode).toBe(201);
        const chatId = createdAgent.json().chat.id as string;
        const workspace = rig.createdCwds.at(-1);
        if (!workspace) throw new Error("Rig workspace was not created");
        const fileEndpoint = `/v0/chats/${chatId}/workspace/file`;
        const writeEndpoint = `/v0/chats/${chatId}/workspace/writeFile`;
        const deleteEndpoint = `/v0/chats/${chatId}/workspace/deleteFile`;
        const path = "editor.ts";

        expect((await server.get(`${fileEndpoint}?path=${path}`)).statusCode).toBe(401);
        expect((await server.as(outsider).get(`${fileEndpoint}?path=${path}`)).statusCode).toBe(
            404,
        );
        expect((await asOwner.get(`${fileEndpoint}?path=${path}`)).statusCode).toBe(404);

        const createBody = {
            path,
            expectedVersion: null,
            content: "export const answer = 41;\n",
        };
        const created = await asOwner.post(writeEndpoint, createBody, {
            headers: { "idempotency-key": "create-editor-file" },
        });
        expect(created.statusCode).toBe(201);
        expect(created.json().file).toMatchObject({
            path,
            size: Buffer.byteLength(createBody.content),
            created: true,
            version: expect.stringMatching(/^\d{20,}\.[a-f0-9]{64}$/u),
        });
        const firstVersion = created.json().file.version as string;

        const replay = await asOwner.post(writeEndpoint, createBody, {
            headers: { "idempotency-key": "create-editor-file" },
        });
        expect(replay.statusCode).toBe(201);
        expect(replay.headers["idempotency-replayed"]).toBe("true");
        expect(replay.json()).toEqual(created.json());

        const first = textFile(await asOwner.get(`${fileEndpoint}?path=${path}`));
        expect(first).toEqual({
            path,
            content: createBody.content,
            size: Buffer.byteLength(createBody.content),
            version: firstVersion,
        });

        const patched = await asOwner.post(
            writeEndpoint,
            {
                path,
                expectedVersion: first.version,
                patch: { edits: [{ start: 22, end: 24, text: "42" }] },
            },
            { headers: { "idempotency-key": "patch-editor-file" } },
        );
        expect(patched.statusCode).toBe(200);
        expect(patched.json().file).toMatchObject({ path, created: false });
        const secondVersion = patched.json().file.version as string;
        expect(secondVersion).not.toBe(first.version);
        expect(textFile(await asOwner.get(`${fileEndpoint}?path=${path}`))).toMatchObject({
            content: "export const answer = 42;\n",
            version: secondVersion,
        });

        const staleWrite = await asOwner.post(
            writeEndpoint,
            { path, expectedVersion: first.version, content: "stale\n" },
            { headers: { "idempotency-key": "stale-editor-write" } },
        );
        expect(staleWrite.statusCode).toBe(409);
        expect(staleWrite.json()).toMatchObject({
            error: "workspace_file_conflict",
            currentVersion: secondVersion,
        });

        await writeFile(join(workspace, path), "external change\n");
        const externalConflict = await asOwner.post(
            writeEndpoint,
            { path, expectedVersion: secondVersion, content: "would overwrite\n" },
            { headers: { "idempotency-key": "external-editor-conflict" } },
        );
        expect(externalConflict.statusCode).toBe(409);
        const external = textFile(await asOwner.get(`${fileEndpoint}?path=${path}`));
        expect(external.content).toBe("external change\n");
        expect(external.version).toBe(externalConflict.json().currentVersion);

        const invalidPatch = await asOwner.post(
            writeEndpoint,
            {
                path,
                expectedVersion: external.version,
                patch: {
                    edits: [
                        { start: 1, end: 3, text: "one" },
                        { start: 2, end: 4, text: "two" },
                    ],
                },
            },
            { headers: { "idempotency-key": "invalid-editor-patch" } },
        );
        expect(invalidPatch.statusCode).toBe(400);
        expect(invalidPatch.json().error).toBe("invalid_workspace_patch");

        const staleDelete = await asOwner.post(
            deleteEndpoint,
            { path, expectedVersion: secondVersion },
            { headers: { "idempotency-key": "stale-editor-delete" } },
        );
        expect(staleDelete.statusCode).toBe(409);
        expect(staleDelete.json().currentVersion).toBe(external.version);

        const deleted = await asOwner.post(
            deleteEndpoint,
            { path, expectedVersion: external.version },
            { headers: { "idempotency-key": "delete-editor-file" } },
        );
        expect(deleted.statusCode).toBe(200);
        expect(deleted.json().file).toEqual({ path, deletedVersion: external.version });
        expect((await asOwner.get(`${fileEndpoint}?path=${path}`)).statusCode).toBe(404);
        const deleteReplay = await asOwner.post(
            deleteEndpoint,
            { path, expectedVersion: external.version },
            { headers: { "idempotency-key": "delete-editor-file" } },
        );
        expect(deleteReplay.statusCode).toBe(200);
        expect(deleteReplay.headers["idempotency-replayed"]).toBe("true");

        expect(
            (
                await asOwner.post(
                    writeEndpoint,
                    { path: "missing/file.ts", expectedVersion: null, content: "no parent\n" },
                    { headers: { "idempotency-key": "missing-editor-parent" } },
                )
            ).statusCode,
        ).toBe(404);
        expect((await asOwner.get(`${fileEndpoint}?path=..%2Foutside`)).statusCode).toBe(404);

        await writeFile(join(workspace, "binary.dat"), Buffer.from([0xff, 0xfe, 0xfd]));
        const binary = await asOwner.get(`${fileEndpoint}?path=binary.dat`);
        expect(binary.statusCode).toBe(415);
        expect(binary.json().error).toBe("workspace_file_not_text");

        const outside = join(rig.workspaceRoot, "outside.txt");
        await writeFile(outside, "outside\n");
        await symlink(outside, join(workspace, "outside-link"));
        expect((await asOwner.get(`${fileEndpoint}?path=outside-link`)).statusCode).toBe(404);

        const tooLarge = await asOwner.post(
            writeEndpoint,
            { path: "large.txt", expectedVersion: null, content: "x".repeat(4 * 1024 * 1024 + 1) },
            { headers: { "idempotency-key": "oversized-editor-file" } },
        );
        expect(tooLarge.statusCode).toBe(413);
        expect(tooLarge.json().error).toBe("workspace_file_too_large");
    }, 15_000);
});

function textFile(response: Awaited<ReturnType<GymRequestClient["get"]>>): TextFile {
    expect(response.statusCode).toBe(200);
    return response.json().file as TextFile;
}

async function configureAgentImage(client: GymRequestClient): Promise<void> {
    const images = (await client.get("/v0/admin/agentImages")).json().images as Array<{
        builtinKey?: string;
        id: string;
    }>;
    const image = images.find(({ builtinKey }) => builtinKey === "daycare-minimal");
    if (!image) throw new Error("Daycare Minimal image was not seeded");
    expect((await client.post(`/v0/admin/agentImages/${image.id}/buildImage`, {})).statusCode).toBe(
        202,
    );
    await expect
        .poll(
            async () => {
                const current = (await client.get("/v0/admin/agentImages")).json().images as Array<{
                    id: string;
                    status: string;
                }>;
                return current.find(({ id }) => id === image.id)?.status;
            },
            { timeout: 4_000 },
        )
        .toBe("ready");
    expect(
        (await client.post(`/v0/admin/agentImages/${image.id}/setDefaultImage`, {})).statusCode,
    ).toBe(200);
}
