import { ApiResponseError } from "../../api.js";
import { createStore, type StoreApi } from "zustand/vanilla";
import { type ChatSummary, type SendMessageInput, UserError } from "../../types.js";
import { type ChatHandle, type ChatStore, messageItemProject } from "../chat/chatState.js";
import { type IdentityCatalog } from "../identity/identityState.js";
import { type StateRuntime, userError } from "../runtime/runtimeState.js";

export interface ThreadActionContext {
    readonly runtime: StateRuntime;
    readonly identities: IdentityCatalog;
    threadGet(parentChatId: string, rootMessageId: string): ThreadStore | undefined;
    chatGet(chatId: string): ChatStore | undefined;
    messageSend(chatId: string, input: SendMessageInput): void;
}

const generations = new WeakMap<ThreadStore, number>();

/** Resolves one retained root and its optional child chat without copying either timeline. */
export async function threadResolve(
    context: ThreadActionContext,
    parentChatId: string,
    rootMessageId: string,
): Promise<void> {
    const binding = context.threadGet(parentChatId, rootMessageId);
    if (!binding) return;
    const generation = (generations.get(binding) ?? 0) + 1;
    generations.set(binding, generation);
    binding.getState().threadInput({ type: "threadResolutionLoading" });

    const current = (): ThreadStore | undefined =>
        context.threadGet(parentChatId, rootMessageId) === binding &&
        generations.get(binding) === generation
            ? binding
            : undefined;

    try {
        const parent = context.chatGet(parentChatId);
        if (!parent) throw new UserError("The parent conversation is no longer open.");
        await chatInitialLoadSettle(parent, binding);
        if (!current()) return;
        const activeParent = context.chatGet(parentChatId);
        if (activeParent !== parent)
            throw new UserError("The parent conversation changed while opening the thread.");
        const loadedRoot = parent
            .getState()
            .messages.find(({ message }) => message.id === rootMessageId)?.message;
        if (loadedRoot && loadedRoot.chatId !== parentChatId)
            throw new UserError("The thread root does not belong to this conversation.");
        if (!loadedRoot) {
            const result = await context.runtime.operation("getMessage", {
                messageId: rootMessageId,
            });
            if (result.message.chatId !== parentChatId)
                throw new UserError("The thread root does not belong to this conversation.");
            if (!current() || context.chatGet(parentChatId) !== parent) return;
            parent.getState().chatInput({
                type: "messageUpserted",
                item: messageItemProject(context.identities, result.message),
            });
        }
    } catch (error) {
        current()
            ?.getState()
            .threadInput({
                type: "threadResolutionFailed",
                stage: "root",
                error: userError(error),
            });
        return;
    }

    try {
        const result = await context.runtime.operation("getThread", { messageId: rootMessageId });
        validateChild(result.chat, rootMessageId);
        const retained = current();
        if (!retained) return;
        retained.getState().threadInput({
            type: "threadResolutionReady",
            childChatId: result.chat.id,
        });
        childSummaryReconcile(context.chatGet(result.chat.id), result.chat);
    } catch (error) {
        const retained = current();
        if (!retained) return;
        if (notFound(error)) {
            retained.getState().threadInput({ type: "threadResolutionAbsent" });
            return;
        }
        retained.getState().threadInput({
            type: "threadResolutionFailed",
            stage: "child",
            error: userError(error),
        });
    }
}

/** Creates the absent child once, retains its ordinary chat surface, then sends the queued reply. */
export async function threadCreateAndSend(
    context: ThreadActionContext,
    event: Extract<ThreadOutput, { readonly type: "threadCreateSubmitted" }>,
): Promise<void> {
    try {
        const result = await context.runtime.operationWithIdempotencyKey(
            "createThread",
            event.clientMutationId,
            { messageId: event.rootMessageId },
        );
        validateChild(result.chat, event.rootMessageId);
        const retained = context.threadGet(event.parentChatId, event.rootMessageId);
        retained?.getState().threadInput({
            type: "threadCreateSucceeded",
            childChatId: result.chat.id,
            clientMutationId: event.clientMutationId,
            draftRevision: event.draftRevision,
        });
        childSummaryReconcile(context.chatGet(result.chat.id), result.chat);
        context.messageSend(result.chat.id, event.input);
    } catch (error) {
        context
            .threadGet(event.parentChatId, event.rootMessageId)
            ?.getState()
            .threadInput({
                type: "threadCreateFailed",
                clientMutationId: event.clientMutationId,
                error: userError(error),
            });
    }
}

