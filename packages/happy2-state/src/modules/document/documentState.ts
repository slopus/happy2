import * as Y from "yjs";
import { createStore, type StoreApi } from "zustand/vanilla";
import { UserError, type DocumentPresenceEntry, type DocumentSummary } from "../../types.js";
import { type Loadable } from "../chat/chatState.js";
import { type StateRuntime, userError } from "../runtime/runtimeState.js";

/**
 * Transaction origin for server-delivered Yjs updates. The local capture
 * listener ignores this origin so reconciled content is never re-queued as a
 * local edit.
 */
export const documentRemoteOrigin = "happy2-document-remote";

const FLUSH_FIRST_DELAY_MS = 120;
const FLUSH_SUSTAINED_DELAY_MS = 500;
const PRESENCE_THROTTLE_MS = 1_000;
const PRESENCE_RENEWAL_MS = 10_000;
const SYNC_HINT_DEBOUNCE_MS = 400;

export interface DocumentActionContext {
    readonly runtime: StateRuntime;
    documentGet(documentId: string): DocumentStore | undefined;
}

interface DocumentTaskState {
    running: boolean;
    queued: boolean;
}

interface DocumentTimerState {
    flushTimer?: ReturnType<typeof setTimeout>;
    lastFlushAt?: number;
    reconcileTimer?: ReturnType<typeof setTimeout>;
    presenceTimer?: ReturnType<typeof setTimeout>;
    presenceRenewal?: ReturnType<typeof setInterval>;
    lastPresenceAt?: number;
}

const loadStates = new WeakMap<DocumentStore, DocumentTaskState>();
const syncStates = new WeakMap<DocumentStore, DocumentTaskState>();
const flushStates = new WeakMap<DocumentStore, DocumentTaskState>();
const timerStates = new WeakMap<DocumentStore, DocumentTimerState>();

function timers(binding: DocumentStore): DocumentTimerState {
    const existing = timerStates.get(binding);
    if (existing) return existing;
    const created: DocumentTimerState = {};
    timerStates.set(binding, created);
    return created;
}

/**
 * Hydrates one document session from the merged server snapshot with
 * single-flight coalescing, so a burst of open requests costs one GET and a
 * completion after the lease closed is discarded.
 */
export async function documentLoad(
    context: DocumentActionContext,
    documentId: string,
): Promise<void> {
    const binding = context.documentGet(documentId);
    if (!binding) return;
    const state = loadStates.get(binding) ?? { running: false, queued: false };
    loadStates.set(binding, state);
    if (state.running) {
        state.queued = true;
        return;
    }
    state.running = true;
    try {
        if (binding.getState().document.type !== "ready")
            binding.getState().documentInput({ type: "documentLoading" });
        do {
            state.queued = false;
            try {
                const result = await context.runtime.operation("getDocument", { documentId });
                if (context.documentGet(documentId) !== binding) return;
                binding.getState().documentInput({
                    type: "documentLoaded",
                    document: result.document,
                    snapshotUpdate: base64Decode(result.snapshot.update),
                    sequence: sequenceNumber(result.snapshot.sequence),
                });
            } catch (error) {
                if (context.documentGet(documentId) !== binding) return;
                if (!state.queued)
                    binding.getState().documentInput({
                        type: "documentFailed",
                        error: userError(error),
                    });
            }
        } while (state.queued);
    } finally {
        state.running = false;
    }
}

/**
 * Pulls the sequenced updates this session is missing and applies them to the
 * shared Y.Doc under the remote origin. Runs single-flight with one queued
 * trailing pass and loops server pages until the cursor reaches the head, so
 * any burst of delivery hints costs at most one extra request chain.
 */
