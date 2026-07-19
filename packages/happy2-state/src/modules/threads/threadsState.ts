import { createStore, type StoreApi } from "zustand/vanilla";
import { type ChatSummary, UserError } from "../../types.js";
import { type ChatMessageProjection, type Loadable } from "../chat/chatState.js";
import { messageProject } from "../chat/chatState.js";
import { type IdentityCatalog } from "../identity/identityState.js";
import { type StateRuntime, userError } from "../runtime/runtimeState.js";

export interface ThreadsActionContext {
    readonly runtime: StateRuntime;
    readonly identities: IdentityCatalog;
    readonly threads: ThreadsStore;
}

const generations = new WeakMap<ThreadsStore, number>();

/** Loads followed child chats and their roots into one coarse list projection. */
export async function threadsLoad(context: ThreadsActionContext, append = false): Promise<void> {
    const generation = (generations.get(context.threads) ?? 0) + 1;
    generations.set(context.threads, generation);
    const before = append ? context.threads.getState().nextCursor : undefined;
    if (!append) context.threads.getState().threadsInput({ type: "threadsLoading" });
    try {
        const result = await context.runtime.operation("getThreads", { limit: 100, before });
        const projected = await Promise.all(
            result.threads.map(async (chat): Promise<ThreadProjection> => {
                if (!chat.parentMessageId)
                    throw new UserError("The server returned a thread without a root message.");
                const root = await context.runtime.operation("getMessage", {
                    messageId: chat.parentMessageId,
                });
                if (root.message.id !== chat.parentMessageId)
                    throw new UserError("The server returned the wrong thread root message.");
                return {
                    chat,
                    root: messageProject(context.identities, root.message),
                };
            }),
        );
        if (generations.get(context.threads) !== generation) return;
        if (append && context.threads.getState().nextCursor !== before) return;
        context.threads.getState().threadsInput({
            type: "threadsLoaded",
            threads: projected,
            nextCursor: result.nextCursor,
            append,
        });
    } catch (error) {
        if (generations.get(context.threads) !== generation) return;
        context.threads.getState().threadsInput({
            type: append ? "threadsPageFailed" : "threadsFailed",
            error: userError(error),
        });
    }
}

/** Persists one thread-list intent and reconciles the coarse list from durable state. */
export async function threadsOutputRoute(
    context: ThreadsActionContext,
    event: ThreadsOutput,
): Promise<void> {
    if (event.type === "threadsMoreRequested") {
        await threadsLoad(context, true);
        return;
    }
    if (event.type === "threadsRefreshRequested") {
        await threadsLoad(context);
        return;
    }
    try {
        if (event.type === "threadReadSubmitted")
            await context.runtime.operation("markChatRead", { chatId: event.childChatId });
        else
            await context.runtime.operation("updateThreadFollow", {
                chatId: event.childChatId,
                followed: event.followed,
            });
        await threadsLoad(context);
    } catch (error) {
        context.threads
            .getState()
            .threadsInput({ type: "threadActionFailed", error: userError(error) });
    }
}

