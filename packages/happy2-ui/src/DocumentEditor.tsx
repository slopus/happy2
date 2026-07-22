import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import {
    CommentsExtension,
    DefaultThreadStoreAuth,
    YjsThreadStore,
} from "@blocknote/core/comments";
import {
    useEffectEvent,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type DragEvent as ReactDragEvent,
    type KeyboardEvent as ReactKeyboardEvent,
    type MouseEvent as ReactMouseEvent,
} from "react";
import {
    Awareness,
    applyAwarenessUpdate,
    encodeAwarenessUpdate,
    removeAwarenessStates,
} from "y-protocols/awareness";
import * as Y from "yjs";
import { Banner } from "./Banner";

/** Shared type name of the BlockNote fragment inside a collaborative document Y.Doc. */
export const documentFragmentName = "document";

/** Shared type name of the comment-thread map inside a collaborative document Y.Doc. */
export const documentThreadsName = "threads";

const remotePresenceOrigin = "happy2-remote-presence";
const documentFileReferencePrefix = "/v0/files/";

export interface DocumentEditorFileUpload {
    readonly id: string;
    readonly name: string;
}

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
    /** Uploads and durably attaches one file before its BlockNote block is finalized. */
    onFileUpload?: (file: File) => Promise<DocumentEditorFileUpload>;
    /** Resolves a durable file to a short-lived URL for visual media rendering. */
    onFileUrlResolve?: (fileId: string) => Promise<string>;
    /** Opens a durable generic-file reference in the host's file surface. */
    onFileOpen?: (fileId: string) => void;
    /** Reattaches a durable reference restored or pasted by a local editor action. */
    onFileAttach?: (fileId: string) => Promise<void> | void;
    /** Detaches a durable relation after its local BlockNote block is removed. */
    onFileDetach?: (fileId: string) => Promise<void> | void;
    /** Controlled visual state for deterministic hosts and Blueprint fixtures. */
    fileDropActive?: boolean;
    /** Controlled attachment error; internal upload errors use the same banner. */
    fileError?: string;
    onFileErrorDismiss?: () => void;
    "data-testid"?: string;
}

/**
 * Collaborative BlockNote editor over a shared Y.Doc. Content synchronization
 * happens entirely through the Y.Doc handed in by the host; presence flows
 * through opaque awareness payloads so the host transport never interprets
 * editor internals.
 */
