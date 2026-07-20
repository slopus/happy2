import type { ReactNode } from "react";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";
import { ModalOverlay } from "./ModalOverlay";
import {
    McpAppBridgeFrame,
    type McpAppBridgeResource,
    type McpAppDisplayMode,
} from "./mcpAppBridge";
import type { McpAppLogEntry, McpAppSize } from "./mcpAppProtocol";

/** The visual lifecycle of a durable plugin app surface. */
export type PluginAppViewStatus = "loading" | "ready" | "unavailable" | "error";

export interface PluginAppViewProps {
    /** The durable instance title, shown in the page/overlay header. */
    title: string;
    /** One-line description of the instance, shown under the title. */
    description?: string;
    /** The monochrome instance glyph (a `PluginAssetGlyph`). */
    glyph?: ReactNode;
    status: PluginAppViewStatus;
    /** The validated resource; required when `status === "ready"`. */
    resource?: McpAppBridgeResource;
    /** Durable host context merged into initialize and re-sent on change (`happy2/instance`). */
    hostContext?: object;
    /** Standard display mode reported to the View. */
    displayMode?: McpAppDisplayMode;
    availableDisplayModes?: readonly McpAppDisplayMode[];
    onRequestDisplayMode?(mode: McpAppDisplayMode): McpAppDisplayMode;
    onToolCall?(
        name: string,
        args: Readonly<Record<string, unknown>>,
    ): Promise<Record<string, unknown>>;
    onResourceRead?(uri: string): Promise<Record<string, unknown>>;
    onOpenLink?(url: string): void;
    onLog?(entry: McpAppLogEntry): void;
    onSizeChange?(size: McpAppSize): void;
    /** Opens another predeclared instance by key (SDK `happy2/app-open`). */
    onOpenApp?(instanceKey: string, presentation: "primary" | "modal" | "fullscreen"): void;
    /** Retries loading a failed or unavailable instance. */
    onReload?(): void;
    /** Overrides the failure message. */
    error?: string;
    /** Overrides the unavailable message. */
    unavailableMessage?: string;
    /** Trailing header controls (e.g. presentation switches, a close button). */
    headerTrailing?: ReactNode;
    className?: string;
    "data-testid"?: string;
}

/**
 * C-132 PluginAppView — the page-quality host surface for one durable MCP App
 * instance. A flex column: a header (glyph, title, description, trailing slot)
 * over a body that is the sandboxed app frame, a loading state, an unavailable
 * state, or a failure state. Unlike the message-card {@link McpAppShell} chrome
 * this reads as a first-class workspace page.
 *
 * The frame is keyed by the resource content hash, so ordinary `dataRevision`
 * and context revisions keep one stable iframe/DOM identity and reconcile
 * through `ui/notifications/host-context-changed`; only genuinely new resource
 * HTML remounts it. Props only — every privileged operation is delegated.
 */
export function PluginAppView(props: PluginAppViewProps) {
    return (
        <div
            className={["happy2-plugin-app-view", props.className].filter(Boolean).join(" ")}
            data-happy2-ui="plugin-app-view"
            data-status={props.status}
            data-testid={props["data-testid"]}
        >
            <div className="happy2-plugin-app-view__header" data-happy2-ui="plugin-app-view-header">
                {props.glyph ? (
                    <span
                        className="happy2-plugin-app-view__glyph"
                        data-happy2-ui="plugin-app-view-glyph"
                    >
                        {props.glyph}
                    </span>
                ) : null}
                <span
                    className="happy2-plugin-app-view__heading"
                    data-happy2-ui="plugin-app-view-heading"
                >
                    <span
                        className="happy2-plugin-app-view__title"
                        data-happy2-ui="plugin-app-view-title"
                    >
                        {props.title}
                    </span>
                    {props.description ? (
                        <span
                            className="happy2-plugin-app-view__description"
                            data-happy2-ui="plugin-app-view-description"
                        >
                            {props.description}
                        </span>
                    ) : null}
                </span>
                {props.headerTrailing ? (
                    <span
                        className="happy2-plugin-app-view__trailing"
                        data-happy2-ui="plugin-app-view-trailing"
                    >
                        {props.headerTrailing}
                    </span>
                ) : null}
            </div>
            <div className="happy2-plugin-app-view__body" data-happy2-ui="plugin-app-view-body">
                {renderBody(props)}
            </div>
        </div>
    );
}

