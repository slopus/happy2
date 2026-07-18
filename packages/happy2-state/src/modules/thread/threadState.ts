import { createStore, type StoreApi } from "zustand/vanilla";
import { type SendMessageInput, type UserError } from "../../types.js";
import {
    type ChatMessageItem,
    type ChatMessageProjection,
    type Loadable,
} from "../chat/chatState.js";
import { messageItemCompare, messageItemProject, messageProject } from "../chat/chatState.js";
import { type IdentityCatalog } from "../identity/identityState.js";
import { type StateRuntime, userError } from "../runtime/runtimeState.js";

export interface ThreadActionContext {
    readonly runtime: StateRuntime;
    readonly identities: IdentityCatalog;
    threadGet(rootMessageId: string): ThreadStore | undefined;
}

const generations = new WeakMap<ThreadStore, number>();

/** Loads a retained thread and discards late completion after its lease closes. */
export async function threadLoad(
    context: ThreadActionContext,
    rootMessageId: string,
): Promise<void> {
    const binding = context.threadGet(rootMessageId);
    if (!binding) return;
    const generation = (generations.get(binding) ?? 0) + 1;
    generations.set(binding, generation);
    binding.getState().threadInput({ type: "threadLoading" });
    try {
        const result = await context.runtime.operation("getThread", {
            messageId: rootMessageId,
            limit: 100,
        });
        if (context.threadGet(rootMessageId) !== binding || generations.get(binding) !== generation)
            return;
        binding.getState().threadInput({
            type: "threadLoaded",
            root: messageProject(context.identities, result.root),
            replies: result.messages.map((message) =>
                messageItemProject(context.identities, message),
            ),
            hasMore: result.hasMore,
        });
    } catch (error) {
        if (context.threadGet(rootMessageId) === binding && generations.get(binding) === generation)
            binding.getState().threadInput({ type: "threadFailed", error: userError(error) });
    }
}

/** Sends one thread reply and projects the confirmed result only into an already retained thread. */
export async function threadMessageSend(
    context: ThreadActionContext,
    rootMessageId: string,
    input: SendMessageInput,
): Promise<void> {
    const result = await context.runtime.operation("sendThreadMessage", {
        messageId: rootMessageId,
        text: input.text,
        attachmentFileIds: input.attachmentFileIds,
        quotedMessageId: input.quotedMessageId,
        expiryMode: input.expiryMode,
        selfDestructSeconds: input.selfDestructSeconds,
        afterReadScope: input.afterReadScope,
        clientMutationId: input.clientMutationId,
    });
    context
        .threadGet(rootMessageId)
        ?.getState()
        .threadInput({
            type: "replyUpserted",
            reply: messageItemProject(context.identities, result.message),
        });
}

export interface ThreadOpenContext {
    threadAcquire(rootMessageId: string): ThreadStore;
    threadRelease(rootMessageId: string): void;
    threadLoad(rootMessageId: string): void;
}

/** Acquires one deduplicated thread surface and frees its reply projection on final release. */
export function threadOpen(context: ThreadOpenContext, rootMessageId: string): ThreadHandle {
    const binding = context.threadAcquire(rootMessageId);
    if (binding.getState().root.type === "unloaded") context.threadLoad(rootMessageId);
    let disposed = false;
    return {
        ...binding,
        [Symbol.dispose](): void {
            if (disposed) return;
            disposed = true;
            context.threadRelease(rootMessageId);
        },
    };
}

/** Creates one retained thread surface with one subscription for root and replies. */
export function threadStoreCreate(
    rootMessageId: string,
    output: (event: ThreadOutput) => void = () => undefined,
): ThreadStore {
    return createStore<ThreadState>()((set) => ({
        rootMessageId,
        root: { type: "unloaded" },
        replies: [],
        hasMore: false,
        textSubmit(input): void {
            output({ type: "threadReplySubmitted", rootMessageId, input });
        },
        threadInput(event): void {
            set((snapshot) => {
                if (event.type === "threadLoading")
                    return { ...snapshot, root: { type: "loading" } };
                if (event.type === "threadFailed")
                    return { ...snapshot, root: { type: "error", error: event.error } };
                if (event.type === "threadLoaded")
                    return {
                        ...snapshot,
                        root: { type: "ready", value: event.root },
                        replies: event.replies,
                        hasMore: event.hasMore,
                    };
                const index = snapshot.replies.findIndex(
                    (reply) =>
                        reply.message.id === event.reply.message.id ||
                        (event.reply.clientMutationId &&
                            reply.clientMutationId === event.reply.clientMutationId),
                );
                const replies = [...snapshot.replies];
                if (index < 0) replies.push(event.reply);
                else replies[index] = event.reply;
                replies.sort(messageItemCompare);
                return { ...snapshot, replies };
            });
        },
    }));
}

export interface ThreadSnapshot {
    readonly rootMessageId: string;
    readonly root: Loadable<ChatMessageProjection>;
    readonly replies: readonly ChatMessageItem[];
    readonly hasMore: boolean;
}

export type ThreadOutput = {
    readonly type: "threadReplySubmitted";
    readonly rootMessageId: string;
    readonly input: SendMessageInput;
};

export type ThreadInput =
    | { readonly type: "threadLoading" }
    | {
          readonly type: "threadLoaded";
          readonly root: ChatMessageProjection;
          readonly replies: readonly ChatMessageItem[];
          readonly hasMore: boolean;
      }
    | { readonly type: "threadFailed"; readonly error: UserError }
    | { readonly type: "replyUpserted"; readonly reply: ChatMessageItem };

export interface ThreadState extends ThreadSnapshot {
    textSubmit(input: SendMessageInput): void;
    threadInput(event: ThreadInput): void;
}

export type ThreadStore = StoreApi<ThreadState>;

export interface ThreadHandle extends ThreadStore, Disposable {}
