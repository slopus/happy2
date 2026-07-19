import { describe, expect, it } from "vitest";
import { installedManifest } from "./installedManifest.js";

describe("installedManifest", () => {
    it("rejects null and structurally incomplete persisted manifests", () => {
        expect(() => installedManifest("null")).toThrow("Installed plugin manifest is unreadable");
        expect(() =>
            installedManifest(
                JSON.stringify({
                    schemaVersion: 1,
                    version: "1.0.0",
                    displayName: "Broken",
                    shortName: "broken",
                    description: "Broken manifest",
                    variables: [],
                    mcp: { type: "remote", url: "https://example.com", headers: null },
                }),
            ),
        ).toThrow("Installed plugin manifest is unreadable");
    });

    it("accepts the channel-management host capability", () => {
        expect(
            installedManifest(
                JSON.stringify({
                    schemaVersion: 1,
                    version: "1.0.0",
                    displayName: "Channels",
                    shortName: "channels",
                    description: "Manages channels",
                    variables: [],
                    container: {
                        args: [],
                        permissions: ["channels:manage"],
                    },
                }),
            ).container?.permissions,
        ).toEqual(["channels:manage"]);
    });
});