function renderBody(props: PluginAppViewProps): ReactNode {
    if (props.status === "ready" && props.resource)
        return (
            <McpAppBridgeFrame
                key={props.resource.contentHashSha256}
                availableDisplayModes={props.availableDisplayModes}
                displayMode={props.displayMode}
                fill
                hostContext={props.hostContext}
                onLog={props.onLog}
                onOpenApp={props.onOpenApp}
                onOpenLink={props.onOpenLink}
                onRequestDisplayMode={props.onRequestDisplayMode}
                onResourceRead={props.onResourceRead}
                onSizeChange={props.onSizeChange}
                onToolCall={props.onToolCall}
                resource={props.resource}
                title={props.title}
            />
        );
    if (props.status === "unavailable")
        return (
            <EmptyState
                action={
                    props.onReload ? { label: "Try again", onClick: props.onReload } : undefined
                }
                description={
                    props.unavailableMessage ??
                    "This app is not available right now. Its plugin may be updating or stopped."
                }
                icon="shield"
                size="panel"
                title="App unavailable"
            />
        );
    if (props.status === "error")
        return (
            <EmptyState
                action={
                    props.onReload ? { label: "Try again", onClick: props.onReload } : undefined
                }
                description={props.error ?? "This app could not be loaded."}
                icon="close"
                size="panel"
                title="Something went wrong"
            />
        );
    return (
        <div className="happy2-plugin-app-view__loading" data-happy2-ui="plugin-app-view-loading">
            <span
                className="happy2-plugin-app-view__spinner"
                data-happy2-ui="plugin-app-view-spinner"
            />
            <span
                className="happy2-plugin-app-view__loading-text"
                data-happy2-ui="plugin-app-view-loading-text"
            >
                Loading app…
            </span>
        </div>
    );
}

export interface PluginAppOverlayProps extends PluginAppViewProps {
    /** Modal (centered card) or fullscreen (near-full window) presentation. */
    presentation: "modal" | "fullscreen";
    /** Closes the overlay (backdrop click, Escape, and the header close button). */
    onClose(): void;
    closeLabel?: string;
}

/**
 * C-133 PluginAppOverlay — hosts one durable app instance as an accessible modal
 * dialog or full-window overlay. It composes the shared {@link ModalOverlay}
 * (scrim, `--happy2-z-overlay`, Escape/backdrop dismissal, focus trap and
 * restore) around a `role="dialog" aria-modal` card whose body is a
 * {@link PluginAppView}. The header close button and the overlay dismissal share
 * one `onClose`.
 */
export function PluginAppOverlay(props: PluginAppOverlayProps) {
    const { presentation, onClose, closeLabel, className, ...view } = props;
    return (
        <ModalOverlay onDismiss={onClose} placement="center">
            <div
                aria-label={props.title}
                aria-modal="true"
                className={["happy2-plugin-app-overlay", className].filter(Boolean).join(" ")}
                data-happy2-ui="plugin-app-overlay"
                data-presentation={presentation}
                role="dialog"
            >
                <PluginAppView
                    {...view}
                    className="happy2-plugin-app-overlay__view"
                    headerTrailing={
                        <span className="happy2-plugin-app-overlay__controls">
                            {props.headerTrailing}
                            <Button
                                aria-label={closeLabel ?? "Close app"}
                                icon="close"
                                iconOnly
                                onClick={onClose}
                                size="small"
                                variant="ghost"
                            >
                                {closeLabel ?? "Close app"}
                            </Button>
                        </span>
                    }
                />
            </div>
        </ModalOverlay>
    );
}