export function DocumentEditor(props: DocumentEditorProps) {
    const [fileError, setFileError] = useState<string>();
    const [dragActive, setDragActive] = useState(false);
    const dragDepth = useRef(0);
    const knownFileIds = useRef(new Set<string>());
    const fileLifecycle = useRef({ active: false, generation: 0, pending: new Set<string>() });
    const fileDetachRef = useRef(props.onFileDetach);
    const fileUploadRef = useRef(props.onFileUpload);
    const fileUrlResolveRef = useRef(props.onFileUrlResolve);
    useLayoutEffect(() => {
        fileDetachRef.current = props.onFileDetach;
        fileUploadRef.current = props.onFileUpload;
        fileUrlResolveRef.current = props.onFileUrlResolve;
    });
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
                      // Existing BlockNote integration: this callback is invoked
                      // by the extension after render, never while constructing it.
                      // eslint-disable-next-line react-hooks/rules-of-hooks
                      resolveUsers: (userIds) => commentUsersResolve(userIds),
                  })
                : undefined,
        // The effect event is stable and intentionally keeps changing directory
        // projections out of the editor's identity boundary.
        // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/rules-of-hooks
        [props.ydoc, commentUserId, commentUsersResolve],
    );
    const fileUpload = async (file: File) => {
        const generation = fileLifecycle.current.generation;
        const fileDetach = fileDetachRef.current;
        try {
            const uploaded = await fileUploadRef.current?.(file);
            if (!uploaded) throw new Error("File uploads are unavailable for this document.");
            const lifecycle = fileLifecycle.current;
            if (!lifecycle.active || lifecycle.generation !== generation) {
                try {
                    await fileDetach?.(uploaded.id);
                } catch {
                    // The editor is gone, so there is no surface on which to
                    // report a best-effort relation cleanup failure.
                }
                return { props: { caption: "", name: uploaded.name || file.name, url: "" } };
            }
            lifecycle.pending.add(uploaded.id);
            setFileError(undefined);
            return {
                props: {
                    caption: "",
                    name: uploaded.name || file.name,
                    url: documentFileReference(uploaded.id),
                },
            };
        } catch (error) {
            const lifecycle = fileLifecycle.current;
            if (lifecycle.active && lifecycle.generation === generation)
                setFileError(displayError(error, "The file could not be added to this document."));
            // Keep BlockNote's empty file block as a native retry affordance.
            return { props: { caption: "Upload failed", name: file.name, url: "" } };
        }
    };
    const fileResolve = async (reference: string) => {
        const generation = fileLifecycle.current.generation;
        const fileUrlResolve = fileUrlResolveRef.current;
        const fileId = documentFileReferenceParse(reference);
        if (!fileId) return reference;
        try {
            const resolved = await fileUrlResolve?.(fileId);
            if (!resolved) throw new Error("File previews are unavailable for this document.");
            return resolved;
        } catch (error) {
            const lifecycle = fileLifecycle.current;
            if (lifecycle.active && lifecycle.generation === generation)
                setFileError(displayError(error, "The file preview could not be loaded."));
            // BlockNote does not catch resolver rejections; returning the stable
            // locator leaves a harmless broken preview while the banner explains
            // the authenticated load failure.
            return reference;
        }
    };
    const editor = useCreateBlockNote(
        {
            collaboration: {
                provider: { awareness },
                fragment: props.ydoc.getXmlFragment(documentFragmentName),
                user: { name: props.user.name, color: props.user.color },
                showCursorLabels: "activity",
            },
            ...(comments ? { extensions: [comments] } : {}),
            ...(props.onFileUpload ? { uploadFile: (file: File) => fileUpload(file) } : {}),
            ...(props.onFileUrlResolve
                ? { resolveFileUrl: (url: string) => fileResolve(url) }
                : {}),
        },
        [
            props.ydoc,
            awareness,
            comments,
            Boolean(props.onFileUpload),
            Boolean(props.onFileUrlResolve),
        ],
    );

    const relationOperations = useRef(new Map<string, Promise<void>>());
    const fileRelationChange = useEffectEvent((fileId: string, kind: "attach" | "detach") => {
        const generation = fileLifecycle.current.generation;
        let failureKind = kind;
        const previous = relationOperations.current.get(fileId) ?? Promise.resolve();
        const operation = previous
            .catch(() => undefined)
            .then(async () => {
                if (kind === "attach") await props.onFileAttach?.(fileId);
                else {
                    await props.onFileDetach?.(fileId);
                    if (documentFileIds(editor.document).has(fileId)) {
                        failureKind = "attach";
                        await props.onFileAttach?.(fileId);
                        if (fileLifecycle.current.generation === generation)
                            knownFileIds.current.add(fileId);
                    }
                }
            });
        relationOperations.current.set(fileId, operation);
        void operation
            .catch((error) => {
                const lifecycle = fileLifecycle.current;
                if (!lifecycle.active || lifecycle.generation !== generation) return;
                if (failureKind === "attach") knownFileIds.current.delete(fileId);
                else knownFileIds.current.add(fileId);
                setFileError(
                    displayError(
                        error,
                        failureKind === "attach"
                            ? "The file could not be reattached to this document."
                            : "The file could not be detached from this document.",
                    ),
                );
            })
            .finally(() => {
                if (relationOperations.current.get(fileId) === operation)
                    relationOperations.current.delete(fileId);
            });
    });
    useLayoutEffect(() => {
        const lifecycle = fileLifecycle.current;
        const generation = lifecycle.generation + 1;
        lifecycle.active = true;
        lifecycle.generation = generation;
        relationOperations.current.clear();
        knownFileIds.current = documentFileIds(editor.document);
        const fileDetach = fileDetachRef.current;
        const unsubscribe = editor.onChange((current) => {
            const next = documentFileIds(current.document);
            for (const fileId of knownFileIds.current) {
                if (next.has(fileId)) continue;
                lifecycle.pending.delete(fileId);
                fileRelationChange(fileId, "detach");
            }
            for (const fileId of next) {
                if (knownFileIds.current.has(fileId)) continue;
                if (!lifecycle.pending.delete(fileId) && !relationOperations.current.has(fileId))
                    fileRelationChange(fileId, "attach");
            }
            knownFileIds.current = next;
        }, false); // Remote collaboration transactions must not repeat relation mutations.
        return () => {
            unsubscribe();
            if (lifecycle.generation !== generation) return;
            lifecycle.active = false;
            const stored = documentFileIds(editor.document);
            for (const fileId of lifecycle.pending) {
                if (stored.has(fileId)) continue;
                void Promise.resolve(fileDetach?.(fileId)).catch(() => undefined);
            }
            lifecycle.pending.clear();
        };
    }, [editor]);

    const fileBlockOpen = (
        event: ReactMouseEvent<HTMLDivElement> | ReactKeyboardEvent<HTMLDivElement>,
    ) => {
        if ("key" in event && event.key !== "Enter" && event.key !== " ") return;
        const fileId = documentFileIdFromTarget(event.target, editor);
        if (!fileId || !props.onFileOpen) return;
        event.preventDefault();
        if ("key" in event) event.stopPropagation();
        props.onFileOpen(fileId);
    };
    const fileOpenEnabled = props.onFileOpen !== undefined;

    useLayoutEffect(() => {
        const root = editor.domElement;
        if (!root) return;
        const decorate = () => {
            for (const element of root.querySelectorAll<HTMLElement>(
                '[data-content-type="file"] .bn-file-name-with-icon',
            )) {
                const fileId = documentFileIdFromTarget(element, editor);
                if (!fileId || !fileOpenEnabled) {
                    element.removeAttribute("role");
                    element.removeAttribute("tabindex");
                    element.removeAttribute("aria-label");
                    continue;
                }
                element.setAttribute("role", "button");
                element.setAttribute("tabindex", "0");
                element.setAttribute("aria-label", `Open ${element.textContent || "file"}`);
            }
        };
        decorate();
        const observer = new MutationObserver(decorate);
        observer.observe(root, { childList: true, subtree: true });
        return () => observer.disconnect();
    }, [editor, fileOpenEnabled]);

    const fileDrag = (event: ReactDragEvent<HTMLDivElement>, phase: "enter" | "leave" | "drop") => {
        if (!event.dataTransfer.types.includes("Files")) return;
        if (phase === "enter") dragDepth.current += 1;
        else if (phase === "leave") dragDepth.current = Math.max(0, dragDepth.current - 1);
        else dragDepth.current = 0;
        setDragActive(dragDepth.current > 0);
    };
    const dropTargetVisible = props.fileDropActive ?? dragActive;
    const displayedFileError = props.fileError ?? fileError;

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
        <div
            className="happy2-document-editor"
            data-drag-active={dropTargetVisible ? "" : undefined}
            data-happy2-ui="document-editor"
            onClick={fileBlockOpen}
            onDragEnter={(event) => fileDrag(event, "enter")}
            onDragLeave={(event) => fileDrag(event, "leave")}
            onDrop={(event) => fileDrag(event, "drop")}
            onKeyDown={fileBlockOpen}
            onKeyDownCapture={fileBlockOpen}
        >
            {displayedFileError ? (
                <Banner
                    className="happy2-document-editor__file-error"
                    onDismiss={() => {
                        setFileError(undefined);
                        props.onFileErrorDismiss?.();
                    }}
                    tone="danger"
                    title="File attachment failed"
                >
                    {displayedFileError}
                </Banner>
            ) : null}
            <BlockNoteView
                data-testid={props["data-testid"]}
                editable={props.editable ?? true}
                editor={editor}
                theme={props.theme ?? "light"}
            />
            {dropTargetVisible ? (
                <div className="happy2-document-editor__drop-target" role="status">
                    Drop files into the document
                </div>
            ) : null}
        </div>
    );
}

