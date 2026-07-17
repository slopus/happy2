import { describe, expect, it, vi } from "vitest";
import { UserError } from "../../types.js";
import { workspaceListingAssertDirectory } from "./workspaceStore.js";
import { workspaceStoreCreateBinding } from "./workspaceStore.js";
import { createWorkspaceRecord, setWorkspaceDirectory } from "../../workspace.js";
import type { StateRuntime } from "../runtime/stateRuntime.js";
import { IdentityCatalog } from "../identity/identityCatalog.js";
import { workspaceDirectoryMore } from "./workspaceDirectoryMore.js";
import { workspaceReconcile } from "./workspaceReconcile.js";

describe("workspace module", () => {
    it("normalizes requested directories, serializes work, and releases private records", async () => {
        const output = vi.fn();
        const binding = workspaceStoreCreateBinding("chat-1", output);
        binding.store.directoriesUpdate(["src", "docs", "src"]);
        binding.store.directoryMore("src");
        expect(binding.store.get().requestedDirectories).toEqual(["docs", "src"]);
        expect(output.mock.calls.map(([event]) => event)).toEqual([
            { type: "directoriesUpdated", chatId: "chat-1", directories: ["docs", "src"] },
            { type: "directoryMoreRequested", chatId: "chat-1", directory: "src" },
        ]);
        const order: number[] = [];
        await Promise.all([
            binding.serialize(async () => {
                await Promise.resolve();
                order.push(1);
            }),
            binding.serialize(async () => order.push(2)),
        ]);
        expect(order).toEqual([1, 2]);
        binding.workspaceInput({ type: "workspaceFailed", error: new UserError("failed") });
        expect(binding.store.get().status.type).toBe("error");
        expect(() =>
            workspaceListingAssertDirectory(
                {
                    directory: "wrong",
                    paths: [],
                    gitStatus: [],
                    revision: "1",
                    unloadedDirectories: [],
                    gitStatusPending: false,
                },
                "src",
            ),
        ).toThrow("mismatched");
        binding.record = {} as never;
        binding.initialEtag = "etag";
        binding.dispose();
        expect(binding.record).toBeUndefined();
        expect(binding.initialEtag).toBeUndefined();
    });

    it("pages and revalidates a retained workspace record", async () => {
        const binding = workspaceStoreCreateBinding("chat-1");
        const initial = listing({ unloadedDirectories: ["src"] });
        binding.record = setWorkspaceDirectory(createWorkspaceRecord(initial, "etag-1"), "src", {
            pages: [listing({ directory: "src", nextCursor: "cursor" })],
        });
        binding.initialEtag = "etag-1";
        const read = vi
            .fn()
            .mockResolvedValueOnce({
                notModified: false,
                etag: "etag-2",
                workspace: listing({ directory: "src", paths: ["src/a.ts"], revision: "2" }),
            })
            .mockResolvedValueOnce({
                notModified: false,
                etag: "etag-3",
                workspace: listing({ paths: ["README.md"], revision: "3" }),
            })
            .mockResolvedValueOnce({
                notModified: false,
                workspace: listing({ directory: "src", paths: ["src/a.ts"], revision: "3" }),
            });
        const context = {
            runtime: { read } as unknown as StateRuntime,
            identities: new IdentityCatalog(),
            workspaceGet: () => binding,
        };
        await workspaceDirectoryMore(context, "chat-1", "src");
        expect(binding.record.directories.get("src")?.pages).toHaveLength(2);
        await workspaceReconcile(context, "chat-1");
        expect(binding.store.get().status).toMatchObject({
            type: "ready",
            value: { revision: "3", paths: ["README.md", "src/a.ts"] },
        });
        binding.dispose();
    });
});

function listing(overrides: Record<string, unknown> = {}) {
    return {
        paths: [],
        gitStatus: [],
        revision: "1",
        unloadedDirectories: [],
        gitStatusPending: false,
        ...overrides,
    } as never;
}
