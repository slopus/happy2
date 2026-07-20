import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
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

const remotePresenceOrigin = "happy2-remote-presence";

export interface DocumentEditorUser {
    readonly name: string;
    readonly color: string;
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
    const editor = useCreateBlockNote(
        {
            collaboration: {
                provider: { awareness },
                fragment: props.ydoc.getXmlFragment(documentFragmentName),
                user: { name: props.user.name, color: props.user.color },
                showCursorLabels: "activity",
            },
        },
        [props.ydoc, awareness],
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
