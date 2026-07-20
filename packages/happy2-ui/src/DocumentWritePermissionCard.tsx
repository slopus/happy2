import { partitionComponentProps } from "./componentProps";
import { type CSSProperties, type HTMLAttributes } from "react";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Icon } from "./Icon";

export type DocumentWritePermissionStatus = "pending" | "approved" | "denied" | "failed";

export type DocumentWritePermissionCardProps = Omit<HTMLAttributes<HTMLElement>, "style"> & {
    status: DocumentWritePermissionStatus;
    /** The target document's display title. */
    documentTitle: string;
    /** The requesting agent's display name. */
    requestedBy?: string;
    /** Bounded terminal failure diagnostic for a failed request. */
    error?: string;
    /** True while this surface's own decision request is in flight. */
    busy?: boolean;
    onApprove?: () => void;
    onDeny?: () => void;
    style?: CSSProperties;
};

const banners: Partial<Record<DocumentWritePermissionStatus, string>> = {
    approved: "Approved",
    denied: "Denied",
    failed: "Failed",
};

/**
 * C-141 DocumentWritePermissionCard — a first-class, chat-scoped permission
 * prompt posted when an agent asks to write to a channel document. The staged
 * changes never apply on their own: the card names the target document and the
 * requesting agent so any posting member can approve or deny the write.
 * Pending offers Approve / Deny; a busy in-flight decision disables both;
 * approved, denied, and failed are clearly terminal. Presentational and fully
 * controlled through props.
 */
export function DocumentWritePermissionCard(props: DocumentWritePermissionCardProps) {
    const [local, rest] = partitionComponentProps(props, [
        "className",
        "status",
        "documentTitle",
        "requestedBy",
        "error",
        "busy",
        "onApprove",
        "onDeny",
        "style",
    ]);
    const pending = () => local.status === "pending";
    const banner = banners[local.status];
    const stateLine = () => {
        switch (local.status) {
            case "approved":
                return `Approved — the changes were applied to ${local.documentTitle}`;
            case "denied":
                return "Denied — the document was not changed";
            case "failed":
                return `Failed — ${local.error ?? "the document write did not complete"}`;
            default:
                return "";
        }
    };
    return (
        <section
            {...rest}
            className={["happy2-document-write-permission-card", local.className]
                .filter(Boolean)
                .join(" ")}
            data-happy2-ui="document-write-permission-card"
            data-status={local.status}
            style={local.style}
        >
            {banner ? (
                <div
                    className="happy2-document-write-permission-card__banner"
                    data-happy2-ui="document-write-permission-card-banner"
                >
                    <Icon name={local.status === "approved" ? "check" : "close"} size={14} />
                    <span
                        className="happy2-document-write-permission-card__banner-label"
                        data-happy2-ui="document-write-permission-card-banner-label"
                    >
                        {banner}
                    </span>
                </div>
            ) : null}
            <div
                className="happy2-document-write-permission-card__body"
                data-happy2-ui="document-write-permission-card-body"
            >
                <div
                    className="happy2-document-write-permission-card__header"
                    data-happy2-ui="document-write-permission-card-header"
                >
                    <span
                        className="happy2-document-write-permission-card__chip"
                        data-happy2-ui="document-write-permission-card-chip"
                    >
                        <Icon name="edit" size={14} />
                    </span>
                    <Badge label="Document edit" variant={pending() ? "warning" : "neutral"} />
                    {local.requestedBy ? (
                        <span
                            className="happy2-document-write-permission-card__requester"
                            data-happy2-ui="document-write-permission-card-requester"
                        >
                            {local.requestedBy}
                        </span>
                    ) : null}
                </div>
                <div
                    className="happy2-document-write-permission-card__document"
                    data-happy2-ui="document-write-permission-card-document"
                >
                    <span
                        className="happy2-document-write-permission-card__glyph"
                        data-happy2-ui="document-write-permission-card-glyph"
                    >
                        <Icon name="doc" size={20} />
                    </span>
                    <h3
                        className="happy2-document-write-permission-card__title"
                        data-happy2-ui="document-write-permission-card-title"
                    >
                        {`Wants to edit ${local.documentTitle}`}
                    </h3>
                </div>
                <p
                    className="happy2-document-write-permission-card__description"
                    data-happy2-ui="document-write-permission-card-description"
                >
                    The staged changes apply to the document only after a member approves them.
                </p>
            </div>
            <footer
                className="happy2-document-write-permission-card__footer"
                data-happy2-ui="document-write-permission-card-footer"
            >
                {pending() ? (
                    <>
                        <Button
                            data-action="approve"
                            disabled={local.busy}
                            icon="check"
                            onClick={() => local.onApprove?.()}
                            size="small"
                        >
                            Approve edit
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
                        className="happy2-document-write-permission-card__state"
                        data-happy2-ui="document-write-permission-card-state"
                    >
                        <Icon
                            name={local.status === "approved" ? "check-circle" : "close"}
                            size={14}
                        />
                        <span
                            className="happy2-document-write-permission-card__state-label"
                            data-happy2-ui="document-write-permission-card-state-label"
                        >
                            {stateLine()}
                        </span>
                    </span>
                )}
            </footer>
        </section>
    );
}
