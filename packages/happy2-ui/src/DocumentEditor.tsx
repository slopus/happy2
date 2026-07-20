import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import {
    CommentsExtension,
    DefaultThreadStoreAuth,
    YjsThreadStore,
} from "@blocknote/core/comments";
import { useEffectEvent, useLayoutEffect, useMemo, useRef } from "react";
import {
    Awareness,
    applyAwarenessUpdate,
    encodeAwarenessUpdate,
    removeAwarenessStates,
} from "y-protocols/awareness";
import * as Y from "yjs";

/** Shared type name of the BlockNote fragment inside a collaborative document Y.Doc. */
export const documentFragmentName = "document";

/** Shared type name of the comment-thread map inside a collaborative document Y.Doc. */
export const documentThreadsName = "threads";

const remotePresenceOrigin = "happy2-remote-presence";

export interface DocumentEditorUser {
    readonly name: string;
    readonly color: string;
}

/** One resolved comment author identity shown on threads and reactions. */
export interface DocumentEditorCommentUser {
    readonly id: string;
    readonly username: string;
    readonly avatarUrl?: string;
}

/**
 * One remote participant's awareness payload as relayed by the server. The
 * `update` is an opaque base64 y-protocols awareness update produced by that
 * participant's editor; `awarenessClientId` is its numeric Yjs client id so a
 * departed participant's cursor can be removed.
 */
export interface DocumentEditorPresence {
    readonly clientId: string;
    readonly revision: number;
    readonly active: boolean;
    readonly update?: string;
    readonly awarenessClientId?: number;
}

/** The local editor's awareness payload to relay to other participants. */
export interface DocumentEditorPresencePayload {
    readonly update: string;
    readonly awarenessClientId: number;
}

export interface DocumentEditorProps {
    /** Stable collaborative document; the editor binds its BlockNote fragment. */
    ydoc: Y.Doc;
    user: DocumentEditorUser;
    presence?: readonly DocumentEditorPresence[];
    onPresence?: (payload: DocumentEditorPresencePayload) => void;
    editable?: boolean;
    theme?: "light" | "dark";
    /**
     * The local user's stable id. Providing it enables inline comment threads,
     * stored in the same collaborative Y.Doc so they sync and persist with the
     * document content.
     */
    commentUserId?: string;
    /** Resolves comment author ids to display identities; used with commentUserId. */
    commentUsersResolve?: (
        userIds: readonly string[],
    ) => Promise<readonly DocumentEditorCommentUser[]>;
    "data-testid"?: string;
}

/**
 * Collaborative BlockNote editor over a shared Y.Doc. Content synchronization
 * happens entirely through the Y.Doc handed in by the host; presence flows
 * through opaque awareness payloads so the host transport never interprets
 * editor internals.
 */
export function DocumentEditor(props: DocumentEditorProps) {
    // Identity contract: the Awareness instance and editor must be recreated
    // exactly when the underlying Y.Doc changes, never on ordinary re-renders,
    // or cursors and undo history would reset while typing.
    const awareness = useMemo(() => new Awareness(props.ydoc), [props.ydoc]);
    const commentUsersResolve = useEffectEvent(
        async (
            userIds: string[],
        ): Promise<{ id: string; username: string; avatarUrl: string }[]> => {
            const users = (await props.commentUsersResolve?.(userIds)) ?? [];
            return userIds.map((id) => {
                const user = users.find((candidate) => candidate.id === id);
                return {
                    id,
                    username: user?.username ?? "Someone",
                    avatarUrl: user?.avatarUrl ?? "",
                };
            });
        },
    );
    const commentUserId = props.commentUserId;
    const comments = useMemo(
        () =>
            commentUserId
                ? CommentsExtension({
                      threadStore: new YjsThreadStore(
                          commentUserId,
                          props.ydoc.getMap(documentThreadsName),
                          new DefaultThreadStoreAuth(commentUserId, "editor"),
                      ),
                      resolveUsers: (userIds) => commentUsersResolve(userIds),
                  })
                : undefined,
        [props.ydoc, commentUserId],
    );
    const editor = useCreateBlockNote(
        {
            collaboration: {
                provider: { awareness },
                fragment: props.ydoc.getXmlFragment(documentFragmentName),
                user: { name: props.user.name, color: props.user.color },
                showCursorLabels: "activity",
            },
            ...(comments ? { extensions: [comments] } : {}),
        },
        [props.ydoc, awareness, comments],
    );

    const presenceEmit = useEffectEvent((payload: DocumentEditorPresencePayload) =>
        props.onPresence?.(payload),
    );
    useLayoutEffect(() => {
        const onUpdate = (
            changes: { added: number[]; updated: number[]; removed: number[] },
            origin: unknown,
        ) => {
            if (origin === remotePresenceOrigin) return;
            const local = awareness.clientID;
            const touchedLocal = [...changes.added, ...changes.updated, ...changes.removed].some(
                (clientId) => clientId === local,
            );
            if (!touchedLocal) return;
            presenceEmit({
                update: base64Encode(encodeAwarenessUpdate(awareness, [local])),
                awarenessClientId: local,
            });
        };
        awareness.on("update", onUpdate);
        // The editor seeds its local awareness state during creation, before
        // this listener exists; announce that initial state explicitly.
        if (awareness.getLocalState() !== null)
            presenceEmit({
                update: base64Encode(encodeAwarenessUpdate(awareness, [awareness.clientID])),
                awarenessClientId: awareness.clientID,
            });
        return () => {
            awareness.off("update", onUpdate);
            awareness.destroy();
        };
    }, [awareness]);

    const appliedRef = useRef(new Map<string, DocumentEditorPresence>());
    useLayoutEffect(() => {
        const applied = appliedRef.current;
        const present = new Set<string>();
        for (const entry of props.presence ?? []) {
            present.add(entry.clientId);
            const previous = applied.get(entry.clientId);
            if (previous && previous.revision >= entry.revision) continue;
            applied.set(entry.clientId, entry);
            if (entry.active && entry.update !== undefined) {
                applyAwarenessUpdate(awareness, base64Decode(entry.update), remotePresenceOrigin);
            } else if (!entry.active && entry.awarenessClientId !== undefined) {
                removeAwarenessStates(awareness, [entry.awarenessClientId], remotePresenceOrigin);
            }
        }
        for (const [clientId, entry] of applied) {
            if (present.has(clientId)) continue;
            applied.delete(clientId);
            if (entry.awarenessClientId !== undefined)
                removeAwarenessStates(awareness, [entry.awarenessClientId], remotePresenceOrigin);
        }
    }, [awareness, props.presence]);

    return (
        <div className="happy2-document-editor" data-happy2-ui="document-editor">
            <BlockNoteView
                data-testid={props["data-testid"]}
                editable={props.editable ?? true}
                editor={editor}
                theme={props.theme ?? "light"}
            />
        </div>
    );
}

function base64Encode(bytes: Uint8Array): string {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

function base64Decode(value: string): Uint8Array {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
}
