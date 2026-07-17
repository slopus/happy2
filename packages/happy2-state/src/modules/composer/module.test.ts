import { describe, expect, it, vi } from "vitest";
import { UserError } from "../../types.js";
import { composerStoreCreateBinding } from "./composerStore.js";
import { composerOutputRoute } from "./composerOutputRoute.js";

describe("composer module", () => {
    it("applies local actions synchronously, emits typed output, and ignores stale outcomes", () => {
        const output = vi.fn();
        const binding = composerStoreCreateBinding("chat-1", { output });
        binding.store.textUpdate("hello");
        binding.store.attachmentAdd({ id: "file-1", name: "a.txt", size: 3 });
        binding.store.attachmentAdd({ id: "file-1", name: "duplicate", size: 9 });
        binding.store.attachmentRemove("missing");
        binding.store.textSubmit();
        const revision = binding.store.get().revision;
        expect(binding.store.get()).toMatchObject({
            text: "hello",
            attachments: [{ id: "file-1" }],
            submission: { status: "pending", revision },
        });
        expect(output.mock.calls.map(([event]) => event.type)).toEqual([
            "textUpdated",
            "attachmentAdded",
            "textSubmitted",
        ]);
        binding.composerInput({
            type: "submissionFailed",
            revision: revision - 1,
            error: new UserError("stale"),
        });
        expect(binding.store.get().submission.status).toBe("pending");
        binding.composerInput({ type: "submissionConfirmed", revision });
        expect(binding.store.get()).toMatchObject({
            text: "",
            attachments: [],
            submission: { status: "idle" },
        });
        binding.dispose();
        binding.store.textUpdate("ignored");
        expect(binding.store.get().text).toBe("");
    });

    it("routes draft and submit integration without mutating another store itself", () => {
        const draftUpdated = vi.fn();
        const composerOutput = vi.fn();
        const messageSend = vi.fn();
        const context = {
            composerGet: () => undefined,
            draftUpdated,
            composerOutput,
            messageSend,
        };
        composerOutputRoute(context, { type: "textUpdated", scopeId: "chat-1", text: "draft" });
        composerOutputRoute(context, {
            type: "textSubmitted",
            scopeId: "chat-1",
            text: "send",
            attachments: [{ id: "file-1", name: "a", size: 1 }],
            revision: 2,
        });
        composerOutputRoute(context, {
            type: "attachmentRemoved",
            scopeId: "chat-1",
            attachmentId: "file-1",
        });
        expect(draftUpdated).toHaveBeenCalledWith({ scopeId: "chat-1", text: "draft" });
        expect(messageSend).toHaveBeenCalledWith(
            "chat-1",
            { text: "send", attachmentFileIds: ["file-1"] },
            2,
        );
        expect(composerOutput).toHaveBeenCalledTimes(3);
    });
});
