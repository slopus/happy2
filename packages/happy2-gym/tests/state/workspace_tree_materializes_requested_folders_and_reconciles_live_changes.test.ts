import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClientState } from "happy2-state";
import { describe, expect, it } from "vitest";
import { createGymServer } from "../../sources/index.js";
import { createGymStateTransport } from "../../sources/state/index.js";

describe("live workspace trees through happy2-state", () => {
    it("materializes only requested folders and reconciles their files from SSE hints", async () => {
        const root = await mkdtemp(join(tmpdir(), "happy2-state-workspace-"));
        try {
            await using server = await createGymServer({
                configure(config) {
                    config.agents.defaultCwd = root;
                },
            });
            const owner = await server.createUser({ username: "state_workspace_owner" });
            const channel = await server.as(owner).post("/v0/chats/createChannel", {
                kind: "private_channel",
                name: "State workspace",
                slug: "state-workspace",
            });
            const chatId = channel.json().chat.id as string;
            const directory = join(root, "channels", chatId);
            const transport = await createGymStateTransport(server, owner);
            await using state = createClientState(transport, { sleep: async () => undefined });
            await state.start();
            await transport.whenConnected();

            const empty = await state.syncWorkspace(chatId, []);
            expect(empty.paths).toEqual([]);

            await Promise.all([
                mkdir(join(directory, "node_modules", "package"), { recursive: true }),
                mkdir(join(directory, "src"), { recursive: true }),
            ]);
            await Promise.all([
                writeFile(join(directory, "node_modules", "package", "index.js"), "old\n"),
                writeFile(join(directory, "src", "live.ts"), "export const live = true;\n"),
            ]);

            await expect
                .poll(() => state.get().workspacesByChat[chatId]?.paths, { timeout: 3_000 })
                .toEqual(["node_modules/", "src/", "src/live.ts"]);
            expect(state.get().workspacesByChat[chatId]?.unloadedDirectories).toContain(
                "node_modules/",
            );

            const expanded = await state.syncWorkspace(chatId, [
                "node_modules/",
                "node_modules/package/",
            ]);
            expect(expanded.paths).toEqual([
                "node_modules/",
                "node_modules/package/",
                "node_modules/package/index.js",
                "src/",
                "src/live.ts",
            ]);

            await writeFile(join(directory, "node_modules", "package", "new.js"), "new\n");
            await expect
                .poll(() => state.get().workspacesByChat[chatId]?.paths, { timeout: 3_000 })
                .toContain("node_modules/package/new.js");

            const collapsed = await state.syncWorkspace(chatId, []);
            expect(collapsed.paths).toEqual(["node_modules/", "src/", "src/live.ts"]);
            expect(collapsed.directories).toEqual([]);
        } finally {
            await rm(root, { force: true, recursive: true });
        }
    });
});
