import { useState } from "react";
import type { DocumentCollectionStore, DocumentSummary } from "happy2-state";
import { Banner } from "../../Banner";
import { Box } from "../../Box";
import { Button } from "../../Button";
import { DocumentDeleteDialog } from "../../DocumentDeleteDialog";
import { EmptyState } from "../../EmptyState";
import { Icon } from "../../Icon";
import { StoreSurface } from "../../StoreSurface";
import { Toolbar } from "../../Toolbar";

export interface DocumentsPageProps {
    readonly "data-testid"?: string;
    /** The whole visible document collection. */
    readonly store: DocumentCollectionStore;
    readonly onOpen?: (document: DocumentSummary) => void;
    readonly onCreate?: () => void;
    /** Invoked only after the user confirms the destructive dialog. */
    readonly onDelete?: (document: DocumentSummary) => void;
}

function attachmentLabel(document: DocumentSummary): string {
    const count = document.channelAttachments.length;
    if (count === 0) return "Not in a channel";
    return count === 1 ? "In 1 channel" : `In ${count} channels`;
}

/**
 * C-140 DocumentsPage — the global documents surface behind the sidebar's
 * Documents entry: every document visible to the signed-in user across all
 * channels, with creation and hover-revealed deletion. Deleting always passes
 * through the destructive confirmation dialog. Props only — the app owns the
 * collection store and all handlers.
 */
export function DocumentsPage(props: DocumentsPageProps) {
    return (
        <StoreSurface store={props.store}>
            {(snapshot) => <DocumentsPageContent {...props} documents={snapshot.documents} />}
        </StoreSurface>
    );
}

function DocumentsPageContent(
    props: DocumentsPageProps & {
        documents: ReturnType<DocumentCollectionStore["getState"]>["documents"];
    },
) {
    const [deleteTarget, setDeleteTarget] = useState<DocumentSummary>();
    const documents = props.documents.type === "ready" ? props.documents.value : [];
    const body = () => {
        if (props.documents.type === "error")
            return (
                <Banner tone="danger" title="Documents unavailable">
                    {props.documents.error.message}
                </Banner>
            );
        if (props.documents.type === "loading" || props.documents.type === "unloaded")
            return (
                <EmptyState
                    description="Fetching every document you can see."
                    icon="doc"
                    title="Loading documents…"
                />
            );
        if (documents.length === 0)
            return (
                <EmptyState
                    action={
                        props.onCreate
                            ? { label: "New document", onClick: () => props.onCreate?.() }
                            : undefined
                    }
                    description="Documents you create or that are shared with your channels appear here."
                    icon="doc"
                    title="No documents yet"
                />
            );
        return (
            <div className="happy2-documents-page__list" data-happy2-ui="documents-page-list">
                {documents.map((document) => (
                    <div className="happy2-documents-page__item" key={document.id}>
                        <button
                            className="happy2-documents-page__row"
                            data-happy2-ui="documents-page-row"
                            onClick={() => props.onOpen?.(document)}
                            type="button"
                        >
                            <Icon className="happy2-documents-page__icon" name="doc" />
                            <span className="happy2-documents-page__text">
                                <span className="happy2-documents-page__title">
                                    {document.title || "Untitled document"}
                                </span>
                                <span className="happy2-documents-page__meta">
                                    {attachmentLabel(document)} · Edited{" "}
                                    {document.updatedAt.slice(0, 10)}
                                </span>
                            </span>
                        </button>
                        {props.onDelete ? (
                            <button
                                aria-label={`Delete ${document.title || "Untitled document"}`}
                                className="happy2-documents-page__row-delete"
                                data-happy2-ui="documents-page-row-delete"
                                onClick={() => setDeleteTarget(document)}
                                title="Delete document"
                                type="button"
                            >
                                <Icon name="close" size={14} />
                            </button>
                        ) : null}
                    </div>
                ))}
            </div>
        );
    };
    return (
        <section className="happy2-documents-page" data-testid={props["data-testid"]}>
            <Toolbar
                subtitle={`${documents.length} ${documents.length === 1 ? "document" : "documents"}`}
                title="Documents"
                trailing={
                    props.onCreate ? (
                        <Button
                            icon="plus"
                            onClick={() => props.onCreate?.()}
                            size="small"
                            variant="secondary"
                        >
                            New document
                        </Button>
                    ) : undefined
                }
            />
            <Box className="happy2-documents-page__scroll">
                <Box className="happy2-documents-page__body">{body()}</Box>
            </Box>
            {deleteTarget ? (
                <DocumentDeleteDialog
                    data-testid="documents-page-delete-dialog"
                    documentTitle={deleteTarget.title}
                    onCancel={() => setDeleteTarget(undefined)}
                    onConfirm={() => {
                        const target = deleteTarget;
                        setDeleteTarget(undefined);
                        if (target) props.onDelete?.(target);
                    }}
                />
            ) : null}
        </section>
    );
}
