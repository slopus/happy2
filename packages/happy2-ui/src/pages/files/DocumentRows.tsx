import type { DocumentSummary } from "happy2-state";
import { EmptyState } from "../../EmptyState";
import { Icon } from "../../Icon";

export interface DocumentRowsProps {
    readonly documents: readonly DocumentSummary[];
    readonly searching: boolean;
    readonly onOpen?: (document: DocumentSummary) => void;
}

function attachmentLabel(document: DocumentSummary): string {
    const count = document.channelAttachments.length;
    if (count === 0) return "Not in a channel";
    return count === 1 ? "In 1 channel" : `In ${count} channels`;
}

/**
 * The document collection rendered as rows for the Files surface. Documents are
 * their own collection rather than uploaded binaries, so they are listed by
 * title and where they are attached instead of through the media gallery.
 */
export function DocumentRows(props: DocumentRowsProps) {
    if (props.documents.length === 0)
        return (
            <EmptyState
                description={
                    props.searching
                        ? "Try a different search term."
                        : "Documents you create in a channel will appear here."
                }
                icon={props.searching ? "search" : "doc"}
                size="inline"
                title={props.searching ? "No documents match" : "No documents yet"}
            />
        );
    return (
        <div className="happy2-document-rows" data-happy2-ui="document-rows">
            {props.documents.map((document) => (
                <button
                    className="happy2-document-rows__row"
                    data-happy2-ui="document-rows-row"
                    key={document.id}
                    disabled={document.channelAttachments.length === 0}
                    onClick={() => props.onOpen?.(document)}
                    type="button"
                >
                    <Icon className="happy2-document-rows__icon" name="doc" />
                    <span className="happy2-document-rows__text">
                        <span className="happy2-document-rows__title">
                            {document.title || "Untitled document"}
                        </span>
                        <span className="happy2-document-rows__meta">
                            {attachmentLabel(document)} · Edited {document.updatedAt.slice(0, 10)}
                        </span>
                    </span>
                </button>
            ))}
        </div>
    );
}
