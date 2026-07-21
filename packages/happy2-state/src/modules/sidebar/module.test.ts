import { describe, expect, it } from "vitest";
import { chat } from "../../../tests/fixtures.js";
import { IdentityCatalog } from "../identity/identityState.js";
import { StateRuntime } from "../runtime/runtimeState.js";
import { SidebarChatsProjector, sidebarStoreCreate } from "./sidebarState.js";

describe("sidebar module", () => {
    it("orders, replaces, removes, and structurally shares chat summary projections", () => {
        const binding = sidebarStoreCreate();
        const first = projection("chat-1", 1);
        const second = projection("chat-2", 2);
        binding.getState().sidebarInput({
            type: "sidebarLoaded",
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

    it("filters child chats at the projection boundary", async () => {
        const projector = new SidebarChatsProjector(new StateRuntime({}), new IdentityCatalog());
        const parent = chat({ id: "parent" });
        const child = chat({ id: "child", parentMessageId: "message-1", followed: true });

        await expect(projector.project([parent, child])).resolves.toEqual([
            expect.objectContaining({ id: "parent" }),
        ]);
        await expect(projector.projectOne(child)).resolves.toBeUndefined();
    });
});

function projection(id: string, sequence: number) {
    const summary = chat({ id, lastMessageSequence: String(sequence) });
    return { id, chat: summary, displayName: id, participants: [] };
}
