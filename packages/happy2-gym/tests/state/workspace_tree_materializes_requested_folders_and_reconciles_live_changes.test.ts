import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { happyStateCreate, type WorkspaceFileStore, type WorkspaceStore } from "happy2-state";
import { describe, expect, it } from "vitest";
import { createMockRigDaemon, MockAgentSandboxRuntime } from "happy2-gym/rig";
import { createGymServer, type GymRequestClient } from "../../sources/index.js";
import { createGymStateTransport } from "../../sources/state/index.js";

describe("live workspace trees through happy2-state", () => {
    it("materializes requested folders in a direct chat and reconciles SSE hints", async () => {
        await using rig = await createMockRigDaemon();
        await using server = await createGymServer({
            agentSandbox: new MockAgentSandboxRuntime(),
            configure(config) {
                config.agents.enabled = true;
                config.agents.socketPath = rig.socketPath;
                config.agents.tokenPath = rig.tokenPath;
                config.agents.defaultCwd = rig.workspaceRoot;
            },
        });
        const owner = await server.createUser({ username: "state_workspace_owner" });
        await configureAgentImage(server.as(owner));
        const transport = await createGymStateTransport(server, owner);
        await using state = happyStateCreate({ transport, sleep: async () => undefined });
        await state.syncStart();
        await transport.whenConnected();
        await state.agentCreate({
            name: "State Workspace",
            username: "state_workspace_agent",
        });
        const chatId = state
            .sidebar()
            .get()
            .chats.find(({ displayName }) => displayName === "State Workspace")?.id;
        if (!chatId) throw new Error("State Workspace chat was not materialized");
        const directory = rig.createdCwds.at(-1);
        if (!directory) throw new Error("Rig workspace was not created");

        using workspace = state.workspaceOpen(chatId);
        workspace.directoriesUpdate([]);
        await state.whenIdle();
        expect(workspaceValue(workspace).paths).toEqual([]);

        await Promise.all([
            mkdir(join(directory, "node_modules", "package"), { recursive: true }),
            mkdir(join(directory, "src"), { recursive: true }),
        ]);
        await Promise.all([
            writeFile(join(directory, "node_modules", "package", "index.js"), "old\n"),
            writeFile(join(directory, "src", "live.ts"), "export const live = true;\n"),
        ]);

        await expect
            .poll(() => workspaceValue(workspace).paths, { timeout: 3_000 })
            .toEqual(["node_modules/", "src/", "src/live.ts"]);
        expect(workspaceValue(workspace).unloadedDirectories).toContain("node_modules/");

        workspace.directoriesUpdate(["node_modules/", "node_modules/package/"]);
        await state.whenIdle();
        expect(workspaceValue(workspace).paths).toEqual([
            "node_modules/",
            "node_modules/package/",
            "node_modules/package/index.js",
            "src/",
            "src/live.ts",
        ]);

        await writeFile(join(directory, "node_modules", "package", "new.js"), "new\n");
        await expect
            .poll(() => workspaceValue(workspace).paths, { timeout: 3_000 })
            .toContain("node_modules/package/new.js");

        workspace.directoriesUpdate([]);
        await state.whenIdle();
        expect(workspaceValue(workspace).paths).toEqual(["node_modules/", "src/", "src/live.ts"]);
        expect(workspaceValue(workspace).directories).toEqual([]);

        // The retained editor keeps its own base while another process changes a separate region.
        using editor = state.workspaceFileOpen(chatId, "src/live.ts");
        await state.whenIdle();
        const opened = workspaceFileValue(editor);
        if (!opened) throw new Error("Workspace editor did not load");
        await writeFile(join(directory, "src", "live.ts"), `// external\n${opened.content}`);
        editor.contentUpdate(opened.content.replace("true", "false"));
        editor.contentSave();
        await state.whenIdle();
        const saved = workspaceFileValue(editor);
        expect(saved?.content).toBe("// external\nexport const live = false;\n");
        await expect(readFile(join(directory, "src", "live.ts"), "utf8")).resolves.toBe(
            saved?.content,
        );

        // Rewriting identical contents changes filesystem metadata. Deletion detects
        // that conflict, confirms contents are unchanged, and safely retries.
        await writeFile(join(directory, "src", "live.ts"), saved!.content);
        editor.fileDelete();
        await state.whenIdle();
        await expect(readFile(join(directory, "src", "live.ts"), "utf8")).rejects.toMatchObject({
            code: "ENOENT",
        });
    });
});

function workspaceValue(store: WorkspaceStore) {
    const status = store.get().status;
    if (status.type !== "ready")
        throw new Error(`Expected ready workspace, received ${status.type}`);
    return status.value;
}

function workspaceFileValue(store: WorkspaceFileStore) {
    const file = store.get().file;
    return file.type === "ready" ? file.value : undefined;
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
