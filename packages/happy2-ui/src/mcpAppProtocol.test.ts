import { describe, expect, it } from "vitest";
import {
    McpAppMethod,
    MCP_APP_PROTOCOL_VERSION,
    buildAppCsp,
    buildAppDocument,
    buildAppSandbox,
    buildSandboxProxyUrl,
    isSandboxMethod,
    jsonRpcError,
    jsonRpcNotification,
    jsonRpcRequest,
    jsonRpcResult,
} from "./mcpAppProtocol";

describe("mcpAppProtocol", () => {
    it("uses the final 2026-01-26 method strings", () => {
        expect(MCP_APP_PROTOCOL_VERSION).toBe("2026-01-26");
        expect(McpAppMethod).toMatchObject({
            initialize: "ui/initialize",
            initialized: "ui/notifications/initialized",
            toolInput: "ui/notifications/tool-input",
            toolResult: "ui/notifications/tool-result",
            sizeChanged: "ui/notifications/size-changed",
            toolsCall: "tools/call",
            resourcesRead: "resources/read",
            openLink: "ui/open-link",
            log: "notifications/message",
            ping: "ping",
            resourceTeardown: "ui/resource-teardown",
            sandboxProxyReady: "ui/notifications/sandbox-proxy-ready",
            sandboxResourceReady: "ui/notifications/sandbox-resource-ready",
        });
    });

    it("classifies reserved sandbox notifications", () => {
        expect(isSandboxMethod(McpAppMethod.sandboxProxyReady)).toBe(true);
        expect(isSandboxMethod(McpAppMethod.sandboxResourceReady)).toBe(true);
        expect(isSandboxMethod(McpAppMethod.initialized)).toBe(false);
        expect(isSandboxMethod(McpAppMethod.toolInput)).toBe(false);
    });

    it("builds the restrictive default CSP when no metadata is declared", () => {
        const csp = buildAppCsp(undefined);
        expect(csp).toContain("default-src 'none'");
        expect(csp).toContain("script-src 'self' 'unsafe-inline'");
        expect(csp).toContain("style-src 'self' 'unsafe-inline'");
        expect(csp).toContain("connect-src 'none'");
        expect(csp).toContain("frame-src 'none'");
        expect(csp).toContain("base-uri 'self'");
        expect(csp).toContain("object-src 'none'");
    });

    it("separates static resource, connect, frame, and base-uri domains", () => {
        const csp = buildAppCsp({
            connectDomains: ["https://api.example.com"],
            resourceDomains: ["https://cdn.example.com"],
            frameDomains: ["https://embed.example.com"],
            baseUriDomains: ["https://base.example.com"],
        });
        expect(csp).toContain("script-src 'self' 'unsafe-inline' https://cdn.example.com");
        expect(csp).toContain("connect-src https://api.example.com");
        expect(csp).toContain("frame-src https://embed.example.com");
        expect(csp).toContain("base-uri https://base.example.com");
        // Static resource origins must not leak into the network (connect) directive.
        expect(csp).not.toContain("connect-src https://cdn.example.com");
    });

    it("drops CSP origins that are not valid http/ws origins", () => {
        const csp = buildAppCsp({
            connectDomains: ["javascript:alert(1)", "https://ok.example.com"],
        });
        expect(csp).toContain("connect-src https://ok.example.com");
        expect(csp).not.toContain("javascript:");
    });

    it("injects the enforced CSP as the first meta of the inner document", () => {
        const doc = buildAppDocument("<main>app</main>", { connectDomains: ["https://api.x.com"] });
        expect(doc.startsWith('<!doctype html><meta http-equiv="Content-Security-Policy"')).toBe(
            true,
        );
        expect(doc).toContain("connect-src https://api.x.com");
        expect(doc.endsWith("<main>app</main>")).toBe(true);
    });

    it("builds the sandbox proxy as an opaque-origin data: URL carrying the reserved protocol", () => {
        const url = buildSandboxProxyUrl("https://happy.example.com");
        expect(url.startsWith("data:text/html,")).toBe(true);
        const doc = decodeURIComponent(url.slice("data:text/html,".length));
        expect(doc).toContain("ui/notifications/sandbox-proxy-ready");
        expect(doc).toContain("ui/notifications/sandbox-resource-ready");
        expect(doc).toContain("https://happy.example.com");
        // The proxy document carries its own restrictive CSP.
        expect(doc).toContain('http-equiv="Content-Security-Policy"');
        expect(doc).toContain("default-src 'none'");
    });

    it("supports opaque/file hosts with source-window auth and wildcard targeting", () => {
        const decode = (url: string) => decodeURIComponent(url.slice("data:text/html,".length));
        const opaque = decode(buildSandboxProxyUrl("null"));
        expect(opaque).toContain('var HOST="null"');
        // Opaque hosts skip origin validation (source-window only) and target "*".
        expect(opaque).toContain('var OPAQUE=(HOST==="null"||!HOST)');
        expect(opaque).toContain('var TARGET=OPAQUE?"*":HOST');
        expect(opaque).toContain("!OPAQUE&&e.origin!==HOST");
        expect(opaque).toContain("window.parent.postMessage(e.data,TARGET)");
        // A real http(s) origin keeps exact origin validation and targeting.
        const real = decode(buildSandboxProxyUrl("https://happy.example.com"));
        expect(real).toContain('var HOST="https://happy.example.com"');
        // An untrusted inner View cannot spoof reserved sandbox-control messages
        // to the host: inner->host relay drops methods beginning SANDBOX_PREFIX.
        expect(opaque).toContain("var im=e.data;");
        expect(opaque).toContain("im.method.indexOf(SANDBOX_PREFIX)===0");
    });

    it("keeps the inner View sandbox at allow-scripts allow-same-origin", () => {
        expect(buildAppSandbox()).toBe("allow-scripts allow-same-origin");
    });

    it("builds well-formed JSON-RPC envelopes", () => {
        expect(jsonRpcResult(1, { ok: true })).toEqual({
            jsonrpc: "2.0",
            id: 1,
            result: { ok: true },
        });
        expect(jsonRpcError("x", -32001, "no")).toEqual({
            jsonrpc: "2.0",
            id: "x",
            error: { code: -32001, message: "no" },
        });
        expect(jsonRpcNotification("m", { a: 1 })).toEqual({
            jsonrpc: "2.0",
            method: "m",
            params: { a: 1 },
        });
        expect(jsonRpcRequest("t-0", "ui/resource-teardown", {})).toEqual({
            jsonrpc: "2.0",
            id: "t-0",
            method: "ui/resource-teardown",
            params: {},
        });
    });
});
