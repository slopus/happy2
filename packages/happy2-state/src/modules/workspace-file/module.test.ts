import { describe, expect, it, vi } from "vitest";
import { UserError } from "../../types.js";
import { textPatchApply, textPatchFromContents, textPatchRebase } from "./textPatch.js";
import { workspaceFileStoreCreateBinding } from "./workspaceFileStore.js";
import type { StateRuntime } from "../runtime/stateRuntime.js";
import { workspaceFileDelete } from "./workspaceFileDelete.js";

describe("workspace file module", () => {
    it("tracks local edits through save, conflict, and delete transitions", () => {
        const output = vi.fn();
        const binding = workspaceFileStoreCreateBinding("chat-1", "src/a.ts", output);
        binding.workspaceFileInput({ type: "fileLoaded", file: file("one", "v1") });
        binding.store.contentUpdate("two");
        binding.store.contentSave();
        binding.store.fileDelete();
        expect(output.mock.calls.map(([event]) => event.type)).toEqual([
            "contentSaveRequested",
            "fileDeleteRequested",
        ]);
        binding.workspaceFileInput({ type: "contentSaving" });
        binding.store.contentUpdate("three");
        binding.workspaceFileInput({
            type: "contentSaved",
            file: file("two", "v2"),
            submittedContent: "two",
        });
        expect(binding.store.get()).toMatchObject({
            content: "three",
            saveState: { type: "dirty" },
        });
        binding.workspaceFileInput({
            type: "contentConflict",
            error: new UserError("conflict"),
            currentFile: file("remote", "v3"),
        });
        expect(binding.store.get().saveState.type).toBe("conflict");
        binding.workspaceFileInput({ type: "fileDeleted" });
        expect(binding.store.get()).toMatchObject({ content: "", file: { type: "unloaded" } });
        binding.dispose();
    });

    it("deletes with one explicit idempotency key and reconciles the retained tree", async () => {
        const binding = workspaceFileStoreCreateBinding("chat-1", "src/a.ts");
        binding.workspaceFileInput({ type: "fileLoaded", file: file("one", "v1") });
        const operationWithIdempotencyKey = vi.fn().mockResolvedValue({ removed: true });
        const workspaceReconcile = vi.fn();
        await workspaceFileDelete(
            {
                runtime: {
                    createId: () => "delete-1",
                    operationWithIdempotencyKey,
                } as unknown as StateRuntime,
                workspaceFileGet: () => binding,
                workspaceReconcile,
            },
            "chat-1",
            "src/a.ts",
        );
        expect(operationWithIdempotencyKey).toHaveBeenCalledWith(
            "deleteWorkspaceFile",
            "delete-1",
            { chatId: "chat-1", path: "src/a.ts", expectedVersion: "v1" },
        );
        expect(binding.store.get().file.type).toBe("unloaded");
        expect(workspaceReconcile).toHaveBeenCalledWith("chat-1");
        binding.dispose();
    });

    it("applies, derives, rebases, and rejects invalid text patches", () => {
        const patch = textPatchFromContents("hello world", "hello Happy");
        expect(textPatchApply("hello world", patch)).toBe("hello Happy");
        expect(
            textPatchRebase("abc", "xabc", { edits: [{ start: 3, end: 3, text: "!" }] }),
        ).toEqual({ edits: [{ start: 4, end: 4, text: "!" }] });
        expect(
            textPatchRebase("abc", "axc", { edits: [{ start: 1, end: 2, text: "y" }] }),
        ).toBeUndefined();
        expect(() => textPatchApply("abc", { edits: [{ start: 3, end: 2, text: "bad" }] })).toThrow(
            "sorted",
        );
    });
});

function file(content: string, version: string) {
    return { path: "src/a.ts", content, size: content.length, version };
}