export async function documentSynchronize(
    context: DocumentActionContext,
    documentId: string,
): Promise<void> {
    const binding = context.documentGet(documentId);
    if (!binding) return;
    if (binding.getState().document.type !== "ready") {
        await documentLoad(context, documentId);
        return;
    }
    const state = syncStates.get(binding) ?? { running: false, queued: false };
    syncStates.set(binding, state);
    if (state.running) {
        state.queued = true;
        return;
    }
    state.running = true;
    try {
        do {
            state.queued = false;
            try {
                let hasMore = true;
                while (hasMore) {
                    const result = await context.runtime.operation("getDocumentDifference", {
                        documentId,
                        afterSequence: String(binding.getState().latestSequence),
                    });
                    if (context.documentGet(documentId) !== binding) return;
                    binding.getState().documentInput({
                        type: "documentDifferenceApplied",
                        document: result.document,
                        snapshotUpdate:
                            result.snapshot === undefined
                                ? undefined
                                : base64Decode(result.snapshot.update),
                        updates: result.updates.map((entry) => base64Decode(entry.update)),
                        latestSequence: sequenceNumber(result.latestSequence),
                    });
                    hasMore = result.hasMore;
                }
            } catch (error) {
                if (context.documentGet(documentId) !== binding) return;
                if (!state.queued)
                    binding.getState().documentInput({
                        type: "documentSyncFailed",
                        error: userError(error),
                    });
            }
        } while (state.queued);
    } finally {
        state.running = false;
    }
}

/**
 * Debounces a document.updated delivery hint into one synchronize pass, and
 * skips hints whose sequence this session has already applied (its own
 * acknowledged batches arrive back as hints).
 */
export function documentReconcile(
    context: DocumentActionContext,
    documentId: string,
    sequence?: number,
): void {
    const binding = context.documentGet(documentId);
    if (!binding) return;
    if (sequence !== undefined && sequence <= binding.getState().latestSequence) return;
    const timer = timers(binding);
    if (timer.reconcileTimer !== undefined) return;
    timer.reconcileTimer = setTimeout(() => {
        timer.reconcileTimer = undefined;
        if (context.documentGet(documentId) !== binding) return;
        void documentSynchronize(context, documentId);
    }, SYNC_HINT_DEBOUNCE_MS);
}

/**
 * Schedules a batch flush on the session's non-resetting cadence: the first
 * edit after a quiet period flushes fast, sustained typing settles into a
 * fixed window, and an armed timer is never pushed back so continuous edits
 * cannot starve the flush.
 */
export function documentFlushSchedule(context: DocumentActionContext, documentId: string): void {
    const binding = context.documentGet(documentId);
    if (!binding) return;
    const timer = timers(binding);
    if (timer.flushTimer !== undefined) return;
    const now = Date.now();
    const recentlyFlushed =
        timer.lastFlushAt !== undefined && now - timer.lastFlushAt < FLUSH_SUSTAINED_DELAY_MS;
    timer.flushTimer = setTimeout(
        () => {
            timer.flushTimer = undefined;
            if (context.documentGet(documentId) !== binding) return;
            timer.lastFlushAt = Date.now();
            void documentFlush(context, documentId);
        },
        recentlyFlushed ? FLUSH_SUSTAINED_DELAY_MS : FLUSH_FIRST_DELAY_MS,
    );
}

/**
 * Sends the session's pending local updates as one idempotent batch. The batch
 * keeps one clientUpdateId across transport retries, terminal failure returns
 * the updates to the pending queue with a surfaced save error, and updates that
 * arrived while the batch was in flight schedule a follow-up flush.
 */
export async function documentFlush(
    context: DocumentActionContext,
    documentId: string,
): Promise<void> {
    const binding = context.documentGet(documentId);
    if (!binding) return;
    const state = flushStates.get(binding) ?? { running: false, queued: false };
    flushStates.set(binding, state);
    if (state.running || binding.getState().pendingUpdates.length === 0) return;
    state.running = true;
    const clientUpdateId = randomId();
    const updates = binding.getState().pendingUpdates;
    binding.getState().documentInput({ type: "documentFlushStarted" });
    try {
        const result = await context.runtime.operation("applyDocumentUpdates", {
            documentId,
            clientUpdateId,
            updates: updates.map(base64Encode),
        });
        if (context.documentGet(documentId) !== binding) return;
        binding.getState().documentInput({
            type: "documentFlushSucceeded",
            document: result.document,
            acceptedSequence: sequenceNumber(result.acceptedSequence),
        });
    } catch (error) {
        if (context.documentGet(documentId) !== binding) return;
        binding.getState().documentInput({
            type: "documentFlushFailed",
            updates,
            error: userError(error),
        });
        return;
    } finally {
        state.running = false;
    }
    if (binding.getState().pendingUpdates.length > 0) documentFlushSchedule(context, documentId);
}

