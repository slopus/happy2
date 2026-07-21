import { describe, expect, it } from "vitest";
import { pluginResourceLinkInputs } from "./pluginResourceLink.js";

describe("plugin MCP resource links", () => {
    it("keeps bounded card metadata and classifies browser pages as shared links", () => {
        expect(
            pluginResourceLinkInputs({
                content: [
                    { type: "text", text: "ignored" },
                    {
                        type: "resource_link",
                        uri: "https://example.com/shared",
                        name: "Shared page",
                        title: "A useful page",
                        description: "Shared by the plugin.",
                        mimeType: "text/html; charset=utf-8",
                        size: 2048,
                        _meta: { ignored: true },
                    },
                    {
                        type: "resource_link",
                        uri: "file:///tmp/report.pdf",
                        name: "report.pdf",
                        mimeType: "application/pdf",
                    },
                ],
            }),
        ).toEqual([
            {
                position: 0,
                kind: "shared_link",
                uri: "https://example.com/shared",
                name: "Shared page",
                title: "A useful page",
                description: "Shared by the plugin.",
                mimeType: "text/html; charset=utf-8",
                size: 2048,
            },
            {
                position: 1,
                kind: "resource",
                uri: "file:///tmp/report.pdf",
                name: "report.pdf",
                mimeType: "application/pdf",
            },
        ]);
    });

    it("suppresses failed results and skips malformed card metadata without failing the tool", () => {
        expect(
            pluginResourceLinkInputs({
                isError: true,
                content: [{ type: "resource_link", uri: "https://example.com", name: "Ignored" }],
            }),
        ).toEqual([]);
        expect(
            pluginResourceLinkInputs({
                content: [
                    {
                        type: "resource_link",
                        uri: "https://example.com",
                        name: "Invalid size",
                        size: -1,
                    },
                    { type: "resource_link", uri: "not a uri", name: "Broken link" },
                    {
                        type: "resource_link",
                        uri: "https://example.com/valid",
                        name: "Valid link",
                    },
                ],
            }),
        ).toEqual([
            {
                position: 0,
                kind: "shared_link",
                uri: "https://example.com/valid",
                name: "Valid link",
            },
        ]);
    });

    it("clamps successful results to the bounded card count", () => {
        expect(
            pluginResourceLinkInputs({
                content: Array.from({ length: 25 }, (_, index) => ({
                    type: "resource_link",
                    uri: `https://example.com/${index}`,
                    name: `Link ${index}`,
                })),
            }),
        ).toHaveLength(24);
    });
});