/** Creates the coarse thread inbox and its explicit entity-first local intents. */
export function threadsStoreCreate(
    output: (event: ThreadsOutput) => void = () => undefined,
): ThreadsStore {
    return createStore<ThreadsState>()((set, get) => ({
        threads: { type: "unloaded" },
        threadReadMark(childChatId): void {
            if (get().actionError) set({ actionError: undefined });
            output({ type: "threadReadSubmitted", childChatId });
        },
        threadFollowSet(childChatId, followed): void {
            if (get().actionError) set({ actionError: undefined });
            output({ type: "threadFollowSubmitted", childChatId, followed });
        },
        threadsMore(): void {
            const snapshot = get();
            if (snapshot.threads.type !== "ready" || !snapshot.nextCursor) return;
            if (snapshot.pageError) set({ pageError: undefined });
            output({ type: "threadsMoreRequested" });
        },
        threadsRetry(): void {
            if (get().threads.type !== "error") return;
            set({ threads: { type: "loading" } });
            output({ type: "threadsRefreshRequested" });
        },
        threadsInput(event): void {
            set((snapshot) => {
                switch (event.type) {
                    case "threadsLoading":
                        return snapshot.threads.type === "ready"
                            ? { ...snapshot, pageError: undefined }
                            : snapshot.threads.type === "loading"
                              ? snapshot
                              : {
                                    ...snapshot,
                                    threads: { type: "loading" },
                                    pageError: undefined,
                                };
                    case "threadsFailed":
                        return {
                            ...snapshot,
                            threads: { type: "error", error: event.error },
                            pageError: undefined,
                        };
                    case "threadsPageFailed":
                        return { ...snapshot, pageError: event.error };
                    case "threadActionFailed":
                        return { ...snapshot, actionError: event.error };
                    case "threadsLoaded": {
                        const current =
                            snapshot.threads.type === "ready" ? snapshot.threads.value : [];
                        const incoming = new Map(
                            event.threads.map((thread) => [thread.chat.id, thread]),
                        );
                        const currentById = new Map(
                            current.map((thread) => [thread.chat.id, thread]),
                        );
                        const reconcile = (thread: ThreadProjection): ThreadProjection => {
                            const previous = currentById.get(thread.chat.id);
                            return previous && threadEquivalent(previous, thread)
                                ? previous
                                : thread;
                        };
                        const value = event.append
                            ? [
                                  ...current.map((thread) => {
                                      const next = incoming.get(thread.chat.id);
                                      return next ? reconcile(next) : thread;
                                  }),
                                  ...event.threads
                                      .filter((thread) => !currentById.has(thread.chat.id))
                                      .map(reconcile),
                              ]
                            : event.threads.map(reconcile);
                        return {
                            threads: { type: "ready", value },
                            nextCursor: event.nextCursor,
                            actionError: undefined,
                            pageError: undefined,
                        };
                    }
                }
            });
        },
    }));
}

export interface ThreadProjection {
    readonly chat: ChatSummary;
    readonly root: ChatMessageProjection;
}

export interface ThreadsSnapshot {
    readonly threads: Loadable<readonly ThreadProjection[]>;
    readonly nextCursor?: string;
    readonly pageError?: UserError;
    readonly actionError?: UserError;
}

export type ThreadsOutput =
    | { readonly type: "threadsMoreRequested" }
    | { readonly type: "threadsRefreshRequested" }
    | { readonly type: "threadReadSubmitted"; readonly childChatId: string }
    | {
          readonly type: "threadFollowSubmitted";
          readonly childChatId: string;
          readonly followed: boolean;
      };

export type ThreadsInput =
    | { readonly type: "threadsLoading" }
    | {
          readonly type: "threadsLoaded";
          readonly threads: readonly ThreadProjection[];
          readonly nextCursor?: string;
          readonly append?: boolean;
      }
    | { readonly type: "threadsFailed"; readonly error: UserError }
    | { readonly type: "threadsPageFailed"; readonly error: UserError }
    | { readonly type: "threadActionFailed"; readonly error: UserError };

export interface ThreadsState extends ThreadsSnapshot {
    threadReadMark(childChatId: string): void;
    threadFollowSet(childChatId: string, followed: boolean): void;
    threadsMore(): void;
    threadsRetry(): void;
    threadsInput(event: ThreadsInput): void;
}

export type ThreadsStore = StoreApi<ThreadsState>;

function threadEquivalent(left: ThreadProjection, right: ThreadProjection): boolean {
    return (
        left.chat.id === right.chat.id &&
        left.chat.lifecycleVersion === right.chat.lifecycleVersion &&
        left.chat.pts === right.chat.pts &&
        left.chat.membershipEpoch === right.chat.membershipEpoch &&
        left.chat.lastReadSequence === right.chat.lastReadSequence &&
        left.chat.unreadCount === right.chat.unreadCount &&
        left.chat.followed === right.chat.followed &&
        left.chat.updatedAt === right.chat.updatedAt &&
        left.root.id === right.root.id &&
        left.root.changePts === right.root.changePts &&
        left.root.revision === right.root.revision &&
        left.root.threadReplyCount === right.root.threadReplyCount
    );
}
