/*
 * MCP Apps host bridge protocol (io.modelcontextprotocol/ui, extension protocol
 * pinned to 2026-01-26). This module is the single, isolated home for the exact
 * postMessage JSON-RPC dialect the host speaks, plus the security primitives
 * (CSP, sandbox tokens, permissions policy, and the double-iframe sandbox-proxy
 * document). Method strings and payload shapes here are the spec's final names —
 * see `.context/ext-apps/specification/2026-01-26/apps.mdx` and the reference
 * `AppBridge` / sandbox proxy in `.context/ext-apps`.
 *
 * Transport: bare JSON-RPC 2.0 objects delivered via `window.postMessage`,
 * relayed transparently by the sandbox proxy for every method that does not
 * begin `ui/notifications/sandbox-`. The host authenticates the proxy by exact
 * source-window identity (the proxy has an opaque origin) and never gives the
 * untrusted View same-origin access to Happy.
 */

export const MCP_APP_PROTOCOL_VERSION = "2026-01-26";
export const SUPPORTED_MCP_APP_PROTOCOL_VERSIONS = [MCP_APP_PROTOCOL_VERSION];
export const MCP_APP_RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";
export const MCP_APP_EXTENSION_ID = "io.modelcontextprotocol/ui";

/**
 * Final JSON-RPC method names in the host<->View dialect (extension 2026-01-26).
 * `ui/`-prefixed methods are app-specific; `tools/call`, `resources/read`,
 * `notifications/message`, and `ping` are shared with core MCP.
 */
export const McpAppMethod = {
    /** View -> host handshake request. */
    initialize: "ui/initialize",
    /** View -> host notification once it has processed the initialize result. */
    initialized: "ui/notifications/initialized",
    /** Host -> View notification carrying the complete tool input arguments. */
    toolInput: "ui/notifications/tool-input",
    /** Host -> View notification carrying the standard MCP CallToolResult. */
    toolResult: "ui/notifications/tool-result",
    /** View -> host request to run a server tool (shared MCP method). */
    toolsCall: "tools/call",
    /** View -> host request to read a server resource (shared MCP method). */
    resourcesRead: "resources/read",
    /** View -> host notification when its content size changes. */
    sizeChanged: "ui/notifications/size-changed",
    /** View -> host request to open an external link through the host. */
    openLink: "ui/open-link",
    /** View -> host logging notification (shared MCP `notifications/message`). */
    log: "notifications/message",
    /** View -> host connection health check (shared MCP `ping`). */
    ping: "ping",
    /** Host -> View request for graceful shutdown before the frame is removed. */
    resourceTeardown: "ui/resource-teardown",
    /** View -> host request to change its display mode (inline/fullscreen/pip). */
    requestDisplayMode: "ui/request-display-mode",
    /** Host -> View notification carrying a partial HostContext update. */
    hostContextChanged: "ui/notifications/host-context-changed",
    /** View -> host Happy vendor request to open a predeclared app instance. */
    appOpen: "happy2/app-open",
    /** Sandbox proxy -> host: the proxy is ready to receive View HTML. */
    sandboxProxyReady: "ui/notifications/sandbox-proxy-ready",
    /** Host -> sandbox proxy: the View HTML resource to load. */
    sandboxResourceReady: "ui/notifications/sandbox-resource-ready",
} as const;

const SANDBOX_METHOD_PREFIX = "ui/notifications/sandbox-";

export type McpAppLogLevel =
    | "debug"
    | "info"
    | "notice"
    | "warning"
    | "error"
    | "critical"
    | "alert"
    | "emergency";

export interface McpAppLogEntry {
    readonly level: McpAppLogLevel;
    readonly data: unknown;
    readonly logger?: string;
}

export interface McpAppSize {
    readonly width?: number;
    readonly height?: number;
}

