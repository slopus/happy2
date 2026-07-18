import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { localRuntimePaths } from "./paths.js";

describe("local runtime paths", () => {
    it("keeps the private Rig home with the local Happy runtime by default", () => {
        expect(localRuntimePaths("/workspace/happy", {})).toMatchObject({
            rigDirectory: "/workspace/happy/.happy2/rig",
            runtimeDirectory: "/workspace/happy/.happy2",
        });
    });

    it("uses an absolute RIG_HOME for private Rig configuration and state", () => {
        expect(localRuntimePaths("/workspace/happy", { RIG_HOME: "/private/rig" })).toMatchObject({
            filesDirectory: join("/workspace/happy", ".happy2", "files"),
            pluginsDirectory: join("/workspace/happy", ".happy2", "plugins"),
            rigDirectory: "/private/rig",
            workspacesDirectory: join("/workspace/happy", ".happy2", "workspaces"),
        });
    });

    it("rejects a relative RIG_HOME before starting Rig", () => {
        expect(() => localRuntimePaths("/workspace/happy", { RIG_HOME: "relative/rig" })).toThrow(
            "RIG_HOME must be an absolute path.",
        );
    });
});