/**
 * Throttles local presence announcements to the send cadence and keeps an
 * active participant's lease renewed ahead of the server TTL, so remote
 * cursors stay live without a request per keystroke.
 */
export function documentPresenceSchedule(context: DocumentActionContext, documentId: string): void {
    const binding = context.documentGet(documentId);
    if (!binding) return;
    const timer = timers(binding);
    if (timer.presenceRenewal === undefined) {
        timer.presenceRenewal = setInterval(() => {
            if (context.documentGet(documentId) !== binding) return;
            if (!binding.getState().localPresence.active) return;
            void documentPresenceSend(context, documentId);
        }, PRESENCE_RENEWAL_MS);
    }
    if (timer.presenceTimer !== undefined) return;
    const now = Date.now();
    const elapsed = timer.lastPresenceAt === undefined ? Infinity : now - timer.lastPresenceAt;
    const delay = Math.max(0, PRESENCE_THROTTLE_MS - elapsed);
    timer.presenceTimer = setTimeout(() => {
        timer.presenceTimer = undefined;
        if (context.documentGet(documentId) !== binding) return;
        timer.lastPresenceAt = Date.now();
        void documentPresenceSend(context, documentId);
    }, delay);
}

/**
 * Announces the session's current local presence and reconciles the roster
 * from the authoritative response rather than trusting the echoed event.
 * Failures are swallowed: presence is an ephemeral hint and the next cadence
 * tick or renewal simply announces again.
 */
export async function documentPresenceSend(
    context: DocumentActionContext,
    documentId: string,
): Promise<void> {
    const binding = context.documentGet(documentId);
    if (!binding) return;
    const snapshot = binding.getState();
    const revision = snapshot.localPresence.revision;
    try {
        const result = await context.runtime.operation("updateDocumentPresence", {
            documentId,
            clientId: snapshot.clientId,
            revision,
            active: snapshot.localPresence.active,
            ...(snapshot.localPresence.state === undefined
                ? {}
                : { state: snapshot.localPresence.state }),
        });
        if (context.documentGet(documentId) !== binding) return;
        binding.getState().documentInput({
            type: "documentPresenceListed",
            presence: result.presence,
        });
    } catch {
        // Ephemeral by contract; the renewal interval retries.
    }
}

/**
 * Best-effort final announcement that this client left the document, sent when
 * a lease closes so other participants drop the cursor before its TTL.
 */
export async function documentLeaveAnnounce(
    runtime: StateRuntime,
    documentId: string,
    clientId: string,
    revision: number,
): Promise<void> {
    try {
        await runtime.operation("updateDocumentPresence", {
            documentId,
            clientId,
            revision,
            active: false,
        });
    } catch {
        // The server TTL expires the participant anyway.
    }
}

/**
 * Creates one document in a channel and resolves with its summary. List
 * surfaces reconcile through the documents-area sync hint rather than a local
 * write, so the store graph never fabricates server state.
 */
export async function documentCreate(
    context: { readonly runtime: StateRuntime },
    chatId: string,
    input: { readonly title: string; readonly initialUpdate?: string },
): Promise<DocumentSummary> {
    const result = await context.runtime.operation("createDocument", {
        chatId,
        title: input.title,
        ...(input.initialUpdate === undefined ? {} : { initialUpdate: input.initialUpdate }),
    });
    return result.document;
}

/**
 * Creates one standalone document owned by the caller and attached to no
 * channel; the collection surface reconciles through the documents-area hint.
 */
