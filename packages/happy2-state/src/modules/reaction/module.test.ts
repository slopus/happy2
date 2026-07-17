import { describe, expect, it, vi } from "vitest";
import type { StateRuntime } from "../runtime/stateRuntime.js";
import { chatStoreCreateBinding } from "../chat/chatStore.js";
import { IdentityCatalog } from "../identity/identityCatalog.js";
import { message } from "../../../tests/fixtures.js";
import type { MessageActionContext } from "../message/messageActionContext.js";
import { reactionAdd } from "./reactionAdd.js";
import { reactionRemove } from "./reactionRemove.js";

describe("reaction module", () => {
    it("routes emoji and custom-emoji selectors and keeps actor IDs out of message projections", async () => {
        const chat = chatStoreCreateBinding("chat-1");
        const reacted = message({
            reactions: [
                { key: "emoji:👍", emoji: "👍", count: 1, reacted: true, userIds: ["user-2"] },
            ],
        });
        const operation = vi.fn().mockResolvedValue({ message: reacted });
        const context = {
            runtime: { operation } as unknown as StateRuntime,
            identities: new IdentityCatalog(),
            chatGet: () => chat,
            composerGet: () => undefined,
            chatPinsReconcile: vi.fn(),
        } satisfies MessageActionContext;
        await reactionAdd(context, "chat-1", "message-1", { emoji: "👍" });
        await reactionRemove(context, "chat-1", "message-1", { customEmojiId: "emoji-1" });
        expect(operation.mock.calls.map(([, input]) => input)).toEqual([
            { messageId: "message-1", emoji: "👍" },
            { messageId: "message-1", customEmojiId: "emoji-1" },
        ]);
        expect(chat.store.get().messages[0]?.message.reactions[0]).toEqual({
            key: "emoji:👍",
            emoji: "👍",
            count: 1,
            reacted: true,
        });
        chat.dispose();
    });
});
