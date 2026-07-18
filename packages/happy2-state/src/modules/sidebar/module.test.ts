import { describe, expect, it } from "vitest";
import { chat } from "../../../tests/fixtures.js";
import { sidebarStoreCreate } from "./sidebarState.js";

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
});

function projection(id: string, sequence: number) {
    const summary = chat({ id, lastMessageSequence: String(sequence) });
    return { id, chat: summary, displayName: id, participants: [] };
}