export async function documentStandaloneCreate(
    context: { readonly runtime: StateRuntime },
    input: { readonly title: string; readonly initialUpdate?: string },
): Promise<DocumentSummary> {
    const result = await context.runtime.operation("createStandaloneDocument", {
        title: input.title,
        ...(input.initialUpdate === undefined ? {} : { initialUpdate: input.initialUpdate }),
    });
    return result.document;
}

/**
 * Attaches one document to a channel so its members gain access; already
 * attached is treated as success so a repeated mention stays idempotent.
 */
export async function documentAttach(
    context: { readonly runtime: StateRuntime },
    documentId: string,
    chatId: string,
): Promise<void> {
    try {
        await context.runtime.operation("attachDocument", { documentId, chatId });
    } catch (error) {
        if (error instanceof UserError && error.code === "conflict") return;
        throw error;
    }
}

/**
 * Detaches one document from a channel without deleting it; members of that
 * channel lose access unless another attachment or ownership grants it.
 */
export async function documentDetach(
    context: { readonly runtime: StateRuntime },
    documentId: string,
    chatId: string,
): Promise<void> {
    await context.runtime.operation("detachDocument", { documentId, chatId });
}

/**
 * Renames one document and applies the authoritative summary to its open
 * session immediately; list surfaces reconcile through the documents-area
 * sync hint.
 */
export async function documentRename(
    context: DocumentActionContext,
    documentId: string,
    title: string,
): Promise<void> {
    const result = await context.runtime.operation("renameDocument", { documentId, title });
    context
        .documentGet(documentId)
        ?.getState()
        .documentInput({ type: "documentRenamed", document: result.document });
}

/**
 * Deletes one document; list surfaces reconcile through the documents-area
 * sync hint and an open session surfaces the deletion on its next reconcile.
 */
export async function documentDelete(
    context: { readonly runtime: StateRuntime },
    documentId: string,
): Promise<void> {
    await context.runtime.operation("deleteDocument", { documentId });
}

/** Stops every timer a session owns; safe to call more than once. */
export function documentSessionStop(binding: DocumentStore): void {
    const timer = timerStates.get(binding);
    if (!timer) return;
    if (timer.flushTimer !== undefined) clearTimeout(timer.flushTimer);
    if (timer.reconcileTimer !== undefined) clearTimeout(timer.reconcileTimer);
    if (timer.presenceTimer !== undefined) clearTimeout(timer.presenceTimer);
    if (timer.presenceRenewal !== undefined) clearInterval(timer.presenceRenewal);
    timerStates.delete(binding);
}

export interface DocumentOpenContext {
    documentAcquire(documentId: string): DocumentStore;
    documentRelease(documentId: string): void;
    documentLoad(documentId: string): void;
    documentLeave(documentId: string, clientId: string, revision: number): void;
}

/**
 * Acquires one deduplicated document session and returns a disposable lease.
 * The final dispose announces the departure, stops session timers, and frees
 * the store.
 */
export function documentOpen(context: DocumentOpenContext, documentId: string): DocumentHandle {
    const binding = context.documentAcquire(documentId);
    if (binding.getState().document.type === "unloaded") context.documentLoad(documentId);
    let disposed = false;
    return {
        ...binding,
        [Symbol.dispose](): void {
            if (disposed) return;
            disposed = true;
            const snapshot = binding.getState();
            context.documentLeave(
                documentId,
                snapshot.clientId,
                snapshot.localPresence.revision + 1,
            );
            context.documentRelease(documentId);
        },
    };
}

/**
 * Creates one collaborative document session owning a fresh Y.Doc. Local Yjs
 * transactions (any origin except the remote origin) are captured into the
 * pending batch and surfaced through the `documentUpdatesQueued` output; the
 * private input applies authoritative snapshots, differences, flush and
 * presence results.
 */