export interface ThreadOpenContext {
    threadAcquire(parentChatId: string, rootMessageId: string): ThreadStore;
    threadRelease(parentChatId: string, rootMessageId: string): boolean;
    threadResolve(parentChatId: string, rootMessageId: string): void;
    chatOpen(chatId: string): ChatHandle;
}

/** Acquires one resolver plus exactly one ordinary child-chat lease while it is ready. */
export function threadOpen(
    context: ThreadOpenContext,
    parentChatId: string,
    rootMessageId: string,
): ThreadHandle {
    const binding = context.threadAcquire(parentChatId, rootMessageId);
    let child: ChatHandle | undefined;
    let childChatId: string | undefined;
    const childReconcile = (): void => {
        const resolution = binding.getState().resolution;
        const nextId = resolution.type === "ready" ? resolution.childChatId : undefined;
        if (nextId === childChatId) return;
        child?.[Symbol.dispose]();
        child = nextId ? context.chatOpen(nextId) : undefined;
        childChatId = nextId;
    };
    childReconcile();
    const unsubscribe = binding.subscribe(childReconcile);
    if (binding.getState().resolution.type === "unloaded")
        context.threadResolve(parentChatId, rootMessageId);
    let disposed = false;
    return {
        ...binding,
        childChat: () => child,
        [Symbol.dispose](): void {
            if (disposed) return;
            disposed = true;
            unsubscribe();
            child?.[Symbol.dispose]();
            child = undefined;
            childChatId = undefined;
            if (
                context.threadRelease(parentChatId, rootMessageId) &&
                binding.getState().resolution.type === "loading"
            )
                binding.getState().threadInput({ type: "threadResolutionCancelled" });
        },
    };
}

export interface ThreadStoreOptions {
    readonly createId?: () => string;
    readonly output?: (event: ThreadOutput) => void;
}

