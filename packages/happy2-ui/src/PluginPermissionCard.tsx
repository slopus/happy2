import { partitionComponentProps } from "./componentProps";
import { type CSSProperties, type HTMLAttributes } from "react";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Icon } from "./Icon";

export type PluginPermissionAction = "install" | "uninstall";
export type PluginPermissionStatus = "pending" | "processing" | "approved" | "denied" | "failed";

export type PluginPermissionCardProps = Omit<HTMLAttributes<HTMLElement>, "style"> & {
    action: PluginPermissionAction;
    status: PluginPermissionStatus;
    /** The requested plugin's display name. */
    pluginName: string;
    /** The requested plugin's immutable short name (mono). */
    shortName: string;
    description: string;
    /** Display-only staged package image URL supplied by the consumer. */
    imageUrl?: string;
    /** The agent's stated reason for the request. */
    reason?: string;
    /** Mono source context, e.g. the plugin ZIP link or archive digest. */
    source?: string;
    /** The requesting agent's display name. */
    requestedBy?: string;
    /** Bounded terminal failure diagnostic for a failed request. */
    error?: string;
    /** True while this surface's own decision request is in flight. */
    busy?: boolean;
    /**
     * Whether the current user may decide this request. Deciding requires a
     * server administrator; a pending request rendered to an ordinary member
     * shows a non-actionable "Administrator approval required" state instead
     * of Approve / Deny. Defaults to true.
     */
    canDecide?: boolean;
    onApprove?: () => void;
    onDeny?: () => void;
    style?: CSSProperties;
};

const banners: Partial<Record<PluginPermissionStatus, string>> = {
    approved: "Approved",
    denied: "Denied",
    failed: "Failed",
};

/**
 * C-067 PluginPermissionCard — a first-class, chat-scoped permission prompt
 * posted when an agent requests a plugin install or uninstall. It presents the
 * staged package (image, name, description, source, reason) so a human can
 * judge exactly what would change. Pending offers Approve / Deny to a server
 * administrator and a non-actionable approval-required state to everyone
 * else; processing and a busy in-flight decision disable actions; approved,
 * denied, and failed are clearly terminal. Presentational and fully
 * controlled through props.
 */