export function documentStoreCreate(
    documentId: string,
    output: (event: DocumentOutput) => void = () => undefined,
    options: { readonly clientId?: string } = {},
): DocumentStore {
    const ydoc = new Y.Doc();
    const store = createStore<DocumentSessionState>()((set, get) => ({
        documentId,
        clientId: options.clientId ?? randomId(),
        ydoc,
        document: { type: "unloaded" },
        latestSequence: 0,
        pendingUpdates: [],
        inFlightUpdates: [],
        saveState: "idle",
        saveError: undefined,
        presence: [],
        localPresence: { revision: 0, active: false, state: undefined },
        documentEditCaptured(update): void {
            set((snapshot) => ({
                ...snapshot,
                pendingUpdates: [...snapshot.pendingUpdates, update],
                saveState: snapshot.saveState === "saving" ? "saving" : "dirty",
            }));
            output({ type: "documentUpdatesQueued", documentId });
        },
        documentPresenceUpdate(state, active): void {
            set((snapshot) => ({
                ...snapshot,
                localPresence: {
                    revision: snapshot.localPresence.revision + 1,
                    active,
                    state,
                },
            }));
            output({ type: "documentPresenceQueued", documentId });
        },
        documentInput(event): void {
            if (event.type === "documentLoaded") {
                Y.applyUpdate(ydoc, event.snapshotUpdate, documentRemoteOrigin);
                set((snapshot) => ({
                    ...snapshot,
                    document: { type: "ready", value: event.document },
                    latestSequence: Math.max(snapshot.latestSequence, event.sequence),
                }));
                return;
            }
            if (event.type === "documentDifferenceApplied") {
                if (event.snapshotUpdate !== undefined)
                    Y.applyUpdate(ydoc, event.snapshotUpdate, documentRemoteOrigin);
                for (const update of event.updates)
                    Y.applyUpdate(ydoc, update, documentRemoteOrigin);
                set((snapshot) => ({
                    ...snapshot,
                    document:
                        event.document === undefined
                            ? snapshot.document
                            : { type: "ready", value: event.document },
                    latestSequence: Math.max(snapshot.latestSequence, event.latestSequence),
                }));
                return;
            }
            set((snapshot) => documentInputReduce(snapshot, event));
        },
    }));
    ydoc.on("update", (update: Uint8Array, origin: unknown) => {
        if (origin === documentRemoteOrigin) return;
        store.getState().documentEditCaptured(update);
    });
    return store;
}

type DocumentReducedInput = Exclude<
    DocumentInput,
    { type: "documentLoaded" } | { type: "documentDifferenceApplied" }
>;

function documentInputReduce(
    snapshot: DocumentSessionState,
    event: DocumentReducedInput,
): DocumentSessionState {
    switch (event.type) {
        case "documentLoading":
            return { ...snapshot, document: { type: "loading" } };
        case "documentFailed":
            return { ...snapshot, document: { type: "error", error: event.error } };
        case "documentSyncFailed":
            // Content already rendered stays usable; the next hint or renewal retries.
            return snapshot.document.type === "ready"
                ? snapshot
                : { ...snapshot, document: { type: "error", error: event.error } };
        case "documentFlushStarted":
            return {
                ...snapshot,
                inFlightUpdates: snapshot.pendingUpdates,
                pendingUpdates: [],
                saveState: "saving",
                saveError: undefined,
            };
        case "documentFlushSucceeded":
            return {
                ...snapshot,
                inFlightUpdates: [],
                document: { type: "ready", value: event.document },
                latestSequence: Math.max(snapshot.latestSequence, event.acceptedSequence),
                saveState: snapshot.pendingUpdates.length > 0 ? "dirty" : "idle",
            };
        case "documentFlushFailed":
            // Yjs updates commute, so returning the failed batch ahead of newer
            // edits preserves convergence.
            return {
                ...snapshot,
                inFlightUpdates: [],
                pendingUpdates: [...event.updates, ...snapshot.pendingUpdates],
                saveState: "error",
                saveError: event.error,
            };
        case "documentPresenceReconciled": {
            if (event.presence.clientId === snapshot.clientId) return snapshot;
            const now = Date.now();
            const others = snapshot.presence.filter(
                (entry) =>
                    !(
                        entry.userId === event.presence.userId &&
                        entry.clientId === event.presence.clientId
                    ) && !presenceExpired(entry, now),
            );
            const existing = snapshot.presence.find(
                (entry) =>
                    entry.userId === event.presence.userId &&
                    entry.clientId === event.presence.clientId,
            );
            if (existing && existing.revision >= event.presence.revision) return snapshot;
            return {
                ...snapshot,
                presence:
                    event.presence.active && !presenceExpired(event.presence, now)
                        ? [...others, event.presence]
                        : others,
            };
        }
        case "documentPresenceListed": {
            const now = Date.now();
            return {
                ...snapshot,
                presence: event.presence.filter(
                    (entry) =>
                        entry.clientId !== snapshot.clientId &&
                        entry.active &&
                        !presenceExpired(entry, now),
                ),
            };
        }
        case "documentRenamed":
            return { ...snapshot, document: { type: "ready", value: event.document } };
        default: {
            const exhaustive: never = event;
            throw new Error(`Unhandled document input: ${String(exhaustive)}`);
        }
    }
}

