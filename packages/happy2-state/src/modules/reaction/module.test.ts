import { describe, expect, it, vi } from "vitest";
import type { StateRuntime } from "../runtime/runtimeState.js";
import { chatStoreCreate } from "../chat/chatState.js";
import { IdentityCatalog } from "../identity/identityState.js";
import { message } from "../../../tests/fixtures.js";
import type { MessageActionContext } from "../message/messageState.js";
import { reactionAdd } from "./reactionState.js";
import { reactionRemove } from "./reactionState.js";

describe("reaction module", () => {
    it("routes emoji and custom-emoji selectors and keeps actor IDs out of message projections", async () => {
        const chat = chatStoreCreate("chat-1");
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
            draftTextUpdate: vi.fn(),
        } satisfies MessageActionContext;
        await reactionAdd(context, "chat-1", "message-1", { emoji: "👍" });
        await reactionRemove(context, "chat-1", "message-1", { customEmojiId: "emoji-1" });
        expect(operation.mock.calls.map(([, input]) => input)).toEqual([
            { messageId: "message-1", emoji: "👍" },
            { messageId: "message-1", customEmojiId: "emoji-1" },
        ]);
        expect(chat.getState().messages[0]?.message.reactions[0]).toEqual({
            key: "emoji:👍",
            emoji: "👍",
            count: 1,
            reacted: true,
        });
    });
});
