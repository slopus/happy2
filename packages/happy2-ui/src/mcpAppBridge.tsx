import { useEffectEvent, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
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
    type McpAppCsp,
    type McpAppHostCapabilities,
    type McpAppLogEntry,
    type McpAppLogLevel,
    type McpAppPermissions,
    type McpAppSize,
} from "./mcpAppProtocol";

/** Standard MCP Apps display modes (extension 2026-01-26). */
export type McpAppDisplayMode = "inline" | "fullscreen" | "pip";

export const MCP_APP_DEFAULT_HEIGHT = 360;
const MIN_APP_HEIGHT = 120;
const MAX_APP_HEIGHT = 800;

/**
 * The color, font-family, and radius subset of the standard MCP Apps style
 * variables (the names `@modelcontextprotocol/ext-apps` 1.7.4 applies via
 * `useHostStyles`), each mapped to the inherited Happy design token it mirrors.
 * The bridge reads every mapped `--*` custom property as a live computed
 * value on the hosting frame, so `theme.css` stays the single source of color
 * truth and no raw palette value is duplicated here. The remaining standard keys
 * (weights, sizes, line heights, border width, shadows) have no Happy token and
 * are supplied as fixed literals below. A plugin app receives the resolved values
 * as `styles.variables` and consumes them as `var(--color-*, fallback)`.
 */
const HOST_STYLE_VARIABLE_TOKENS: ReadonlyArray<readonly [standard: string, token: string]> = [
    // Backgrounds: primary/secondary/tertiary surfaces, inverse fill, ghost hover,
    // and the semantic soft fills.
    ["--color-background-primary", "--surface"],
    ["--color-background-secondary", "--surface-high"],
    ["--color-background-tertiary", "--surface-pressed"],
    ["--color-background-inverse", "--button-primary-background"],
    ["--color-background-ghost", "--surface-ripple"],
    ["--color-background-info", "--surface-high"],
    ["--color-background-danger", "--box-error-background"],
    ["--color-background-success", "--surface-high"],
    ["--color-background-warning", "--box-warning-background"],
    ["--color-background-disabled", "--surface-pressed"],
    // Text: primary/secondary/tertiary, text on inverse fills, and the semantics.
    ["--color-text-primary", "--text"],
    ["--color-text-secondary", "--text-secondary"],
    ["--color-text-tertiary", "--text-secondary"],
    ["--color-text-inverse", "--button-primary-tint"],
    ["--color-text-ghost", "--text-secondary"],
    ["--color-text-info", "--radio-active"],
    ["--color-text-danger", "--text-destructive"],
    ["--color-text-success", "--success"],
    ["--color-text-warning", "--box-warning-text"],
    ["--color-text-disabled", "--text-secondary"],
    // Borders: primary/secondary hairlines, inverse, and the semantics.
    ["--color-border-primary", "--divider"],
    ["--color-border-secondary", "--surface-pressed-overlay"],
    ["--color-border-tertiary", "--divider"],
    ["--color-border-inverse", "--button-primary-background"],
    ["--color-border-info", "--radio-active"],
    ["--color-border-danger", "--text-destructive"],
    ["--color-border-success", "--success"],
    ["--color-border-warning", "--box-warning-border"],
    ["--color-border-disabled", "--divider"],
    // Ring / accent: primary is the system blue used for focus and selection.
    ["--color-ring-primary", "--radio-active"],
    ["--color-ring-secondary", "--surface-pressed-overlay"],
    ["--color-ring-inverse", "--button-primary-background"],
    ["--color-ring-info", "--radio-active"],
    ["--color-ring-danger", "--text-destructive"],
    ["--color-ring-success", "--success"],
    ["--color-ring-warning", "--box-warning-border"],
    // Typography families.
    ["--font-sans", "--happy2-font-ui"],
    ["--font-mono", "--happy2-font-mono"],
    // Radii: map the standard scale onto Happy's control/window/card/shell/pill radii.
    ["--border-radius-xs", "--happy2-radius-sm"],
    ["--border-radius-sm", "--happy2-radius-sm"],
    ["--border-radius-md", "--happy2-radius-window"],
    ["--border-radius-lg", "--happy2-radius-md"],
    ["--border-radius-xl", "--happy2-radius-shell"],
    ["--border-radius-full", "--happy2-radius-pill"],
];

/**
 * The remaining standard variables (ext-apps 1.7.4) that have no Happy token
 * equivalent, set to sensible fixed literals so `styles.variables` covers the
 * complete supported key set. These are non-palette values — a transparent ghost
 * border, the type scale weights/sizes/line heights, the hairline border width,
 * and neutral elevation shadows — so they do not duplicate a color the theme
 * owns. Actual colors always come from `HOST_STYLE_VARIABLE_TOKENS`.
 */
