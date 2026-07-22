import type { DirectoryStore, DocumentStore } from "happy2-state";
import type { DocumentEditorFileUpload } from "../../DocumentEditor";
import { DocumentSurface } from "../../DocumentSurface";
import { useStoreSnapshot } from "../chat/chatStoreBindings.js";

const CURSOR_COLORS = ["#2baccc", "#7d5ba6", "#34c759", "#ff9500", "#ff3b30", "#007aff"];

function cursorColor(seed: string): string {
    let hash = 0;
    for (const character of seed) hash = (hash * 31 + character.charCodeAt(0)) | 0;
    return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length]!;
}

export interface DocumentDetailPaneProps {
    document: DocumentStore;
    /** Resolves presence participants to display names outside any chat. */
    directory: DirectoryStore;
    user: { readonly id: string; readonly firstName: string };
    onClose(): void;
    onDelete?(): void;
    onRename(title: string): void;
    onFileUpload?(file: File): Promise<DocumentEditorFileUpload>;
    onFileUrlResolve?(fileId: string): Promise<string>;
    onFileOpen?(fileId: string): void;
    onFileAttach?(fileId: string): Promise<void> | void;
    onFileDetach?(fileId: string): Promise<void> | void;
}

/**
 * One collaborative document as the primary surface of the global Documents
 * area. Identical collaboration behavior to the channel pane, but participant
 * names resolve through the directory because there is no chat membership
 * context here.
 */
export function DocumentDetailPane(props: DocumentDetailPaneProps) {
    const snapshot = useStoreSnapshot(props.document);
    const directory = useStoreSnapshot(props.directory);
    const memberName = (userId: string): string | undefined =>
        directory.users.find((person) => person.id === userId)?.displayName;
    const summary = snapshot.document.type === "ready" ? snapshot.document.value : undefined;
    const presence = snapshot.presence.map((entry) => {
        const state = entry.state as { update?: string; awarenessClientId?: number } | undefined;
        return {
            clientId: entry.clientId,
            revision: entry.revision,
            active: entry.active,
            update: typeof state?.update === "string" ? state.update : undefined,
            awarenessClientId:
                typeof state?.awarenessClientId === "number" ? state.awarenessClientId : undefined,
        };
    });
    const participants = snapshot.presence.map((entry) => ({
        name: memberName(entry.userId) ?? "Someone",
        color: cursorColor(entry.userId),
    }));
    return (
        <DocumentSurface
            commentUserId={props.user.id}
            commentUsersResolve={async (userIds) =>
                userIds.map((id) => ({
                    id,
                    username:
                        id === props.user.id ? props.user.firstName : (memberName(id) ?? "Someone"),
                }))
            }
            data-testid="documents-detail-surface"
            editable={snapshot.document.type === "ready"}
            error={snapshot.document.type === "error" ? snapshot.document.error.message : undefined}
            loading={snapshot.document.type === "loading" || snapshot.document.type === "unloaded"}
            onClose={props.onClose}
            onDelete={props.onDelete}
            onFileAttach={props.onFileAttach}
            onFileDetach={props.onFileDetach}
            onFileOpen={props.onFileOpen}
            onFileUpload={props.onFileUpload}
            onFileUrlResolve={props.onFileUrlResolve}
            onPresence={(payload) =>
                props.document.getState().documentPresenceUpdate(payload, true)
            }
            onTitleCommit={(title) => props.onRename(title)}
            participants={participants}
            presence={presence}
            saveError={snapshot.saveError?.message}
            saveState={snapshot.saveState}
            title={summary?.title ?? ""}
            user={{ name: props.user.firstName, color: cursorColor(props.user.id) }}
            ydoc={snapshot.ydoc}
        />
    );
}