/** Creates the local resolver/create surface; parent and reply projections stay in ChatStore. */
export function threadStoreCreate(
    parentChatId: string,
    rootMessageId: string,
    options: ThreadStoreOptions = {},
): ThreadStore {
    const output = options.output ?? (() => undefined);
    const createId = options.createId ?? defaultId;
    const submitted = new Map<string, SendMessageInput>();
    let pendingCreate: ThreadCreateSubmission | undefined;
    return createStore<ThreadState>()((set, get) => ({
        parentChatId,
        rootMessageId,
        resolution: { type: "unloaded" },
        create: { type: "idle" },
        draft: "",
        draftRevision: 0,
        replyDraftUpdate(value): void {
            const snapshot = get();
            if (snapshot.draft === value) return;
            set({
                draft: value,
                draftRevision: snapshot.draftRevision + 1,
                ...(snapshot.create.type === "error" ? { create: { type: "idle" } } : {}),
            });
            if (snapshot.create.type === "error") pendingCreate = undefined;
        },
        replySubmit(): void {
            const snapshot = get();
            const text = snapshot.draft.trim();
            if (!text || snapshot.create.type === "pending") return;
            if (snapshot.resolution.type !== "absent" && snapshot.resolution.type !== "ready")
                return;
            const clientMutationId = createId();
            const input = { text, clientMutationId } satisfies SendMessageInput;
            submitted.set(clientMutationId, input);
            if (snapshot.resolution.type === "absent") {
                pendingCreate = {
                    clientMutationId,
                    draftRevision: snapshot.draftRevision,
                    input,
                };
                set({ create: { type: "pending", clientMutationId } });
                output({
                    type: "threadCreateSubmitted",
                    parentChatId,
                    rootMessageId,
                    ...pendingCreate,
                });
                return;
            }
            set({
                draft: "",
                draftRevision: snapshot.draftRevision + 1,
                create: { type: "idle" },
            });
            output({
                type: "threadReplySubmitted",
                childChatId: snapshot.resolution.childChatId,
                clientMutationId,
                input,
            });
        },
        replyRetry(clientMutationId): void {
            const snapshot = get();
            const input = submitted.get(clientMutationId);
            if (snapshot.resolution.type !== "ready" || !input) return;
            output({
                type: "threadReplySubmitted",
                childChatId: snapshot.resolution.childChatId,
                clientMutationId,
                input,
            });
        },
        threadResolutionRetry(): void {
            if (get().resolution.type !== "error") return;
            set({ resolution: { type: "loading" } });
            output({ type: "threadResolutionRequested", parentChatId, rootMessageId });
        },
        childChatLoadRetry(): void {
            const resolution = get().resolution;
            if (resolution.type === "ready")
                output({ type: "childChatLoadRequested", childChatId: resolution.childChatId });
        },
        threadCreateRetry(): void {
            const snapshot = get();
            if (
                snapshot.create.type !== "error" ||
                !pendingCreate ||
                pendingCreate.clientMutationId !== snapshot.create.clientMutationId
            )
                return;
            set({ create: { type: "pending", clientMutationId: pendingCreate.clientMutationId } });
            output({
                type: "threadCreateSubmitted",
                parentChatId,
                rootMessageId,
                ...pendingCreate,
            });
        },
        threadInput(event): void {
            set((snapshot) => {
                switch (event.type) {
                    case "threadResolutionLoading":
                        return snapshot.resolution.type === "ready" ||
                            snapshot.resolution.type === "loading"
                            ? snapshot
                            : { ...snapshot, resolution: { type: "loading" } };
                    case "threadResolutionCancelled":
                        return snapshot.resolution.type === "loading"
                            ? { ...snapshot, resolution: { type: "unloaded" } }
                            : snapshot;
                    case "threadResolutionAbsent":
                        return { ...snapshot, resolution: { type: "absent" } };
                    case "threadResolutionFailed":
                        return {
                            ...snapshot,
                            resolution: {
                                type: "error",
                                stage: event.stage,
                                error: event.error,
                            },
                        };
                    case "threadResolutionReady":
                        return snapshot.resolution.type === "ready" &&
                            snapshot.resolution.childChatId === event.childChatId
                            ? snapshot
                            : {
                                  ...snapshot,
                                  resolution: {
                                      type: "ready",
                                      childChatId: event.childChatId,
                                  },
                              };
                    case "threadCreateFailed":
                        if (
                            snapshot.create.type !== "pending" ||
                            snapshot.create.clientMutationId !== event.clientMutationId
                        )
                            return snapshot;
                        return {
                            ...snapshot,
                            create: {
                                type: "error",
                                clientMutationId: event.clientMutationId,
                                error: event.error,
                            },
                        };
                    case "threadCreateSucceeded": {
                        if (
                            snapshot.create.type !== "pending" ||
                            snapshot.create.clientMutationId !== event.clientMutationId
                        )
                            return snapshot;
                        pendingCreate = undefined;
                        const draftUnchanged = snapshot.draftRevision === event.draftRevision;
                        return {
                            ...snapshot,
                            resolution: { type: "ready", childChatId: event.childChatId },
                            create: { type: "idle" },
                            ...(draftUnchanged
                                ? {
                                      draft: "",
                                      draftRevision: snapshot.draftRevision + 1,
                                  }
                                : {}),
                        };
                    }
                }
            });
        },
    }));
}

export type ThreadResolution =
    | { readonly type: "unloaded" }
    | { readonly type: "loading" }
    | { readonly type: "absent" }
    | {
          readonly type: "error";
          readonly stage: "root" | "child";
          readonly error: UserError;
      }
    | { readonly type: "ready"; readonly childChatId: string };