const HOST_STYLE_VARIABLE_LITERALS: ReadonlyArray<readonly [standard: string, value: string]> = [
    ["--color-border-ghost", "transparent"],
    // Font weights.
    ["--font-weight-normal", "400"],
    ["--font-weight-medium", "500"],
    ["--font-weight-semibold", "600"],
    ["--font-weight-bold", "700"],
    // Body text sizes.
    ["--font-text-xs-size", "11px"],
    ["--font-text-sm-size", "12px"],
    ["--font-text-md-size", "14px"],
    ["--font-text-lg-size", "16px"],
    // Heading sizes.
    ["--font-heading-xs-size", "13px"],
    ["--font-heading-sm-size", "15px"],
    ["--font-heading-md-size", "17px"],
    ["--font-heading-lg-size", "20px"],
    ["--font-heading-xl-size", "24px"],
    ["--font-heading-2xl-size", "28px"],
    ["--font-heading-3xl-size", "34px"],
    // Body text line heights.
    ["--font-text-xs-line-height", "16px"],
    ["--font-text-sm-line-height", "18px"],
    ["--font-text-md-line-height", "20px"],
    ["--font-text-lg-line-height", "24px"],
    // Heading line heights.
    ["--font-heading-xs-line-height", "18px"],
    ["--font-heading-sm-line-height", "20px"],
    ["--font-heading-md-line-height", "22px"],
    ["--font-heading-lg-line-height", "26px"],
    ["--font-heading-xl-line-height", "30px"],
    ["--font-heading-2xl-line-height", "34px"],
    ["--font-heading-3xl-line-height", "40px"],
    // Hairline border width.
    ["--border-width-regular", "1px"],
    // Neutral elevation shadows.
    ["--shadow-hairline", "0 0 0 1px rgb(0 0 0 / 0.06)"],
    ["--shadow-sm", "0 1px 2px rgb(0 0 0 / 0.08)"],
    ["--shadow-md", "0 4px 12px rgb(0 0 0 / 0.12)"],
    ["--shadow-lg", "0 12px 32px rgb(0 0 0 / 0.18)"],
];

/**
 * The normalized, transport-relevant resource shape the bridge frame needs. Both
 * the message-embedded `McpAppResource` (`meta.ui.*`) and the durable
 * `PluginAppResource` (flattened) map onto this by their respective owners, so
 * the double-iframe bridge itself stays agnostic to which product surface hosts
 * the app. A change of `contentHashSha256` is the only remount boundary.
 */
export interface McpAppBridgeResource {
    readonly html: string;
    readonly contentHashSha256: string;
    readonly csp?: McpAppCsp;
    readonly permissions?: McpAppPermissions;
    readonly prefersBorder?: boolean;
}

export interface McpAppBridgeFrameProps {
    /** The snapshotted, validated UI resource. Its content hash is the remount key. */
    resource: McpAppBridgeResource;
    /** iframe `title` for assistive tech. */
    title: string;
    /** The complete tool input arguments delivered to the app after initialize. */
    args?: Readonly<Record<string, unknown>>;
    /** The stored CallToolResult delivered to the app after its input. */
    result?: Readonly<Record<string, unknown>>;
    /** The default frame height before the app requests its own size (fixed layout). */
    height?: number;
    /**
     * When set, the frame fills the region its parent allocates (`flex: 1 1 auto`)
     * instead of sizing to a fixed/app-requested height. Durable app pages and
     * full-window overlays use this; message cards do not.
     */
    fill?: boolean;
    /** Draws the hairline gutter + inner border (message-card treatment). */
    bordered?: boolean;
    /**
     * Extra host-context fields merged into the `ui/initialize` result and
     * re-sent verbatim via `ui/notifications/host-context-changed` when they
     * change without remounting (e.g. `{ "happy2/instance": {...} }`). This is
     * how durable app context/`dataRevision` reaches the running View.
     */
    hostContext?: object;
    /** Current standard display mode reported to the View. Defaults to "inline". */
    displayMode?: McpAppDisplayMode;
    /** Display modes the host offers; the View may request one of these. */
    availableDisplayModes?: readonly McpAppDisplayMode[];
    /**
     * Handles a View `ui/request-display-mode`. The returned mode is the one the
     * host actually applies and is echoed back to the View per the spec; the
     * owner performs the real presentation switch as a side effect.
     */
    onRequestDisplayMode?(mode: McpAppDisplayMode): McpAppDisplayMode;
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
    /**
     * Handles the SDK's `happy2/app-open` vendor request so a durable app can open
     * another predeclared installation-local instance in a presentation. Its
     * presence lets the request succeed; otherwise it is refused.
     */
    onOpenApp?(instanceKey: string, presentation: "primary" | "modal" | "fullscreen"): void;
    className?: string;
    "data-happy2-ui"?: string;
    "data-testid"?: string;
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
    /** The last host-context payload delivered, so an unchanged render sends nothing. */
    sentContextKey: string | undefined;
    teardownId: number;
}

