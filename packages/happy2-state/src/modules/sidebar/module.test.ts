import { describe, expect, it } from "vitest";
import { chat } from "../../../tests/fixtures.js";
import { IdentityCatalog } from "../identity/identityState.js";
import { StateRuntime } from "../runtime/runtimeState.js";
import { createFakeServer, jsonResponse } from "../../testing/index.js";
import { SidebarChatsProjector, sidebarProjectsLoad, sidebarStoreCreate } from "./sidebarState.js";

describe("sidebar module", () => {
    it("orders, replaces, removes, and structurally shares chat summary projections", () => {
        const binding = sidebarStoreCreate();
        const first = projection("chat-1", 1);
        const second = projection("chat-2", 2);
        binding.getState().sidebarInput({
            type: "sidebarLoaded",
            projects: [],
            chats: [first, second],
            sync: { protocolVersion: 1, generation: "g", sequence: "1" },
        });
        const loaded = binding.getState();
        binding.getState().sidebarInput({
            type: "chatSummariesReconciled",
            changedChats: [first],
            removedChatIds: [],
            sync: loaded.sync!,
        });
        expect(binding.getState()).toBe(loaded);
        const changed = projection("chat-1", 3);
        binding.getState().sidebarInput({ type: "chatSummaryUpserted", chat: changed });
        expect(binding.getState().chats.map(({ id }) => id)).toEqual(["chat-1", "chat-2"]);
        expect(binding.getState().chats[1]).toBe(second);
        binding.getState().sidebarInput({ type: "chatSummaryRemoved", chatId: "chat-1" });
        expect(binding.getState().chats).toEqual([second]);
    });

    it("drops a chat carried in reconciled removedChatIds while sharing the unaffected sibling", () => {
        const binding = sidebarStoreCreate();
        const departed = projection("chat-1", 1);
        const sibling = projection("chat-2", 2);
        binding.getState().sidebarInput({
            type: "sidebarLoaded",
            projects: [],
            chats: [departed, sibling],
            sync: { protocolVersion: 1, generation: "g", sequence: "1" },
        });
        const loaded = binding.getState();
        binding.getState().sidebarInput({
            type: "chatSummariesReconciled",
            changedChats: [],
            removedChatIds: ["chat-1"],
            sync: loaded.sync!,
        });
        expect(binding.getState().chats.map(({ id }) => id)).toEqual(["chat-2"]);
        expect(binding.getState().chats[0]).toBe(sibling);
    });

    it("projects first-class child channels alongside their parent", async () => {
        const projector = new SidebarChatsProjector(new StateRuntime({}), new IdentityCatalog());
        const parent = chat({ id: "parent" });
        const child = chat({ id: "child", parentChatId: "parent" });

        await expect(projector.project([parent, child])).resolves.toEqual([
            expect.objectContaining({ id: "parent" }),
            expect.objectContaining({ id: "child" }),
        ]);
        await expect(projector.projectOne(child)).resolves.toEqual(
            expect.objectContaining({ id: "child" }),
        );
    });

    it("reconciles project-area reads without replacing unaffected chat projections", async () => {
        const server = createFakeServer();
        server.respond(
            "GET",
            "/v0/projects",
            jsonResponse(200, {
                projects: [
                    {
                        id: "project-1",
                        name: "Launch",
                        isDefault: false,
                        syncSequence: "3",
                        createdAt: "now",
                        updatedAt: "now",
                    },
                ],
            }),
        );
        const binding = sidebarStoreCreate();
        const retained = projection("chat-1", 1);
        binding.getState().sidebarInput({
            type: "sidebarLoaded",
            projects: [],
            chats: [retained],
            sync: { protocolVersion: 1, generation: "g", sequence: "1" },
        });
        const runtime = new StateRuntime({ transport: server.transport });

        await sidebarProjectsLoad({ runtime, sidebar: binding });

        expect(binding.getState().projects).toMatchObject([{ id: "project-1", name: "Launch" }]);
        expect(binding.getState().chats[0]).toBe(retained);
    });
});

function projection(id: string, sequence: number) {
    const summary = chat({ id, lastMessageSequence: String(sequence) });
    return { id, chat: summary, displayName: id, participants: [] };
}
