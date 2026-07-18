import { createStore, type StoreApi } from "zustand/vanilla";
import { type NotificationLevel, type ThreadSummary, type UserError } from "../../types.js";
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

/** Loads the coarse subscribed-thread list without materializing individual reply timelines. */
export async function threadsLoad(context: ThreadsActionContext, append = false): Promise<void> {
    const generation = (generations.get(context.threads) ?? 0) + 1;
    generations.set(context.threads, generation);
    const before = append ? context.threads.getState().nextCursor : undefined;
    if (!append) context.threads.getState().threadsInput({ type: "threadsLoading" });
    try {
        const result = await context.runtime.operation("getThreads", { limit: 100, before });
        if (generations.get(context.threads) !== generation) return;
        if (append && context.threads.getState().nextCursor !== before) return;
        context.threads.getState().threadsInput({
            type: "threadsLoaded",
            threads: result.threads.map((thread) => ({
                ...thread,
                root: messageProject(context.identities, thread.root),
            })),
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

/** Persists one thread-list intent and reconciles the retained list from durable state. */
export async function threadsOutputRoute(
    context: ThreadsActionContext,
    event: ThreadsOutput,
): Promise<void> {
    if (event.type === "threadsMoreRequested") {
        await threadsLoad(context, true);
        return;
    }
    try {
        if (event.type === "threadReadSubmitted")
            await context.runtime.operation("markThreadRead", {
                messageId: event.rootMessageId,
                throughMessageId: event.throughMessageId,
            });
        else
            await context.runtime.operation("updateThreadSubscription", {
                messageId: event.rootMessageId,
                subscribed: event.subscribed,
                notificationLevel: event.notificationLevel,
            });
        await threadsLoad(context);
    } catch (error) {
        context.threads
            .getState()
            .threadsInput({ type: "threadActionFailed", error: userError(error) });
    }
}

/** Creates the coarse inbox-style thread list and its explicit local intents. */
export function threadsStoreCreate(
    output: (event: ThreadsOutput) => void = () => undefined,
): ThreadsStore {
    return createStore<ThreadsState>()((set, get) => ({
        threads: { type: "unloaded" },
        threadReadMark(rootMessageId, throughMessageId): void {
            if (get().actionError) set({ actionError: undefined });
            output({ type: "threadReadSubmitted", rootMessageId, throughMessageId });
        },
        threadSubscriptionSet(rootMessageId, subscribed, notificationLevel): void {
            if (get().actionError) set({ actionError: undefined });
            output({
                type: "threadSubscriptionSubmitted",
                rootMessageId,
                subscribed,
                notificationLevel,
            });
        },
        threadsMore(): void {
            const snapshot = get();
            if (snapshot.threads.type === "ready" && snapshot.nextCursor)
                output({ type: "threadsMoreRequested" });
        },
        threadsInput(event): void {
            set((snapshot) => {
                if (event.type === "threadsLoading")
                    return { ...snapshot, threads: { type: "loading" } };
                if (event.type === "threadsFailed")
                    return { ...snapshot, threads: { type: "error", error: event.error } };
                if (event.type === "threadsPageFailed")
                    return { ...snapshot, pageError: event.error };
                if (event.type === "threadActionFailed")
                    return { ...snapshot, actionError: event.error };
                const current =
                    event.append && snapshot.threads.type === "ready" ? snapshot.threads.value : [];
                const incoming = new Map(event.threads.map((thread) => [thread.root.id, thread]));
                const known = new Set(current.map((thread) => thread.root.id));
                return {
                    threads: {
                        type: "ready",
                        value: [
                            ...current.map((thread) => incoming.get(thread.root.id) ?? thread),
                            ...event.threads.filter((thread) => !known.has(thread.root.id)),
                        ],
                    },
                    nextCursor: event.nextCursor,
                    actionError: undefined,
                };
            });
        },
    }));
}

export interface ThreadSummaryProjection extends Omit<ThreadSummary, "root"> {
    readonly root: ChatMessageProjection;
}

export interface ThreadsSnapshot {
    readonly threads: Loadable<readonly ThreadSummaryProjection[]>;
    readonly nextCursor?: string;
    readonly pageError?: UserError;
    readonly actionError?: UserError;
}

export type ThreadsOutput =
    | { readonly type: "threadsMoreRequested" }
    | {
          readonly type: "threadReadSubmitted";
          readonly rootMessageId: string;
          readonly throughMessageId?: string;
      }
    | {
          readonly type: "threadSubscriptionSubmitted";
          readonly rootMessageId: string;
          readonly subscribed: boolean;
          readonly notificationLevel?: NotificationLevel;
      };

export type ThreadsInput =
    | { readonly type: "threadsLoading" }
    | {
          readonly type: "threadsLoaded";
          readonly threads: readonly ThreadSummaryProjection[];
          readonly nextCursor?: string;
          readonly append?: boolean;
      }
    | { readonly type: "threadsFailed"; readonly error: UserError }
    | { readonly type: "threadsPageFailed"; readonly error: UserError }
    | { readonly type: "threadActionFailed"; readonly error: UserError };

export interface ThreadsState extends ThreadsSnapshot {
    threadReadMark(rootMessageId: string, throughMessageId?: string): void;
    threadSubscriptionSet(
        rootMessageId: string,
        subscribed: boolean,
        notificationLevel?: NotificationLevel,
    ): void;
    threadsMore(): void;
    threadsInput(event: ThreadsInput): void;
}

export type ThreadsStore = StoreApi<ThreadsState>;