/**
 * Owns one double-iframe MCP App mount and the full host<->View JSON-RPC bridge
 * (extension 2026-01-26). A change of `resource.contentHashSha256` remounts this
 * subtree via its `key` in the owner, giving a genuinely new app a fresh sandbox
 * proxy and bridge; ordinary same-resource re-renders (a late tool result, a new
 * durable `dataRevision`/context, a display-mode switch) keep the existing DOM,
 * iframe, and running bridge alive and reconcile through notifications instead.
 *
 * Props only: every privileged operation and the presentation switch are
 * delegated to owner callbacks, so the component holds no transport, tokens, or
 * product state. The iframe never receives a Happy auth token.
 */
export function McpAppBridgeFrame(props: McpAppBridgeFrameProps) {
    const [appHeight, setAppHeight] = useState<number | undefined>(undefined);
    // Bumps whenever the theme the frame inherits actually changes (an explicit
    // ThemeScope toggle or the OS color scheme), so the same running View gets a
    // fresh theme + styles.variables via host-context-changed without a remount.
    const [themeEpoch, setThemeEpoch] = useState(0);
    const themeSignature = useRef<string | undefined>(undefined);
    const hostFrame = useRef<HTMLIFrameElement>(null);
    const bridge = useRef<BridgeState>({
        initializeAnswered: false,
        initializedByView: false,
        disposed: false,
        sentInput: false,
        sentResult: undefined,
        hasSentResult: false,
        sentContextKey: undefined,
        teardownId: 0,
    });
    const proxyUrl = buildSandboxProxyUrl(hostOrigin());

    // Delivers the View HTML to the sandbox proxy once it reports ready, reading
    // the latest resource so a same-resource re-render never rebuilds the bridge.
    const onProxyReady = useEffectEvent(() => {
        const csp = props.resource.csp;
        const permissions = props.resource.permissions;
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

    // Imperative theme integration: the theme the frame inherits is not React
    // state, so an explicit ThemeScope class change or an OS color-scheme change
    // is observed here and folded into `themeEpoch`. Only a real change of the
    // resolved theme + styles signature bumps it, so unrelated class churn in the
    // host tree does not thrash renders. Fully cleaned up on unmount.
    useLayoutEffect(() => {
        const frame = hostFrame.current;
        if (!frame) return;
        themeSignature.current = styleContextSignature(frame);
        const onThemeMaybeChanged = () => {
            const next = styleContextSignature(frame);
            if (next === themeSignature.current) return;
            themeSignature.current = next;
            setThemeEpoch((epoch) => epoch + 1);
        };
        const media = window.matchMedia("(prefers-color-scheme: dark)");
        media.addEventListener("change", onThemeMaybeChanged);
        const observer = new MutationObserver(onThemeMaybeChanged);
        // A ThemeScope toggles `.happy2-theme-*` on a single stable ancestor of the
        // frame (also tagged `.happy2-theme-scope`); watch only that element's own
        // class rather than the whole document. Fall back to the document root when
        // no explicit scope is present, where matchMedia already covers system
        // changes. `subtree` is intentionally off so unrelated class churn is
        // ignored.
        const scope =
            frame.closest(".happy2-theme-scope, .happy2-theme-dark, .happy2-theme-light") ??
            document.documentElement;
        observer.observe(scope, { attributeFilter: ["class"], attributes: true });
        return () => {
            media.removeEventListener("change", onThemeMaybeChanged);
            observer.disconnect();
        };
    }, []);

    // Pushes a standard host-context-changed notification when the durable
    // context payload, display mode, or inherited theme changes on the SAME
    // resource, so the View reconciles its `happy2/instance` context/dataRevision
    // and its theme + styles.variables without a remount. Reads the latest props
    // via an effect event so the effect depends only on the serialized key.
    const contextKey = hostContextKey(props.hostContext, props.displayMode, themeEpoch);
    const deliverHostContext = useEffectEvent(() => {
        sendHostContextChanged(hostFrame.current, bridge.current, props, contextKey);
    });
    useLayoutEffect(() => {
        deliverHostContext();
    }, [contextKey]);

    const frameHeight = appHeight ?? props.height ?? MCP_APP_DEFAULT_HEIGHT;
    const style = props.fill ? undefined : ({ height: `${frameHeight}px` } as CSSProperties);
    return (
        <div
            className={["happy2-mcp-app__frame", props.className].filter(Boolean).join(" ")}
            data-bordered={props.bordered ? "" : undefined}
            data-fill={props.fill ? "" : undefined}
            data-happy2-ui={props["data-happy2-ui"] ?? "mcp-app-frame"}
            data-testid={props["data-testid"]}
            style={style}
        >
            <iframe
                className="happy2-mcp-app__host-frame"
                data-happy2-ui="mcp-app-host-frame"
                ref={hostFrame}
                sandbox="allow-scripts allow-same-origin"
                src={proxyUrl}
                title={props.title}
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

function buildHostCapabilities(props: McpAppBridgeFrameProps): McpAppHostCapabilities {
    const csp = props.resource.csp;
    const permissions = props.resource.permissions;
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

/**
 * Serializes the changing host-context payload so an unchanged render sends no
 * notification. `undefined` (no durable context and default display mode) yields
 * a key that never triggers a spurious post before initialization.
 */
function hostContextKey(
    hostContext: object | undefined,
    displayMode: McpAppDisplayMode | undefined,
    themeEpoch: number,
): string {
    if (hostContext === undefined && displayMode === undefined && themeEpoch === 0) return "";
    return JSON.stringify({
        hostContext: hostContext ?? null,
        displayMode: displayMode ?? null,
        themeEpoch,
    });
}

/**
 * Sends `ui/notifications/host-context-changed` with the partial context the
 * durable owner supplied, but only after the View has completed its handshake
 * and only when the payload actually changed since the last delivery. The
 * initialize result already carries the first snapshot, so the initial value is
 * recorded without re-sending it.
 */
function sendHostContextChanged(
    frame: HTMLIFrameElement | null,
    state: BridgeState,
    props: McpAppBridgeFrameProps,
    contextKey: string,
): void {
    if (contextKey === "") return;
    if (!state.initializedByView) {
        // Not yet initialized: the pending value will ship inside the initialize
        // result. Record it so we don't immediately re-send an identical payload.
        state.sentContextKey = contextKey;
        return;
    }
    if (state.sentContextKey === contextKey) return;
    state.sentContextKey = contextKey;
    postTo(
        frame,
        state.disposed,
        jsonRpcNotification(McpAppMethod.hostContextChanged, hostContextPayload(props, frame)),
    );
}

/**
 * The partial `HostContext` a durable owner projects: instance context + display
 * mode, plus the live theme and standard `styles.variables` resolved from the
 * frame so a theme change reconciles the running View's appearance.
 */
function hostContextPayload(
    props: McpAppBridgeFrameProps,
    frame: HTMLElement | null,
): Record<string, unknown> {
    const theme = resolveTheme(frame);
    const styles = resolveStyleVariables(frame);
    return {
        ...props.hostContext,
        ...(props.displayMode ? { displayMode: props.displayMode } : {}),
        ...(props.availableDisplayModes
            ? { availableDisplayModes: props.availableDisplayModes }
            : {}),
        ...(theme ? { theme } : {}),
        ...(styles ? { styles: { variables: styles } } : {}),
    };
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
    props: McpAppBridgeFrameProps,
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
    if (method === McpAppMethod.requestDisplayMode) {
        const requested = displayModeParams(params);
        if (!requested)
            return fail(
                frame,
                state,
                id,
                McpAppErrorCode.invalidParams,
                "Invalid ui/request-display-mode params",
            );
        const current = props.displayMode ?? "inline";
        const offered = props.availableDisplayModes ?? [];
        // Honor only a mode the host actually offers; otherwise keep the current
        // one. The host MUST return the resulting mode either way (spec).
        const applied =
            props.onRequestDisplayMode && offered.includes(requested)
                ? props.onRequestDisplayMode(requested)
                : current;
        respond(frame, state, id, { mode: applied });
        return;
    }
    if (method === McpAppMethod.appOpen) {
        const open = appOpenParams(params);
        if (!open)
            return fail(
                frame,
                state,
                id,
                McpAppErrorCode.invalidParams,
                "Invalid happy2/app-open params",
            );
        if (!props.onOpenApp)
            return fail(
                frame,
                state,
                id,
                McpAppErrorCode.forbidden,
                "Opening apps is not available",
            );
        props.onOpenApp(open.instanceKey, open.presentation);
        respond(frame, state, id, {});
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
    props: McpAppBridgeFrameProps,
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
        // A filled durable frame is sized by its layout region, so an app height
        // request must not override it; the change is still forwarded to the owner.
        if (!props.fill && size.height !== undefined) setHeight(clampHeight(size.height));
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
    props: McpAppBridgeFrameProps,
    frame: HTMLIFrameElement | null,
): object {
    const width = frame?.clientWidth ?? 0;
    const height = frame?.clientHeight ?? 0;
    // A filled durable frame has a real fixed region; report both dimensions so
    // the app lays out to the page. A message card reports width and lets the
    // app grow up to the max height it may request via size-changed.
    const containerDimensions =
        props.fill && width > 0 && height > 0
            ? { width, height }
            : width > 0
              ? { width, maxHeight: MAX_APP_HEIGHT }
              : { maxWidth: 1280, maxHeight: MAX_APP_HEIGHT };
    const theme = resolveTheme(frame);
    const styles = resolveStyleVariables(frame);
    const displayMode = props.displayMode ?? "inline";
    const availableDisplayModes = props.availableDisplayModes ?? [displayMode];
    return {
        protocolVersion: MCP_APP_PROTOCOL_VERSION,
        hostInfo: { name: "Happy MCP App host", version: "1.0.0" },
        hostCapabilities: capabilities,
        hostContext: {
            // Owner-supplied durable instance context (`happy2/instance`) and any
            // vendor fields come first, so the host-owned fields below always take
            // precedence over them. This matches `hostContextPayload`, keeping the
            // initialize snapshot and later host-context-changed payloads
            // consistent about who owns display/theme/styles.
            ...props.hostContext,
            // `toolInfo.tool` must be a complete MCP Tool (with inputSchema); the
            // host only knows the tool name, so the optional field is omitted.
            displayMode,
            availableDisplayModes,
            platform: "desktop",
            deviceCapabilities: { touch: false, hover: true },
            containerDimensions,
            ...(theme ? { theme } : {}),
            // Standard MCP Apps style variables, mapped from Happy's live tokens so
            // the app's first paint already matches the host appearance.
            ...(styles ? { styles: { variables: styles } } : {}),
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

/**
 * Resolves the standard MCP Apps `styles.variables` for the frame by reading each
 * mapped `--*` custom property as an inherited computed value. This keeps
 * `theme.css` the single color source: the bridge forwards whatever the current
 * theme (system or an explicit ThemeScope) computed for the frame. Returns
 * undefined when nothing can be read so the optional field is omitted.
 */
function resolveStyleVariables(frame: HTMLElement | null): Record<string, string> | undefined {
    if (!frame) return undefined;
    try {
        const computed = window.getComputedStyle(frame);
        const variables: Record<string, string> = {};
        for (const [standard, token] of HOST_STYLE_VARIABLE_TOKENS) {
            const value = computed.getPropertyValue(token).trim();
            if (value) variables[standard] = value;
        }
        for (const [standard, literal] of HOST_STYLE_VARIABLE_LITERALS)
            variables[standard] = literal;
        return Object.keys(variables).length > 0 ? variables : undefined;
    } catch {
        return undefined;
    }
}

/**
 * A stable string identity of the frame's resolved theme + style variables, used
 * only to decide whether an observed host mutation actually changed the
 * appearance the View should see.
 */
function styleContextSignature(frame: HTMLElement | null): string {
    return JSON.stringify({
        theme: resolveTheme(frame) ?? null,
        styles: resolveStyleVariables(frame) ?? null,
    });
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

const OPEN_PRESENTATIONS = new Set<string>(["primary", "modal", "fullscreen"]);

function appOpenParams(
    params: unknown,
): { instanceKey: string; presentation: "primary" | "modal" | "fullscreen" } | undefined {
    if (!params || typeof params !== "object") return undefined;
    const record = params as Record<string, unknown>;
    const instanceKey = record.instanceKey;
    const presentation = record.presentation;
    if (typeof instanceKey !== "string" || !instanceKey) return undefined;
    if (typeof presentation !== "string" || !OPEN_PRESENTATIONS.has(presentation)) return undefined;
    return { instanceKey, presentation: presentation as "primary" | "modal" | "fullscreen" };
}

const DISPLAY_MODES = new Set<string>(["inline", "fullscreen", "pip"]);

function displayModeParams(params: unknown): McpAppDisplayMode | undefined {
    if (!params || typeof params !== "object") return undefined;
    const mode = (params as Record<string, unknown>).mode;
    return typeof mode === "string" && DISPLAY_MODES.has(mode)
        ? (mode as McpAppDisplayMode)
        : undefined;
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
