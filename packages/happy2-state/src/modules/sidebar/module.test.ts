import { describe, expect, it } from "vitest";
import { chat } from "../../../tests/fixtures.js";
import { sidebarStoreCreateBinding } from "./sidebarStore.js";

describe("sidebar module", () => {
    it("orders, replaces, removes, and structurally shares chat summary projections", () => {
        const binding = sidebarStoreCreateBinding();
        const first = projection("chat-1", 1);
        const second = projection("chat-2", 2);
        binding.sidebarInput({
            type: "sidebarLoaded",
            chats: [first, second],
            sync: { protocolVersion: 1, generation: "g", sequence: "1" },
        });
        const loaded = binding.store.get();
        binding.sidebarInput({
            type: "chatSummariesReconciled",
            changedChats: [first],
            removedChatIds: [],
            sync: loaded.sync!,
        });
        expect(binding.store.get()).toBe(loaded);
        const changed = projection("chat-1", 3);
        binding.sidebarInput({ type: "chatSummaryUpserted", chat: changed });
        expect(binding.store.get().chats.map(({ id }) => id)).toEqual(["chat-1", "chat-2"]);
        expect(binding.store.get().chats[1]).toBe(second);
        binding.sidebarInput({ type: "chatSummaryRemoved", chatId: "chat-1" });
        expect(binding.store.get().chats).toEqual([second]);
        binding.dispose();
    });
});

function projection(id: string, sequence: number) {
    const summary = chat({ id, lastMessageSequence: String(sequence) });
    return { id, chat: summary, displayName: id, participants: [] };
}
