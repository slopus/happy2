import { describe, expect, it } from "vitest";
import { PluginError } from "../types.js";
import { mcpAppResourceInput, mcpAppToolUi, mcpAppToolVisibleTo } from "./mcpApp.js";

describe("MCP Apps tool metadata", () => {
    it("defaults ordinary and UI-bearing tools to model and app visibility", () => {
        expect(mcpAppToolUi(undefined)).toEqual({ visibility: ["model", "app"] });
        expect(mcpAppToolUi({ ui: { resourceUri: "ui://catalog/movie.html" } })).toEqual({
            resourceUri: "ui://catalog/movie.html",
            visibility: ["model", "app"],
        });
    });

    it("accepts the deprecated flat resource URI while preferring the nested value", () => {
        expect(mcpAppToolUi({ "ui/resourceUri": "ui://legacy/movie.html" })).toMatchObject({
            resourceUri: "ui://legacy/movie.html",
        });
        expect(
            mcpAppToolUi({
                ui: { resourceUri: "ui://current/movie.html" },
                "ui/resourceUri": "ui://legacy/movie.html",
            }).resourceUri,
        ).toBe("ui://current/movie.html");
    });

    it("enforces model and app visibility independently", () => {
        const meta = { ui: { visibility: ["app"] } };
        expect(mcpAppToolVisibleTo(meta, "model")).toBe(false);
        expect(mcpAppToolVisibleTo(meta, "app")).toBe(true);
    });

    it.each([
        { ui: null },
        { ui: { resourceUri: "https://example.com/app.html" } },
        { ui: { resourceUri: 42 } },
        { ui: { visibility: "app" } },
        { ui: { visibility: ["app", "app"] } },
        { ui: { visibility: ["other"] } },
    ])("rejects malformed extension metadata %#", (meta) => {
        expect(() => mcpAppToolUi(meta)).toThrow(PluginError);
    });
});

describe("MCP Apps resource metadata", () => {
    it("normalizes declared CSP, permissions, domain, and border preference", () => {
        expect(
            mcpAppResourceInput("ui://catalog/movie.html", "<main></main>", "abc", {
                ui: {
                    csp: {
                        connectDomains: ["https://catalog.example.com"],
                        resourceDomains: ["https://*.images.example.com"],
                        frameDomains: ["https://trailers.example.com"],
                        baseUriDomains: ["https://movies.example.com"],
                    },
                    permissions: { clipboardWrite: {} },
                    domain: "https://movies.example.com",
                    prefersBorder: true,
                },
            }),
        ).toMatchObject({
            csp: {
                connectDomains: ["https://catalog.example.com"],
                resourceDomains: ["https://*.images.example.com"],
                frameDomains: ["https://trailers.example.com"],
                baseUriDomains: ["https://movies.example.com"],
            },
            permissions: { clipboardWrite: {} },
            domain: "https://movies.example.com",
            prefersBorder: true,
        });
    });

    it.each([
        { ui: { csp: { connectDomains: ["https://example.com/path"] } } },
        { ui: { csp: { resourceDomains: ["data:"] } } },
        { ui: { csp: { frameDomains: ["javascript:alert(1)"] } } },
        { ui: { permissions: { camera: { mode: "always" } } } },
        { ui: { permissions: { filesystem: {} } } },
        { ui: { domain: "http://example.com" } },
        { ui: { prefersBorder: "yes" } },
    ])("rejects unsafe resource metadata %#", (meta) => {
        expect(() =>
            mcpAppResourceInput("ui://catalog/movie.html", "<main></main>", "abc", meta),
        ).toThrow(PluginError);
    });
});