export function PluginPermissionCard(props: PluginPermissionCardProps) {
    const [local, rest] = partitionComponentProps(props, [
        "className",
        "action",
        "status",
        "pluginName",
        "shortName",
        "description",
        "imageUrl",
        "reason",
        "source",
        "requestedBy",
        "error",
        "busy",
        "canDecide",
        "onApprove",
        "onDeny",
        "style",
    ]);
    const pending = () => local.status === "pending";
    const processing = () => local.status === "processing";
    const banner = banners[local.status];
    const verb = local.action === "install" ? "install" : "uninstall";
    const stateLine = () => {
        switch (local.status) {
            case "processing":
                return local.action === "install"
                    ? `Installing ${local.pluginName}…`
                    : `Uninstalling ${local.pluginName}…`;
            case "approved":
                return local.action === "install"
                    ? `Approved — ${local.pluginName} was installed`
                    : `Approved — ${local.pluginName} was uninstalled`;
            case "denied":
                return "Denied — no changes were made";
            case "failed":
                return `Failed — ${local.error ?? "the plugin operation did not complete"}`;
            default:
                return "";
        }
    };
    const stateIcon = () =>
        local.status === "approved"
            ? ("check-circle" as const)
            : local.status === "processing"
              ? ("clock" as const)
              : ("close" as const);
    return (
        <section
            {...rest}
            className={["happy2-plugin-permission-card", local.className].filter(Boolean).join(" ")}
            data-action={local.action}
            data-happy2-ui="plugin-permission-card"
            data-status={local.status}
            style={local.style}
        >
            {banner ? (
                <div
                    className="happy2-plugin-permission-card__banner"
                    data-happy2-ui="plugin-permission-card-banner"
                >
                    <Icon name={local.status === "approved" ? "check" : "close"} size={14} />
                    <span
                        className="happy2-plugin-permission-card__banner-label"
                        data-happy2-ui="plugin-permission-card-banner-label"
                    >
                        {banner}
                    </span>
                </div>
            ) : null}
            <div
                className="happy2-plugin-permission-card__body"
                data-happy2-ui="plugin-permission-card-body"
            >
                <div
                    className="happy2-plugin-permission-card__header"
                    data-happy2-ui="plugin-permission-card-header"
                >
                    <span
                        className="happy2-plugin-permission-card__chip"
                        data-happy2-ui="plugin-permission-card-chip"
                    >
                        <Icon name="shield" size={14} />
                    </span>
                    <Badge
                        label={local.action === "install" ? "Plugin install" : "Plugin uninstall"}
                        variant={pending() ? "warning" : processing() ? "info" : "neutral"}
                    />
                    {local.requestedBy ? (
                        <span
                            className="happy2-plugin-permission-card__requester"
                            data-happy2-ui="plugin-permission-card-requester"
                        >
                            {local.requestedBy}
                        </span>
                    ) : null}
                </div>
                <div
                    className="happy2-plugin-permission-card__plugin"
                    data-happy2-ui="plugin-permission-card-plugin"
                >
                    <span
                        className="happy2-plugin-permission-card__image"
                        data-happy2-ui="plugin-permission-card-image"
                    >
                        {local.imageUrl ? (
                            <img
                                alt=""
                                className="happy2-plugin-permission-card__image-picture"
                                draggable={false}
                                src={local.imageUrl}
                            />
                        ) : (
                            <Icon name="braces" size={20} />
                        )}
                    </span>
                    <div className="happy2-plugin-permission-card__identity">
                        <h3
                            className="happy2-plugin-permission-card__title"
                            data-happy2-ui="plugin-permission-card-title"
                        >
                            {`Wants to ${verb} ${local.pluginName}`}
                        </h3>
                        <span
                            className="happy2-plugin-permission-card__short-name"
                            data-happy2-ui="plugin-permission-card-short-name"
                        >
                            {local.shortName}
                        </span>
                    </div>
                </div>
                <p
                    className="happy2-plugin-permission-card__description"
                    data-happy2-ui="plugin-permission-card-description"
                >
                    {local.description}
                </p>
                {local.reason ? (
                    <p
                        className="happy2-plugin-permission-card__reason"
                        data-happy2-ui="plugin-permission-card-reason"
                    >
                        {local.reason}
                    </p>
                ) : null}
                {local.source ? (
                    <code
                        className="happy2-plugin-permission-card__source"
                        data-happy2-ui="plugin-permission-card-source"
                        title={local.source}
                    >
                        <span className="happy2-plugin-permission-card__source-text">
                            {local.source}
                        </span>
                    </code>
                ) : null}
            </div>
            <footer
                className="happy2-plugin-permission-card__footer"
                data-happy2-ui="plugin-permission-card-footer"
            >
                {pending() && local.canDecide === false ? (
                    <span
                        className="happy2-plugin-permission-card__state"
                        data-happy2-ui="plugin-permission-card-state"
                    >
                        <Icon name="shield" size={14} />
                        <span
                            className="happy2-plugin-permission-card__state-label"
                            data-happy2-ui="plugin-permission-card-state-label"
                        >
                            Administrator approval required
                        </span>
                    </span>
                ) : pending() ? (
                    <>
                        <Button
                            data-action="approve"
                            disabled={local.busy}
                            icon="check"
                            onClick={() => local.onApprove?.()}
                            size="small"
                        >
                            {`Approve ${verb}`}
                        </Button>
                        <Button
                            data-action="deny"
                            disabled={local.busy}
                            onClick={() => local.onDeny?.()}
                            size="small"
                            variant="secondary"
                        >
                            Deny
                        </Button>
                    </>
                ) : (
                    <span
                        className="happy2-plugin-permission-card__state"
                        data-happy2-ui="plugin-permission-card-state"
                    >
                        <Icon name={stateIcon()} size={14} />
                        <span
                            className="happy2-plugin-permission-card__state-label"
                            data-happy2-ui="plugin-permission-card-state-label"
                        >
                            {stateLine()}
                        </span>
                    </span>
                )}
            </footer>
        </section>
    );
}
