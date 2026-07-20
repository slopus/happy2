import { partitionComponentProps } from "./componentProps";
import { type CSSProperties } from "react";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";
import { Icon } from "./Icon";
import { SURFACE_HEADER_HEIGHT } from "./InfoPanel";
import { Toolbar } from "./Toolbar";

export interface DocumentsPanelEntry {
    readonly id: string;
    readonly title: string;
    /** Already formatted secondary line, e.g. "Edited 12:04" or an author name. */
    readonly detail?: string;
}

export interface DocumentsPanelProps {
    readonly className?: string;
    readonly "data-testid"?: string;
    readonly style?: CSSProperties;
    readonly documents: readonly DocumentsPanelEntry[];
    /** Initial load only. */
    readonly loading?: boolean;
    /** Load failure message. */
    readonly error?: string;
    readonly onOpen?: (documentId: string) => void;
    readonly onCreate?: () => void;
    readonly onClose?: () => void;
}

/**
 * C-080 DocumentsPanel — the right-sidebar list of a channel's collaborative
 * documents. A 56px surface header (shared height with ChannelHeader,
 * InfoPanel, and ThreadPanel) carries the title, document count, a
 * new-document action, and a close button; below it a full-bleed scrollport
 * body lists document rows or a centered loading/error/empty state. Props only
 * — the app owns the list state and all handlers.
 */
export function DocumentsPanel(props: DocumentsPanelProps) {
    const [local] = partitionComponentProps(props, [
        "className",
        "data-testid",
        "style",
        "documents",
        "loading",
        "error",
        "onOpen",
        "onCreate",
        "onClose",
    ]);
    const count = () => local.documents.length;
    const body = () => {
        if (local.loading)
            return <div className="happy2-documents-panel__status">Loading documents…</div>;
        if (local.error !== undefined)
            return (
                <div className="happy2-documents-panel__status" data-happy2-tone="danger">
                    {local.error}
                </div>
            );
        if (count() === 0)
            return (
                <EmptyState
                    action={
                        local.onCreate
                            ? { label: "New document", onClick: () => local.onCreate?.() }
                            : undefined
                    }
                    description="Notes written here stay with this channel and update live for everyone."
                    icon="doc"
                    size="panel"
                    title="No documents yet"
                />
            );
        return (
            <ul className="happy2-documents-panel__list">
                {local.documents.map((entry) => (
                    <li key={entry.id}>
                        <button
                            className="happy2-documents-panel__row"
                            data-happy2-ui="documents-panel-row"
                            onClick={() => local.onOpen?.(entry.id)}
                            type="button"
                        >
                            <Icon name="doc" size={16} />
                            <span className="happy2-documents-panel__row-text">
                                <span className="happy2-documents-panel__row-title">
                                    {entry.title || "Untitled document"}
                                </span>
                                {entry.detail ? (
                                    <span className="happy2-documents-panel__row-detail">
                                        {entry.detail}
                                    </span>
                                ) : null}
                            </span>
                        </button>
                    </li>
                ))}
            </ul>
        );
    };
    return (
        <section
            className={["happy2-documents-panel", local.className].filter(Boolean).join(" ")}
            data-happy2-ui="documents-panel"
            data-testid={local["data-testid"]}
            style={local.style}
        >
            <Toolbar
                className="happy2-documents-panel__header"
                height={SURFACE_HEADER_HEIGHT}
                subtitle={`${count()} ${count() === 1 ? "document" : "documents"}`}
                title="Documents"
                trailing={
                    <>
                        {local.onCreate ? (
                            <Button
                                aria-label="New document"
                                icon="plus"
                                iconOnly
                                onClick={() => local.onCreate?.()}
                                size="small"
                                variant="ghost"
                            />
                        ) : null}
                        {local.onClose ? (
                            <Button
                                aria-label="Close documents"
                                icon="close"
                                iconOnly
                                onClick={() => local.onClose?.()}
                                size="small"
                                variant="ghost"
                            />
                        ) : null}
                    </>
                }
            />
            <div className="happy2-documents-panel__body">{body()}</div>
        </section>
    );
}