/** The permissions an MCP App resource may request (validated server-side). */
export interface McpAppPermissions {
    readonly camera?: Readonly<Record<string, never>>;
    readonly microphone?: Readonly<Record<string, never>>;
    readonly geolocation?: Readonly<Record<string, never>>;
    readonly clipboardWrite?: Readonly<Record<string, never>>;
}

export interface McpAppCsp {
    readonly connectDomains?: readonly string[];
    readonly resourceDomains?: readonly string[];
    readonly frameDomains?: readonly string[];
    readonly baseUriDomains?: readonly string[];
}

/** Host capabilities advertised in the initialize result (spec shape). */
export interface McpAppHostCapabilities {
    readonly openLinks?: Readonly<Record<string, never>>;
    readonly serverTools?: Readonly<Record<string, never>>;
    readonly serverResources?: Readonly<Record<string, never>>;
    readonly logging?: Readonly<Record<string, never>>;
    readonly sandbox?: {
        readonly permissions?: McpAppPermissions;
        readonly csp?: McpAppCsp;
    };
}

// ---- JSON-RPC envelope validation --------------------------------------

export interface JsonRpcRequest {
    readonly jsonrpc: "2.0";
    readonly id: string | number;
    readonly method: string;
    readonly params?: unknown;
}

export interface JsonRpcNotification {
    readonly jsonrpc: "2.0";
    readonly method: string;
    readonly params?: unknown;
}

export type JsonRpcInbound = JsonRpcRequest | JsonRpcNotification;

export function isJsonRpcMessage(value: unknown): value is JsonRpcInbound {
    if (!value || typeof value !== "object") return false;
    const record = value as Record<string, unknown>;
    return record.jsonrpc === "2.0" && typeof record.method === "string";
}

export function isJsonRpcRequest(value: JsonRpcInbound): value is JsonRpcRequest {
    const id = (value as JsonRpcRequest).id;
    return typeof id === "string" || typeof id === "number";
}

export function isSandboxMethod(method: string): boolean {
    return method.startsWith(SANDBOX_METHOD_PREFIX);
}

export function jsonRpcResult(id: string | number, result: unknown): object {
    return { jsonrpc: "2.0", id, result };
}

export function jsonRpcError(id: string | number, code: number, message: string): object {
    return { jsonrpc: "2.0", id, error: { code, message } };
}

export function jsonRpcNotification(method: string, params: unknown): object {
    return { jsonrpc: "2.0", method, params };
}

export function jsonRpcRequest(id: string | number, method: string, params: unknown): object {
    return { jsonrpc: "2.0", id, method, params };
}

/** JSON-RPC error codes the host returns to the View. */
export const McpAppErrorCode = {
    methodNotFound: -32601,
    invalidParams: -32602,
    /** A privileged request arrived before `ui/notifications/initialized`. */
    notInitialized: -32001,
    /** Capability withheld by the host (no handler advertised). */
    forbidden: -32002,
    /** The proxied tool/resource call failed on the server. */
    upstreamFailed: -32003,
    /** The View requested an unsupported protocol version. */
    unsupportedProtocol: -32004,
} as const;

// ---- Security: CSP, sandbox, permissions policy -------------------------

const CSP_ORIGIN = /^(?:https?|wss?):\/\/(?:\*\.)?[a-z0-9.-]+(?::\d{1,5})?$/i;

function safeOrigins(values: readonly string[] | undefined): string[] {
    // Defense in depth: the server already validated these, but the host must
    // not splice an attacker-influenced value into a CSP directive unchecked.
    return (values ?? []).filter((value) => CSP_ORIGIN.test(value));
}

/**
 * Builds the Content-Security-Policy the inner View document must enforce,
 * following the spec's restrictive default (`default-src 'none'`) and only
 * widening a directive to the origins the resource metadata declared. Static
 * resources (`resourceDomains`) and network connections (`connectDomains`) stay
 * separated; `frame-src` uses `frameDomains` or `'none'`, and `base-uri` uses
 * `baseUriDomains` or the secure `'self'` default. Framing plugins, and form
 * hijacking stay blocked so a compromised View cannot pivot out of its sandbox.
 */
