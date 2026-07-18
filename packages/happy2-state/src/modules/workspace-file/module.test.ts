import { describe, expect, it, vi } from "vitest";
import { UserError } from "../../types.js";
import { textPatchApply, textPatchFromContents, textPatchRebase } from "./workspaceFileState.js";
import { workspaceFileStoreCreate } from "./workspaceFileState.js";
import type { StateRuntime } from "../runtime/runtimeState.js";
import { workspaceFileDelete } from "./workspaceFileState.js";
import { workspaceFileSave } from "./workspaceFileState.js";

describe("workspace file module", () => {
    it("tracks local edits through save, conflict, and delete transitions", () => {
        const output = vi.fn();
        const binding = workspaceFileStoreCreate("chat-1", "src/a.ts", output);
        binding.getState().workspaceFileInput({ type: "fileLoaded", file: file("one", "v1") });
        binding.getState().contentUpdate("two");
        binding.getState().contentSave();
        binding.getState().fileDelete();
        expect(output.mock.calls.map(([event]) => event.type)).toEqual([
            "contentSaveRequested",
            "fileDeleteRequested",
        ]);
        binding.getState().workspaceFileInput({ type: "contentSaving" });
        binding.getState().contentUpdate("three");
        binding.getState().workspaceFileInput({
            type: "contentSaved",
            file: file("two", "v2"),
            submittedContent: "two",
        });
        expect(binding.getState()).toMatchObject({
            content: "three",
            saveState: { type: "dirty" },
        });
        binding.getState().workspaceFileInput({
            type: "contentConflict",
            error: new UserError("conflict"),
            currentFile: file("remote", "v3"),
        });
        expect(binding.getState().saveState.type).toBe("conflict");
        binding.getState().workspaceFileInput({ type: "fileDeleted" });
        expect(binding.getState()).toMatchObject({ content: "", file: { type: "unloaded" } });
    });

    it("deletes with one explicit idempotency key and reconciles the retained tree", async () => {
        const binding = workspaceFileStoreCreate("chat-1", "src/a.ts");
        binding.getState().workspaceFileInput({ type: "fileLoaded", file: file("one", "v1") });
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
        expect(binding.getState().file.type).toBe("unloaded");
        expect(workspaceReconcile).toHaveBeenCalledWith("chat-1");
    });

    it("uses a new logical mutation key after an unchanged-content delete conflict", async () => {
        const binding = workspaceFileStoreCreate("chat-1", "src/a.ts");
        binding.getState().workspaceFileInput({ type: "fileLoaded", file: file("one", "v1") });
        const ids = ["delete-v1", "delete-v2"];
        const operationWithIdempotencyKey = vi
            .fn()
            .mockRejectedValueOnce(new UserError("conflict", "workspace_file_conflict"))
            .mockResolvedValueOnce({ removed: true });
        await workspaceFileDelete(
            {
                runtime: {
                    createId: () => ids.shift() ?? "unexpected",
                    operationWithIdempotencyKey,
                    operation: vi.fn().mockResolvedValue({ file: file("one", "v2") }),
                } as unknown as StateRuntime,
                workspaceFileGet: () => binding,
                workspaceReconcile: vi.fn(),
            },
            "chat-1",
            "src/a.ts",
        );
        expect(operationWithIdempotencyKey.mock.calls.map((call) => call[1])).toEqual([
            "delete-v1",
            "delete-v2",
        ]);
        expect(binding.getState().file.type).toBe("unloaded");
    });

    it("uses a new logical mutation key for a rebased save payload", async () => {
        const binding = workspaceFileStoreCreate("chat-1", "src/a.ts");
        binding
            .getState()
            .workspaceFileInput({ type: "fileLoaded", file: file("hello world", "v1") });
        binding.getState().contentUpdate("hello codex");
        const ids = ["save-v1", "save-v2"];
        const operationWithIdempotencyKey = vi
            .fn()
            .mockRejectedValueOnce(new UserError("conflict", "workspace_file_conflict"))
            .mockResolvedValueOnce({ file: { path: "src/a.ts", size: 18, version: "v3" } });
        await workspaceFileSave(
            {
                runtime: {
                    createId: () => ids.shift() ?? "unexpected",
                    operationWithIdempotencyKey,
                    operation: vi
                        .fn()
                        .mockResolvedValue({ file: file("header\nhello world", "v2") }),
                } as unknown as StateRuntime,
                workspaceFileGet: () => binding,
                workspaceReconcile: vi.fn(),
            },
            "chat-1",
            "src/a.ts",
        );
        expect(operationWithIdempotencyKey.mock.calls.map((call) => call[1])).toEqual([
            "save-v1",
            "save-v2",
        ]);
        expect(binding.getState()).toMatchObject({
            content: "header\nhello codex",
            saveState: { type: "clean" },
        });
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
