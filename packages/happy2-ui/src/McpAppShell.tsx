import type { McpAppResource, McpAppStatus } from "happy2-state";
import { Badge, type BadgeVariant } from "./Badge";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import { partitionComponentProps } from "./componentProps";
import {
    McpAppBridgeFrame,
    MCP_APP_DEFAULT_HEIGHT,
    type McpAppBridgeResource,
} from "./mcpAppBridge";
import type { McpAppLogEntry, McpAppSize } from "./mcpAppProtocol";

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

/** Adapts the message-embedded resource (`meta.ui.*`) onto the shared bridge shape. */
function bridgeResource(resource: McpAppResource): McpAppBridgeResource {
    return {
        html: resource.html,
        contentHashSha256: resource.contentHashSha256,
        ...(resource.meta.ui.csp ? { csp: resource.meta.ui.csp } : {}),
        ...(resource.meta.ui.permissions ? { permissions: resource.meta.ui.permissions } : {}),
        ...(resource.meta.ui.prefersBorder ? { prefersBorder: true } : {}),
    };
}

/**
 * C-080 McpAppShell — host surface for one interactive MCP App attached to an
 * assistant message. It renders the loading, running, completed, and failed
 * states, and hosts the untrusted app HTML through the shared
 * {@link McpAppBridgeFrame} (the mandated 2026-01-26 double-iframe sandbox plus
 * postMessage JSON-RPC bridge).
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
                <McpAppBridgeFrame
                    key={local.resource!.contentHashSha256}
                    args={local.arguments}
                    bordered={local.resource!.meta.ui.prefersBorder}
                    height={local.height ?? MCP_APP_DEFAULT_HEIGHT}
                    onLog={local.onLog}
                    onOpenLink={local.onOpenLink}
                    onResourceRead={local.onResourceRead}
                    onSizeChange={local.onSizeChange}
                    onToolCall={local.onToolCall}
                    resource={bridgeResource(local.resource!)}
                    result={local.result}
                    title={`Interactive app: ${local.toolName}`}
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
