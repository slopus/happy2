import { describe, expect, it, vi } from "vitest";
import { UserError } from "../../types.js";
import { composerStoreCreate } from "./composerState.js";

describe("composer module", () => {
    it("applies local actions synchronously, emits typed output, and ignores stale outcomes", () => {
        const output = vi.fn();
        const binding = composerStoreCreate("chat-1", { output });
        binding.getState().textUpdate("hello");
        binding.getState().attachmentAdd({ id: "file-1", name: "a.txt", size: 3 });
        binding.getState().attachmentAdd({ id: "file-1", name: "duplicate", size: 9 });
        binding.getState().attachmentRemove("missing");
        binding.getState().textSubmit();
        const revision = binding.getState().revision;
        expect(binding.getState()).toMatchObject({
            text: "hello",
            attachments: [{ id: "file-1" }],
            submission: { status: "pending", revision },
        });
        expect(output.mock.calls.map(([event]) => event.type)).toEqual([
            "textUpdated",
            "attachmentAdded",
            "textSubmitted",
        ]);
        binding.getState().composerInput({
            type: "submissionFailed",
            revision: revision - 1,
            error: new UserError("stale"),
        });
        expect(binding.getState().submission.status).toBe("pending");
        binding.getState().composerInput({ type: "submissionConfirmed", revision });
        expect(binding.getState()).toMatchObject({
            text: "",
            attachments: [],
            submission: { status: "idle" },
        });
    });
});