export type ThreadCreateState =
    | { readonly type: "idle" }
    | { readonly type: "pending"; readonly clientMutationId: string }
    | { readonly type: "error"; readonly clientMutationId: string; readonly error: UserError };

export interface ThreadSnapshot {
    readonly parentChatId: string;
    readonly rootMessageId: string;
    readonly resolution: ThreadResolution;
    readonly create: ThreadCreateState;
    readonly draft: string;
    readonly draftRevision: number;
}

interface ThreadCreateSubmission {
    readonly input: SendMessageInput;
    readonly clientMutationId: string;
    readonly draftRevision: number;
}

export type ThreadOutput =
    | {
          readonly type: "threadResolutionRequested";
          readonly parentChatId: string;
          readonly rootMessageId: string;
      }
    | { readonly type: "childChatLoadRequested"; readonly childChatId: string }
    | ({
          readonly type: "threadCreateSubmitted";
          readonly parentChatId: string;
          readonly rootMessageId: string;
      } & ThreadCreateSubmission)
    | {
          readonly type: "threadReplySubmitted";
          readonly childChatId: string;
          readonly clientMutationId: string;
          readonly input: SendMessageInput;
      };

export type ThreadInput =
    | { readonly type: "threadResolutionLoading" }
    | { readonly type: "threadResolutionCancelled" }
    | { readonly type: "threadResolutionAbsent" }
    | {
          readonly type: "threadResolutionFailed";
          readonly stage: "root" | "child";
          readonly error: UserError;
      }
    | { readonly type: "threadResolutionReady"; readonly childChatId: string }
    | {
          readonly type: "threadCreateSucceeded";
          readonly childChatId: string;
          readonly clientMutationId: string;
          readonly draftRevision: number;
      }
    | {
          readonly type: "threadCreateFailed";
          readonly clientMutationId: string;
          readonly error: UserError;
      };

export interface ThreadState extends ThreadSnapshot {
    replyDraftUpdate(value: string): void;
    replySubmit(): void;
    replyRetry(clientMutationId: string): void;
    threadResolutionRetry(): void;
    childChatLoadRetry(): void;
    threadCreateRetry(): void;
    threadInput(event: ThreadInput): void;
}

export type ThreadStore = StoreApi<ThreadState>;

export interface ThreadHandle extends ThreadStore, Disposable {
    childChat(): ChatStore | undefined;
}

function validateChild(chat: ChatSummary, rootMessageId: string): void {
    if (chat.parentMessageId !== rootMessageId)
        throw new UserError("The resolved thread does not match its root message.");
}

function childSummaryReconcile(child: ChatStore | undefined, summary: ChatSummary): void {
    if (!child || child.getState().status.type === "loading") return;
    child.getState().chatInput({ type: "chatSummaryReconciled", chat: summary });
}

function notFound(error: unknown): boolean {
    const cause = error instanceof UserError ? error.cause : error;
    return cause instanceof ApiResponseError && cause.response.status === 404;
}

function chatInitialLoadSettle(chat: ChatStore, thread: ThreadStore): Promise<void> {
    if (chat.getState().status.type !== "loading") return Promise.resolve();
    return new Promise((resolve) => {
        let settled = false;
        let chatUnsubscribe: () => void = () => undefined;
        let threadUnsubscribe: () => void = () => undefined;
        const finish = (): void => {
            if (settled) return;
            settled = true;
            chatUnsubscribe();
            threadUnsubscribe();
            resolve();
        };
        chatUnsubscribe = chat.subscribe((snapshot) => {
            if (snapshot.status.type !== "loading") finish();
        });
        threadUnsubscribe = thread.subscribe((snapshot) => {
            if (snapshot.resolution.type !== "loading") finish();
        });
        if (
            chat.getState().status.type !== "loading" ||
            thread.getState().resolution.type !== "loading"
        )
            finish();
    });
}

function defaultId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