export function buildAppCsp(csp: McpAppCsp | undefined): string {
    const resource = safeOrigins(csp?.resourceDomains).join(" ");
    const connect = safeOrigins(csp?.connectDomains).join(" ");
    const frame = safeOrigins(csp?.frameDomains).join(" ");
    const base = safeOrigins(csp?.baseUriDomains).join(" ");
    const withResource = (base0: string) => (resource ? `${base0} ${resource}` : base0);
    const directives = [
        "default-src 'none'",
        withResource("script-src 'self' 'unsafe-inline'"),
        withResource("style-src 'self' 'unsafe-inline'"),
        withResource("img-src 'self' data: blob:"),
        withResource("font-src 'self' data:"),
        withResource("media-src 'self' data: blob:"),
        `connect-src ${connect || "'none'"}`,
        `frame-src ${frame || "'none'"}`,
        "object-src 'none'",
        `base-uri ${base || "'self'"}`,
    ];
    return directives.join("; ");
}

/**
 * The sandbox token set for the inner View frame. `allow-scripts` runs the
 * bundled app; `allow-same-origin` lets the srcdoc View share the proxy's
 * opaque origin (isolated from Happy) so the proxy-enforced CSP applies. The
 * View still cannot reach Happy's origin, storage, or the top window.
 */
export function buildAppSandbox(): string {
    return "allow-scripts allow-same-origin";
}

/**
 * The Permissions-Policy `allow` attribute for the inner View frame, derived
 * only from the permissions the resource metadata requested.
 */
export function buildAppAllow(permissions: McpAppPermissions | undefined): string {
    if (!permissions) return "";
    const features: string[] = [];
    if (permissions.camera) features.push("camera");
    if (permissions.microphone) features.push("microphone");
    if (permissions.geolocation) features.push("geolocation");
    if (permissions.clipboardWrite) features.push("clipboard-write");
    return features.join("; ");
}

