import { describe, expect, it, vi } from "vitest";
import type { StateRuntime } from "../runtime/stateRuntime.js";
import { chatStoreCreateBinding } from "../chat/chatStore.js";
import { composerStoreCreateBinding } from "../composer/composerStore.js";
import { IdentityCatalog } from "../identity/identityCatalog.js";
import { message } from "../../../tests/fixtures.js";
import type { MessageActionContext } from "./messageActionContext.js";
import { messageDelete } from "./messageDelete.js";
import { messageEdit } from "./messageEdit.js";
import { messagePin } from "./messagePin.js";
import { messageSend } from "./messageSend.js";
import { messageUnpin } from "./messageUnpin.js";

describe("message module", () => {
    it("optimistically sends then confirms into already materialized chat/composer stores", async () => {
        const chat = chatStoreCreateBinding("chat-1");
        const composer = composerStoreCreateBinding("chat-1");
        composer.store.textUpdate("hello");
        composer.store.textSubmit();
        const revision = composer.store.get().revision;
        const pending: Promise<void>[] = [];
        const operation = vi.fn().mockResolvedValue({ message: message() });
        const runtime = {
            createId: () => "mutation-1",
            now: () => 0,
            operation,
            background: (task: Promise<void>) => pending.push(task),
        } as unknown as StateRuntime;
        const pins = vi.fn();
        const context: MessageActionContext = {
            runtime,
            identities: new IdentityCatalog(),
            chatGet: () => chat,
            composerGet: () => composer,
            chatPinsReconcile: pins,
        };
        expect(messageSend(context, "chat-1", { text: "hello" }, revision)).toBeUndefined();
        expect(chat.store.get().messages[0]).toMatchObject({
            source: "local",
            delivery: "sending",
        });
        await Promise.all(pending);
        expect(chat.store.get().messages[0]).toMatchObject({ source: "server", delivery: "sent" });
        expect(composer.store.get().text).toBe("");
        await messageEdit(context, "chat-1", "message-1", "edited", 1);
        await messageDelete(context, "chat-1", "message-1");
        await messagePin(context, "chat-1", "message-1");
        await messageUnpin(context, "chat-1", "message-1");
        expect(pins).toHaveBeenCalledTimes(2);
        expect(operation.mock.calls.map(([name]) => name)).toEqual([
            "sendMessage",
            "editMessage",
            "deleteMessage",
            "pinMessage",
            "unpinMessage",
        ]);
        chat.dispose();
        composer.dispose();
    });

    it("keeps failed optimistic content and reports the displayable error", async () => {
        const chat = chatStoreCreateBinding("chat-1");
        const pending: Promise<void>[] = [];
        const context = {
            runtime: {
                createId: () => "mutation-1",
                now: () => 0,
                operation: vi.fn().mockRejectedValue(new Error("offline")),
                background: (task: Promise<void>) => pending.push(task.catch(() => undefined)),
            } as unknown as StateRuntime,
            identities: new IdentityCatalog(),
            chatGet: () => chat,
            composerGet: () => undefined,
            chatPinsReconcile: vi.fn(),
        } satisfies MessageActionContext;
        messageSend(context, "chat-1", { text: "retry me" });
        await Promise.all(pending);
        expect(chat.store.get().messages[0]).toMatchObject({
            delivery: "failed",
            error: { message: "offline" },
        });
        chat.dispose();
    });
});
