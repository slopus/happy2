import { useEffectEvent, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { McpAppResource, McpAppStatus } from "happy2-state";
import { Badge, type BadgeVariant } from "./Badge";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import { partitionComponentProps } from "./componentProps";
import {
    McpAppErrorCode,
    McpAppMethod,
    MCP_APP_PROTOCOL_VERSION,
    SUPPORTED_MCP_APP_PROTOCOL_VERSIONS,
    buildAppDocument,
    buildAppSandbox,
    buildSandboxProxyUrl,
    isJsonRpcMessage,
    isJsonRpcRequest,
    jsonRpcError,
    jsonRpcNotification,
    jsonRpcRequest,
    jsonRpcResult,
    type JsonRpcInbound,
    type JsonRpcNotification,
    type JsonRpcRequest,
    type McpAppHostCapabilities,
    type McpAppLogEntry,
    type McpAppLogLevel,
    type McpAppSize,
} from "./mcpAppProtocol";

/** The visual lifecycle of an MCP App surface: still fetching, running, done, or failed. */
export type McpAppShellStatus = "loading" | McpAppStatus;

export interface McpAppShellProps {
    className?: string;
    "data-testid"?: string;
    /** The tool that rendered this app, always shown in the header. */
    toolName: string;
    status: McpAppShellStatus;
    /** The snapshotted, validated UI resource; absent until the view has loaded. */
    resource?: McpAppResource;
    /** The complete tool input arguments delivered to the app after initialize. */
    arguments?: Readonly<Record<string, unknown>>;
    /** The stored CallToolResult delivered to the app after its input. */
    result?: Readonly<Record<string, unknown>>;
    /** A load or execution error message shown in place of the app frame. */
    error?: string;
    /** The default frame height before the app requests its own size. */
    height?: number;
    /** Proxies an app-initiated `tools/call`. Its presence advertises the capability. */
    onToolCall?(
        name: string,
        args: Readonly<Record<string, unknown>>,
    ): Promise<Record<string, unknown>>;
    /** Proxies an app-initiated `resources/read`. Its presence advertises the capability. */
    onResourceRead?(uri: string): Promise<Record<string, unknown>>;
    /** Handles an app request to open an external link. Its presence advertises the capability. */
    onOpenLink?(url: string): void;
    /** Receives app logging notifications. Its presence advertises the capability. */
    onLog?(entry: McpAppLogEntry): void;
    /** Receives app content size changes. Its presence advertises the capability. */
    onSizeChange?(size: McpAppSize): void;
    /** Retries loading a failed app view. */
    onReload?(): void;
}

type StatusChip = { variant: BadgeVariant; label: string; icon?: IconName };

const statusChips: Record<McpAppShellStatus, StatusChip> = {
    loading: { variant: "neutral", label: "LOADING" },
    in_progress: { variant: "info", label: "RUNNING" },
    completed: { variant: "success", label: "READY", icon: "check-circle" },
    failed: { variant: "danger", label: "FAILED" },
};

const DEFAULT_HEIGHT = 360;
const MIN_APP_HEIGHT = 120;
const MAX_APP_HEIGHT = 800;

/**
 * C-080 McpAppShell — host surface for one interactive MCP App attached to an
 * assistant message. It renders the loading, running, completed, and failed
 * states, and hosts the untrusted app HTML in the mandated double-iframe sandbox
 * (a Happy-owned `data:`-URL sandbox proxy on an opaque origin plus a sandboxed
 * inner View frame), bridging the MCP Apps postMessage JSON-RPC dialect between
 * them per the pinned 2026-01-26 extension.
 *
 * Props only: every privileged operation (tool calls, resource reads, link
 * opening, logging) is delegated to a callback supplied by the owner, so the
 * component holds no transport, tokens, or product state and renders standalone
 * in Blueprint and tests. Happy auth tokens are never placed in iframe data.
 */
export function McpAppShell(props: McpAppShellProps) {
    const [local] = partitionComponentProps(props, [
        "className",
        "data-testid",
        "toolName",
        "status",
        "resource",
        "arguments",
        "result",
        "error",
        "height",
        "onToolCall",
        "onResourceRead",
        "onOpenLink",
        "onLog",
        "onSizeChange",
        "onReload",
    ]);
    const chip = statusChips[local.status];
    const showFrame = local.resource !== undefined;
    const showError = !showFrame && (local.status === "failed" || local.error !== undefined);
    return (
        <div
            className={["happy2-mcp-app", local.className].filter(Boolean).join(" ")}
            data-happy2-ui="mcp-app"
            data-status={local.status}
            data-testid={local["data-testid"]}
        >
            <div className="happy2-mcp-app__header" data-happy2-ui="mcp-app-header">
                <span className="happy2-mcp-app__glyph" data-happy2-ui="mcp-app-glyph">
                    <Icon name="spark" size={14} />
                </span>
                <span className="happy2-mcp-app__title" data-happy2-ui="mcp-app-title">
                    {local.toolName}
                </span>
                <Badge
                    className="happy2-mcp-app__chip"
                    icon={chip.icon}
                    label={chip.label}
                    variant={chip.variant}
                />
            </div>
            {showFrame ? (
                <McpAppFrame
                    key={local.resource!.contentHashSha256}
                    resource={local.resource!}
                    toolName={local.toolName}
                    args={local.arguments}
                    result={local.result}
                    height={local.height ?? DEFAULT_HEIGHT}
                    onToolCall={local.onToolCall}
                    onResourceRead={local.onResourceRead}
                    onOpenLink={local.onOpenLink}
                    onLog={local.onLog}
                    onSizeChange={local.onSizeChange}
                />
            ) : showError ? (
                <div className="happy2-mcp-app__error" data-happy2-ui="mcp-app-error">
                    <span
                        className="happy2-mcp-app__error-text"
                        data-happy2-ui="mcp-app-error-text"
                    >
                        {local.error ?? "This interactive app could not be loaded."}
                    </span>
                    {local.onReload ? (
                        <Button onClick={() => local.onReload?.()} size="small" variant="secondary">
                            Try again
                        </Button>
                    ) : null}
                </div>
            ) : (
                <div className="happy2-mcp-app__loading" data-happy2-ui="mcp-app-loading">
                    <span className="happy2-mcp-app__spinner" data-happy2-ui="mcp-app-spinner" />
                    <span
                        className="happy2-mcp-app__loading-text"
                        data-happy2-ui="mcp-app-loading-text"
                    >
                        Preparing interactive app…
                    </span>
                </div>
            )}
        </div>
    );
}

interface McpAppFrameProps {
    resource: McpAppResource;
    toolName: string;
    args?: Readonly<Record<string, unknown>>;
    result?: Readonly<Record<string, unknown>>;
    height: number;
    onToolCall?(
        name: string,
        args: Readonly<Record<string, unknown>>,
    ): Promise<Record<string, unknown>>;
    onResourceRead?(uri: string): Promise<Record<string, unknown>>;
    onOpenLink?(url: string): void;
    onLog?(entry: McpAppLogEntry): void;
    onSizeChange?(size: McpAppSize): void;
}

interface BridgeState {
    /** A valid, supported `ui/initialize` request has been answered. */
    initializeAnswered: boolean;
    /** The View has completed the handshake with `ui/notifications/initialized`. */
    initializedByView: boolean;
    disposed: boolean;
    sentInput: boolean;
    sentResult: Readonly<Record<string, unknown>> | undefined;
    hasSentResult: boolean;
    teardownId: number;
}

/**
 * Owns one double-iframe app mount. A change of resource identity remounts this
 * subtree (via the `key` in McpAppShell), giving a genuinely new app a fresh
 * sandbox proxy and bridge while notifications from the same resource keep the
 * existing DOM and iframe alive.
 */
function McpAppFrame(props: McpAppFrameProps) {
    const [appHeight, setAppHeight] = useState<number | undefined>(undefined);
    const hostFrame = useRef<HTMLIFrameElement>(null);
    const bridge = useRef<BridgeState>({
        initializeAnswered: false,
        initializedByView: false,
        disposed: false,
        sentInput: false,
        sentResult: undefined,
        hasSentResult: false,
        teardownId: 0,
    });
    const proxyUrl = buildSandboxProxyUrl(hostOrigin());

    // Delivers the View HTML to the sandbox proxy once it reports ready, reading
    // the latest resource so a same-resource re-render never rebuilds the bridge.
    const onProxyReady = useEffectEvent(() => {
        const csp = props.resource.meta.ui.csp;
        const permissions = props.resource.meta.ui.permissions;
        postTo(
            hostFrame.current,
            bridge.current.disposed,
            jsonRpcNotification(McpAppMethod.sandboxResourceReady, {
                html: buildAppDocument(props.resource.html, csp),
                sandbox: buildAppSandbox(),
                ...(csp ? { csp } : {}),
                ...(permissions ? { permissions } : {}),
            }),
        );
    });

    // Handles one relayed View message against the latest props/handlers. Stable
    // across renders, so the window listener and iframe identity never churn.
    const onViewMessage = useEffectEvent((message: JsonRpcInbound) => {
        const frame = hostFrame.current;
        const state = bridge.current;
        if (isJsonRpcRequest(message)) void handleViewRequest(props, frame, state, message);
        else handleViewNotification(props, frame, state, setAppHeight, message);
    });

    // Attaches the host<->proxy relay listener once per mount, loads the inner
    // View when the proxy reports ready, and tears the bridge down on unmount by
    // sending ui/resource-teardown synchronously before the frame is removed.
    useLayoutEffect(() => {
        const element = hostFrame.current;
        if (!element) return;
        // Capture the proven non-null frame so the nested listener keeps the
        // narrowing (a nested function loses control-flow narrowing of `element`).
        const frame: HTMLIFrameElement = element;
        const state = bridge.current;
        state.disposed = false;
        function onMessage(event: MessageEvent): void {
            // The proxy is an opaque origin; authenticate by exact source window.
            if (event.source !== frame.contentWindow) return;
            if (!isJsonRpcMessage(event.data)) return;
            if (event.data.method === McpAppMethod.sandboxProxyReady) {
                onProxyReady();
                return;
            }
            onViewMessage(event.data);
        }
        window.addEventListener("message", onMessage);
        return () => {
            // Deliver a teardown request synchronously before disposal so the View
            // can persist state; we cannot await the response in cleanup.
            postTo(
                element,
                false,
                jsonRpcRequest(`teardown-${state.teardownId++}`, McpAppMethod.resourceTeardown, {
                    reason: "Host is tearing down the app view.",
                }),
            );
            state.disposed = true;
            window.removeEventListener("message", onMessage);
        };
    }, []);

    // Re-delivers the CallToolResult to an already-initialized View when it
    // arrives after the tool finishes (in_progress -> completed), firing only on
    // a result change and never remounting the frame.
    useLayoutEffect(() => {
        if (props.result !== undefined && bridge.current.initializedByView)
            sendToolResult(hostFrame.current, bridge.current, props.result);
    }, [props.result]);

    const frameHeight = appHeight ?? props.height;
    return (
        <div
            className="happy2-mcp-app__frame"
            data-bordered={props.resource.meta.ui.prefersBorder ? "" : undefined}
            data-happy2-ui="mcp-app-frame"
            style={{ height: `${frameHeight}px` } as CSSProperties}
        >
            <iframe
                className="happy2-mcp-app__host-frame"
                data-happy2-ui="mcp-app-host-frame"
                ref={hostFrame}
                sandbox="allow-scripts allow-same-origin"
                src={proxyUrl}
                title={`Interactive app: ${props.toolName}`}
            />
        </div>
    );
}

function postTo(frame: HTMLIFrameElement | null, disposed: boolean, message: object): void {
    // The proxy has an opaque origin, so the receiver origin cannot be targeted;
    // the proxy authenticates the host by its baked-in origin.
    const target = frame?.contentWindow;
    if (target && !disposed) target.postMessage(message, "*");
}

function respond(
    frame: HTMLIFrameElement | null,
    state: BridgeState,
    id: string | number,
    result: unknown,
): void {
    postTo(frame, state.disposed, jsonRpcResult(id, result));
}

function fail(
    frame: HTMLIFrameElement | null,
    state: BridgeState,
    id: string | number,
    code: number,
    message: string,
): void {
    postTo(frame, state.disposed, jsonRpcError(id, code, message));
}

function buildHostCapabilities(props: McpAppFrameProps): McpAppHostCapabilities {
    const csp = props.resource.meta.ui.csp;
    const permissions = props.resource.meta.ui.permissions;
    return {
        ...(props.onOpenLink ? { openLinks: {} } : {}),
        ...(props.onToolCall ? { serverTools: {} } : {}),
        ...(props.onResourceRead ? { serverResources: {} } : {}),
        ...(props.onLog ? { logging: {} } : {}),
        sandbox: {
            ...(permissions ? { permissions } : {}),
            ...(csp ? { csp } : {}),
        },
    };
}

function sendToolInput(
    frame: HTMLIFrameElement | null,
    state: BridgeState,
    args: Readonly<Record<string, unknown>> | undefined,
): void {
    if (state.sentInput) return;
    state.sentInput = true;
    postTo(
        frame,
        state.disposed,
        jsonRpcNotification(McpAppMethod.toolInput, { arguments: args ?? {} }),
    );
}

function sendToolResult(
    frame: HTMLIFrameElement | null,
    state: BridgeState,
    result: Readonly<Record<string, unknown>> | undefined,
): void {
    if (result === undefined) return;
    if (state.hasSentResult && state.sentResult === result) return;
    state.sentResult = result;
    state.hasSentResult = true;
    // Tool-result params ARE the CallToolResult, sent verbatim.
    postTo(frame, state.disposed, jsonRpcNotification(McpAppMethod.toolResult, result));
}

async function proxyCall(
    frame: HTMLIFrameElement | null,
    state: BridgeState,
    id: string | number,
    run: () => Promise<Record<string, unknown>>,
): Promise<void> {
    try {
        const result = await run();
        if (state.disposed) return;
        respond(frame, state, id, result);
    } catch (error) {
        if (state.disposed) return;
        fail(
            frame,
            state,
            id,
            McpAppErrorCode.upstreamFailed,
            error instanceof Error ? error.message : "The request failed.",
        );
    }
}

/**
 * Handles one View->host request against the latest props. `ui/initialize` and
 * `ping` are always available; every other request is a privileged capability
 * refused until the View has sent `ui/notifications/initialized`.
 */
async function handleViewRequest(
    props: McpAppFrameProps,
    frame: HTMLIFrameElement | null,
    state: BridgeState,
    request: JsonRpcRequest,
): Promise<void> {
    const { id, method, params } = request;
    if (method === McpAppMethod.initialize) {
        const requested = initializeParams(params);
        if (!requested)
            return fail(
                frame,
                state,
                id,
                McpAppErrorCode.invalidParams,
                "Invalid ui/initialize params",
            );
        if (!SUPPORTED_MCP_APP_PROTOCOL_VERSIONS.includes(requested.protocolVersion))
            return fail(
                frame,
                state,
                id,
                McpAppErrorCode.unsupportedProtocol,
                `Unsupported MCP Apps protocol version ${requested.protocolVersion}`,
            );
        state.initializeAnswered = true;
        respond(frame, state, id, initializeResult(buildHostCapabilities(props), props, frame));
        // Do NOT send tool input/result yet — wait for ui/notifications/initialized.
        return;
    }
    if (method === McpAppMethod.ping) return respond(frame, state, id, {});
    if (!state.initializedByView)
        return fail(
            frame,
            state,
            id,
            McpAppErrorCode.notInitialized,
            `'${method}' received before ui/notifications/initialized`,
        );
    if (method === McpAppMethod.toolsCall) {
        const call = toolCallParams(params);
        if (!call)
            return fail(
                frame,
                state,
                id,
                McpAppErrorCode.invalidParams,
                "Invalid tools/call params",
            );
        if (!props.onToolCall)
            return fail(
                frame,
                state,
                id,
                McpAppErrorCode.forbidden,
                "Tool calls are not available",
            );
        await proxyCall(frame, state, id, () => props.onToolCall!(call.name, call.arguments));
        return;
    }
    if (method === McpAppMethod.resourcesRead) {
        const uri = resourceReadUri(params);
        if (!uri)
            return fail(
                frame,
                state,
                id,
                McpAppErrorCode.invalidParams,
                "Invalid resources/read params",
            );
        if (!props.onResourceRead)
            return fail(
                frame,
                state,
                id,
                McpAppErrorCode.forbidden,
                "Resource reads are not available",
            );
        await proxyCall(frame, state, id, () => props.onResourceRead!(uri));
        return;
    }
    if (method === McpAppMethod.openLink) {
        const url = openLinkUrl(params);
        // A malformed or non-http(s) URL is a JSON-RPC error, not a successful
        // result: `openLinkUrl` returns null (absent) or "" (present but not web).
        if (!url)
            return fail(
                frame,
                state,
                id,
                McpAppErrorCode.invalidParams,
                "ui/open-link requires an http(s) URL",
            );
        if (!props.onOpenLink)
            return fail(
                frame,
                state,
                id,
                McpAppErrorCode.forbidden,
                "Opening links is not available",
            );
        props.onOpenLink(url);
        respond(frame, state, id, {});
        return;
    }
    fail(frame, state, id, McpAppErrorCode.methodNotFound, `Unknown method ${method}`);
}

/** Handles one View->host notification against the latest props. */
function handleViewNotification(
    props: McpAppFrameProps,
    frame: HTMLIFrameElement | null,
    state: BridgeState,
    setHeight: (height: number) => void,
    notification: JsonRpcNotification,
): void {
    const { method, params } = notification;
    if (method === McpAppMethod.initialized) {
        // Only a View that already received a valid initialize result may
        // complete the handshake; an `initialized` sent first must not unlock
        // privileged calls or tool data.
        if (!state.initializeAnswered || state.initializedByView) return;
        state.initializedByView = true;
        // The host MUST send the complete tool input exactly once after the View
        // initializes, and only then the result.
        sendToolInput(frame, state, props.args);
        sendToolResult(frame, state, props.result);
        return;
    }
    // Size and logging notifications are ignored until initialization completes.
    if (!state.initializedByView) return;
    if (method === McpAppMethod.sizeChanged) {
        const size = sizeParams(params);
        if (!size) return;
        if (size.height !== undefined) setHeight(clampHeight(size.height));
        props.onSizeChange?.(size);
        return;
    }
    if (method === McpAppMethod.log) {
        const entry = logParams(params);
        if (entry) props.onLog?.(entry);
        return;
    }
    // Any other notification (including request-teardown) is ignored here.
}

function clampHeight(height: number): number {
    return Math.max(MIN_APP_HEIGHT, Math.min(MAX_APP_HEIGHT, height));
}

function hostOrigin(): string {
    // May be the opaque marker "null" (e.g. a desktop BrowserWindow.loadFile
    // document); the sandbox proxy handles opaque hosts by source-window
    // authentication and "*" targeting rather than an unusable target origin.
    try {
        return window.location.origin || "null";
    } catch {
        return "null";
    }
}

function initializeResult(
    capabilities: McpAppHostCapabilities,
    props: McpAppFrameProps,
    frame: HTMLIFrameElement | null,
): object {
    const width = frame?.clientWidth ?? 0;
    const containerDimensions =
        width > 0
            ? { width, maxHeight: MAX_APP_HEIGHT }
            : { maxWidth: 1280, maxHeight: MAX_APP_HEIGHT };
    const theme = resolveTheme(frame);
    return {
        protocolVersion: MCP_APP_PROTOCOL_VERSION,
        hostInfo: { name: "Happy MCP App host", version: "1.0.0" },
        hostCapabilities: capabilities,
        hostContext: {
            // `toolInfo.tool` must be a complete MCP Tool (with inputSchema); the
            // host only knows the tool name, so the optional field is omitted.
            displayMode: "inline",
            availableDisplayModes: ["inline"],
            platform: "desktop",
            deviceCapabilities: { touch: false, hover: true },
            containerDimensions,
            ...(theme ? { theme } : {}),
            ...localeContext(),
        },
    };
}

/**
 * Resolves the theme the iframe actually renders under: an explicit Happy
 * `ThemeScope` override (`.happy2-theme-dark` / `.happy2-theme-light`) around the
 * frame wins; otherwise the system `prefers-color-scheme`. Returns undefined
 * when no reliable value can be derived so the optional theme is omitted rather
 * than reported wrong.
 */
function resolveTheme(frame: HTMLElement | null): "light" | "dark" | undefined {
    try {
        const scoped = frame?.closest?.(".happy2-theme-dark, .happy2-theme-light") ?? null;
        if (scoped) return scoped.classList.contains("happy2-theme-dark") ? "dark" : "light";
        if (window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
        if (window.matchMedia("(prefers-color-scheme: light)").matches) return "light";
    } catch {
        // fall through to undefined
    }
    return undefined;
}

function localeContext(): { locale?: string; timeZone?: string } {
    const context: { locale?: string; timeZone?: string } = {};
    try {
        if (navigator.language) context.locale = navigator.language;
    } catch {
        // ignore
    }
    try {
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (timeZone) context.timeZone = timeZone;
    } catch {
        // ignore
    }
    return context;
}

function initializeParams(
    params: unknown,
): { protocolVersion: string; appInfo: unknown; appCapabilities: unknown } | undefined {
    if (!params || typeof params !== "object") return undefined;
    const record = params as Record<string, unknown>;
    if (typeof record.protocolVersion !== "string" || !record.protocolVersion) return undefined;
    if (!record.appInfo || typeof record.appInfo !== "object") return undefined;
    if (!record.appCapabilities || typeof record.appCapabilities !== "object") return undefined;
    return {
        protocolVersion: record.protocolVersion,
        appInfo: record.appInfo,
        appCapabilities: record.appCapabilities,
    };
}

function toolCallParams(
    params: unknown,
): { name: string; arguments: Readonly<Record<string, unknown>> } | undefined {
    if (!params || typeof params !== "object") return undefined;
    const record = params as Record<string, unknown>;
    if (typeof record.name !== "string" || !record.name) return undefined;
    const args =
        record.arguments && typeof record.arguments === "object" && !Array.isArray(record.arguments)
            ? (record.arguments as Record<string, unknown>)
            : {};
    return { name: record.name, arguments: args };
}

function resourceReadUri(params: unknown): string | undefined {
    if (!params || typeof params !== "object") return undefined;
    const uri = (params as Record<string, unknown>).uri;
    return typeof uri === "string" && uri ? uri : undefined;
}

/** Returns the validated http/https URL, "" for a present-but-invalid URL, or null when absent. */
function openLinkUrl(params: unknown): string | null {
    if (!params || typeof params !== "object") return null;
    const url = (params as Record<string, unknown>).url;
    if (typeof url !== "string" || !url) return null;
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return "";
    }
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : "";
}

function sizeParams(params: unknown): McpAppSize | undefined {
    if (!params || typeof params !== "object") return undefined;
    const record = params as Record<string, unknown>;
    const width = finitePositive(record.width);
    const height = finitePositive(record.height);
    if (width === undefined && height === undefined) return undefined;
    return {
        ...(width === undefined ? {} : { width }),
        ...(height === undefined ? {} : { height }),
    };
}

function finitePositive(value: unknown): number | undefined {
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function logParams(params: unknown): McpAppLogEntry | undefined {
    if (!params || typeof params !== "object") return undefined;
    const record = params as Record<string, unknown>;
    if (!isLogLevel(record.level)) return undefined;
    return {
        level: record.level,
        data: record.data,
        ...(typeof record.logger === "string" ? { logger: record.logger } : {}),
    };
}

const LOG_LEVEL_SET = new Set<string>([
    "debug",
    "info",
    "notice",
    "warning",
    "error",
    "critical",
    "alert",
    "emergency",
]);

function isLogLevel(value: unknown): value is McpAppLogLevel {
    return typeof value === "string" && LOG_LEVEL_SET.has(value);
}
