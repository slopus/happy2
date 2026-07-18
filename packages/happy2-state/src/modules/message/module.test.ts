import { describe, expect, it, vi } from "vitest";
import type { StateRuntime } from "../runtime/runtimeState.js";
import { chatStoreCreate } from "../chat/chatState.js";
import { composerStoreCreate } from "../composer/composerState.js";
import { IdentityCatalog } from "../identity/identityState.js";
import { message } from "../../../tests/fixtures.js";
import type { MessageActionContext } from "./messageState.js";
import { messageDelete } from "./messageState.js";
import { messageEdit } from "./messageState.js";
import { messagePin } from "./messageState.js";
import { messageSend } from "./messageState.js";
import { messageUnpin } from "./messageState.js";

describe("message module", () => {
    it("optimistically sends then confirms into already materialized chat/composer stores", async () => {
        const chat = chatStoreCreate("chat-1");
        const composer = composerStoreCreate("chat-1");
        composer.getState().textUpdate("hello");
        composer.getState().textSubmit();
        const revision = composer.getState().revision;
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
        expect(chat.getState().messages[0]).toMatchObject({
            source: "local",
            delivery: "sending",
        });
        await Promise.all(pending);
        expect(chat.getState().messages[0]).toMatchObject({ source: "server", delivery: "sent" });
        expect(composer.getState().text).toBe("");
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
    });

    it("keeps failed optimistic content and reports the displayable error", async () => {
        const chat = chatStoreCreate("chat-1");
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
        expect(chat.getState().messages[0]).toMatchObject({
            delivery: "failed",
            error: { message: "offline" },
        });
    });
});