function presenceExpired(entry: DocumentPresenceEntry, now: number): boolean {
    return entry.expiresAt !== undefined && entry.expiresAt <= now;
}

function base64Decode(value: string): Uint8Array {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
}

function base64Encode(bytes: Uint8Array): string {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

function sequenceNumber(value: string): number {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function randomId(): string {
    return crypto.randomUUID();
}

export interface DocumentLocalPresence {
    readonly revision: number;
    readonly active: boolean;
    readonly state?: unknown;
}

export interface DocumentSessionSnapshot {
    readonly documentId: string;
    readonly clientId: string;
    /** Stable Y.Doc identity for editor bindings; its content mutates via Yjs. */
    readonly ydoc: Y.Doc;
    readonly document: Loadable<DocumentSummary>;
    /** Highest server sequence already applied to the Y.Doc. */
    readonly latestSequence: number;
    readonly pendingUpdates: readonly Uint8Array[];
    readonly inFlightUpdates: readonly Uint8Array[];
    readonly saveState: "idle" | "dirty" | "saving" | "error";
    readonly saveError?: UserError;
    /** Remote participants only; the local client is never listed. */
    readonly presence: readonly DocumentPresenceEntry[];
    readonly localPresence: DocumentLocalPresence;
}

export type DocumentOutput =
    | { readonly type: "documentUpdatesQueued"; readonly documentId: string }
    | { readonly type: "documentPresenceQueued"; readonly documentId: string };

export type DocumentInput =
    | { readonly type: "documentLoading" }
    | {
          readonly type: "documentLoaded";
          readonly document: DocumentSummary;
          readonly snapshotUpdate: Uint8Array;
          readonly sequence: number;
      }
    | { readonly type: "documentFailed"; readonly error: UserError }
    | { readonly type: "documentSyncFailed"; readonly error: UserError }
    | {
          readonly type: "documentDifferenceApplied";
          readonly document?: DocumentSummary;
          readonly snapshotUpdate?: Uint8Array;
          readonly updates: readonly Uint8Array[];
          readonly latestSequence: number;
      }
    | { readonly type: "documentFlushStarted" }
    | {
          readonly type: "documentFlushSucceeded";
          readonly document: DocumentSummary;
          readonly acceptedSequence: number;
      }
    | {
          readonly type: "documentFlushFailed";
          readonly updates: readonly Uint8Array[];
          readonly error: UserError;
      }
    | {
          readonly type: "documentPresenceReconciled";
          readonly presence: DocumentPresenceEntry;
      }
    | {
          readonly type: "documentPresenceListed";
          readonly presence: readonly DocumentPresenceEntry[];
      }
    | { readonly type: "documentRenamed"; readonly document: DocumentSummary };

export interface DocumentSessionState extends DocumentSessionSnapshot {
    documentEditCaptured(update: Uint8Array): void;
    documentPresenceUpdate(state: unknown, active: boolean): void;
    documentInput(event: DocumentInput): void;
}

export type DocumentStore = StoreApi<DocumentSessionState>;

export interface DocumentHandle extends DocumentStore, Disposable {}