function escapeAttribute(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/**
 * Wraps the untrusted View HTML so the host-enforced CSP is the first thing the
 * parser sees. The View HTML is inserted verbatim; the sandbox proxy loads this
 * document into the inner frame, where the meta CSP governs every subresource.
 */
export function buildAppDocument(html: string, csp: McpAppCsp | undefined): string {
    const policy = buildAppCsp(csp);
    return `<!doctype html><meta http-equiv="Content-Security-Policy" content="${escapeAttribute(
        policy,
    )}">${html}`;
}

/**
 * Builds the Happy-owned outer **sandbox proxy** document as a `data:text/html`
 * URL. A data URL yields an opaque origin distinct from Happy (the spec requires
 * different origins), so with `allow-scripts allow-same-origin` the proxy runs
 * its relay without inheriting Happy's origin — unlike a `srcdoc` proxy, which
 * would inherit Happy's origin and is unsafe. The proxy carries its own
 * restrictive CSP, authenticates the host by the baked-in host origin, creates
 * the inner View frame from a `ui/notifications/sandbox-resource-ready`
 * notification, and relays every non-`ui/notifications/sandbox-` message
 * between host and View. It never synthesizes its own requests.
 *
 * The host origin may be opaque — production desktop loads Happy with
 * `BrowserWindow.loadFile`, so `window.location.origin` is `"null"`, which is
 * not a usable `postMessage` target. When the host origin is opaque the proxy
 * authenticates the host purely by `event.source === window.parent` and targets
 * `"*"`; for a real http(s) origin it keeps exact origin validation and
 * targeting.
 */
export function buildSandboxProxyUrl(hostOrigin: string): string {
    const origin = JSON.stringify(hostOrigin);
    // `style-src 'unsafe-inline'` is required only for the host-owned reset
    // <style> below; it does not relax the inner View's separate CSP, which is
    // built independently in `buildAppDocument`. The proxy document contains no
    // untrusted content, so allowing its own inline style is sound.
    const proxyCsp =
        "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-src 'self' blob:;";
    // Host-owned full-height reset. The outer host frame fills its panel region
    // and the inner View frame is sized `height:100%`, but that only resolves if
    // the proxy's own html/body establish a full-height containing block. Without
    // it the inner frame collapses to its intrinsic ~content height, leaving the
    // rest of the panel blank. This resets the proxy document only; it never
    // injects CSS into the untrusted MCP app document.
    const reset =
        `<style>html,body{width:100%;height:100%;margin:0;padding:0;` +
        `overflow:hidden;background:transparent;}</style>`;
    const doc =
        `<!doctype html><meta charset="utf-8">` +
        `<meta http-equiv="Content-Security-Policy" content="${escapeAttribute(proxyCsp)}">` +
        `<title>MCP App sandbox</title>${reset}<body><script>` +
        `(function(){` +
        `var HOST=${origin};var OPAQUE=(HOST==="null"||!HOST);var TARGET=OPAQUE?"*":HOST;` +
        `var SANDBOX_PREFIX=${JSON.stringify(SANDBOX_METHOD_PREFIX)};` +
        `var READY=${JSON.stringify(McpAppMethod.sandboxProxyReady)};` +
        `var LOAD=${JSON.stringify(McpAppMethod.sandboxResourceReady)};` +
        `var inner=null;` +
        `function allowAttr(p){if(!p)return "";var a=[];` +
        `if(p.camera)a.push("camera");if(p.microphone)a.push("microphone");` +
        `if(p.geolocation)a.push("geolocation");if(p.clipboardWrite)a.push("clipboard-write");` +
        `return a.join("; ");}` +
        `window.addEventListener("message",function(e){` +
        `if(e.source===window.parent){` +
        `if(!OPAQUE&&e.origin!==HOST)return;` +
        `var d=e.data;if(!d||typeof d.method!=="string"){if(inner&&inner.contentWindow)inner.contentWindow.postMessage(d,"*");return;}` +
        `if(d.method===LOAD){mount(d.params||{});return;}` +
        `if(d.method.indexOf(SANDBOX_PREFIX)===0)return;` +
        `if(inner&&inner.contentWindow)inner.contentWindow.postMessage(d,"*");return;}` +
        // An untrusted inner View must not spoof reserved sandbox-control
        // notifications to the host: drop any inner message whose method begins
        // with the sandbox prefix; relay everything else unchanged.
        `if(inner&&e.source===inner.contentWindow){var im=e.data;` +
        `if(im&&typeof im.method==="string"&&im.method.indexOf(SANDBOX_PREFIX)===0)return;` +
        `window.parent.postMessage(e.data,TARGET);}` +
        `});` +
        `function mount(cfg){if(inner)return;inner=document.createElement("iframe");` +
        `inner.setAttribute("title","MCP App");` +
        `inner.setAttribute("sandbox",typeof cfg.sandbox==="string"?cfg.sandbox:"allow-scripts allow-same-origin");` +
        `var al=allowAttr(cfg.permissions);if(al)inner.setAttribute("allow",al);` +
        `inner.style.cssText="border:0;width:100%;height:100%;display:block;background:transparent";` +
        `document.body.appendChild(inner);` +
        `var html=typeof cfg.html==="string"?cfg.html:"";` +
        // document.write into the same-origin about:blank inner avoids the
        // srcdoc/frame-src edge case; fall back to srcdoc if it is unavailable.
        `try{var d=inner.contentDocument||inner.contentWindow.document;d.open();d.write(html);d.close();}` +
        `catch(err){inner.srcdoc=html;}}` +
        `window.parent.postMessage({jsonrpc:"2.0",method:READY,params:{}},TARGET);` +
        `})();` +
        `</script></body>`;
    return `data:text/html,${encodeURIComponent(doc)}`;
}
