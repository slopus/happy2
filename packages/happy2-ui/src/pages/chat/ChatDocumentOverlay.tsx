import { type CSSProperties } from "react";
import type { DocumentStore } from "happy2-state";
import { Box, DocumentSurface, ModalOverlay } from "./ChatPageComponents.js";
import { useStoreSnapshot } from "./chatStoreBindings.js";
import type { ChatPageUser } from "./ChatPage.js";

const surfaceStyle: CSSProperties = {
    width: "min(1040px, 94vw)",
    height: "min(760px, 88vh)",
    borderRadius: "14px",
    overflow: "hidden",
    border: "1px solid var(--happy2-border)",
    boxShadow: "0 24px 60px rgba(0, 0, 0, 0.5)",
};

const CURSOR_COLORS = ["#2baccc", "#7d5ba6", "#34c759", "#ff9500", "#ff3b30", "#007aff"];

function cursorColor(seed: string): string {
    let hash = 0;
    for (const character of seed) hash = (hash * 31 + character.charCodeAt(0)) | 0;
    return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length]!;
}

export interface ChatDocumentOverlayProps {
    document: DocumentStore;
    user: ChatPageUser;
    memberName(userId: string): string | undefined;
    onClose(): void;
    onRename(title: string): void;
}

/**
 * Full document editing overlay bound to one collaborative session store. The
 * opaque presence payloads relayed by the server are unwrapped here into the
 * editor's awareness entries; the overlay deliberately has no backdrop
 * dismissal so an editor holding work is never lost to a stray click.
 */
export function ChatDocumentOverlay(props: ChatDocumentOverlayProps) {
    const snapshot = useStoreSnapshot(props.document);
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
        name: props.memberName(entry.userId) ?? "Someone",
        color: cursorColor(entry.userId),
    }));
    return (
        <ModalOverlay>
            <Box style={surfaceStyle}>
                <DocumentSurface
                    data-testid="chat-document-surface"
                    editable={snapshot.document.type === "ready"}
                    error={
                        snapshot.document.type === "error"
                            ? snapshot.document.error.message
                            : undefined
                    }
                    loading={
                        snapshot.document.type === "loading" ||
                        snapshot.document.type === "unloaded"
                    }
                    onClose={props.onClose}
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
            </Box>
        </ModalOverlay>
    );
}