/** Encodes one durable file id into the opaque reference stored by BlockNote. */
export function documentFileReference(fileId: string): string {
    return `${documentFileReferencePrefix}${encodeURIComponent(fileId)}`;
}

/** Decodes one Happy file reference, rejecting ordinary external URLs. */
export function documentFileReferenceParse(reference: string): string | undefined {
    if (!reference.startsWith(documentFileReferencePrefix)) return undefined;
    if (reference.includes("?", documentFileReferencePrefix.length)) return undefined;
    if (reference.includes("#", documentFileReferencePrefix.length)) return undefined;
    if (reference.includes("/", documentFileReferencePrefix.length)) return undefined;
    try {
        const fileId = decodeURIComponent(reference.slice(documentFileReferencePrefix.length));
        return fileId && !/[/?#]/.test(fileId) ? fileId : undefined;
    } catch {
        return undefined;
    }
}

function documentFileIds(blocks: readonly unknown[]): Set<string> {
    const fileIds = new Set<string>();
    const visit = (entries: readonly unknown[]) => {
        for (const entry of entries) {
            if (!entry || typeof entry !== "object") continue;
            const block = entry as {
                readonly props?: { readonly url?: unknown };
                readonly children?: readonly unknown[];
            };
            if (typeof block.props?.url === "string") {
                const fileId = documentFileReferenceParse(block.props.url);
                if (fileId) fileIds.add(fileId);
            }
            if (Array.isArray(block.children)) visit(block.children);
        }
    };
    visit(blocks);
    return fileIds;
}

function documentFileIdFromTarget(
    target: EventTarget | null,
    editor: ReturnType<typeof useCreateBlockNote>,
): string | undefined {
    if (!(target instanceof Element)) return undefined;
    const contentElement = target.closest<HTMLElement>('[data-content-type="file"]');
    const blockId = contentElement?.closest<HTMLElement>("[data-id]")?.dataset.id;
    if (!blockId) return undefined;
    const block = editor.getBlock(blockId);
    const reference = (block?.props as { readonly url?: unknown } | undefined)?.url;
    return typeof reference === "string" ? documentFileReferenceParse(reference) : undefined;
}

function displayError(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback;
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
