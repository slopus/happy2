import { describe, expect, it, vi } from "vitest";
import { UserError } from "../../types.js";
import { workspaceListingAssertDirectory } from "./workspaceState.js";
import { workspaceStoreCreate } from "./workspaceState.js";
import type { StateRuntime } from "../runtime/runtimeState.js";
import { IdentityCatalog } from "../identity/identityState.js";
import { workspaceDirectoriesUpdate } from "./workspaceState.js";
import { workspaceDirectoryMore } from "./workspaceState.js";
import { workspaceLoad } from "./workspaceState.js";
import { workspaceReconcile } from "./workspaceState.js";

describe("workspace module", () => {
    it("normalizes requested directories and keeps local failures in the store", () => {
        const output = vi.fn();
        const binding = workspaceStoreCreate("chat-1", output);
        binding.getState().directoriesUpdate(["src", "docs", "src"]);
        binding.getState().directoryMore("src");
        expect(binding.getState().requestedDirectories).toEqual(["docs", "src"]);
        expect(output.mock.calls.map(([event]) => event)).toEqual([
            { type: "directoriesUpdated", chatId: "chat-1", directories: ["docs", "src"] },
            { type: "directoryMoreRequested", chatId: "chat-1", directory: "src" },
        ]);
        binding
            .getState()
            .workspaceInput({ type: "workspaceFailed", error: new UserError("failed") });
        expect(binding.getState().status.type).toBe("error");
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
    });

    it("pages and revalidates a retained workspace record", async () => {
        const binding = workspaceStoreCreate("chat-1");
        const read = vi
            .fn()
            .mockResolvedValueOnce({
                notModified: false,
                etag: "etag-1",
                workspace: listing({ unloadedDirectories: ["src"] }),
            })
            .mockResolvedValueOnce({
                notModified: false,
                workspace: listing({
                    directory: "src",
                    paths: ["src/a.ts"],
                    nextCursor: "cursor",
                }),
            })
            .mockResolvedValueOnce({
                notModified: false,
                workspace: listing({ directory: "src", paths: ["src/b.ts"], revision: "2" }),
            })
            .mockResolvedValueOnce({
                notModified: false,
                etag: "etag-3",
                workspace: listing({ paths: ["README.md"], revision: "3" }),
            })
            .mockResolvedValueOnce({
                notModified: false,
                workspace: listing({
                    directory: "src",
                    paths: ["src/a.ts"],
                    nextCursor: "cursor-2",
                    revision: "3",
                }),
            })
            .mockResolvedValueOnce({
                notModified: false,
                workspace: listing({ directory: "src", paths: ["src/b.ts"], revision: "3" }),
            });
        const context = {
            runtime: { read } as unknown as StateRuntime,
            identities: new IdentityCatalog(),
            workspaceGet: () => binding,
        };
        await workspaceLoad(context, "chat-1");
        await workspaceDirectoriesUpdate(context, "chat-1", ["src"]);
        await workspaceDirectoryMore(context, "chat-1", "src");
        expect(binding.getState().status).toMatchObject({
            type: "ready",
            value: { paths: ["src/a.ts", "src/b.ts"] },
        });
        await workspaceReconcile(context, "chat-1");
        expect(binding.getState().status).toMatchObject({
            type: "ready",
            value: { revision: "3", paths: ["README.md", "src/a.ts", "src/b.ts"] },
        });
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
