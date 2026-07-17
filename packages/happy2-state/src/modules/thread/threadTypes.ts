import type { ReadonlyStore } from "../../kernel/readonlyStore.js";
import type { SendMessageInput, UserError } from "../../types.js";
import type { ChatMessageItem, ChatMessageProjection, Loadable } from "../chat/chatTypes.js";

export interface ThreadSnapshot {
    readonly rootMessageId: string;
    readonly root: Loadable<ChatMessageProjection>;
    readonly replies: readonly ChatMessageItem[];
    readonly hasMore: boolean;
}

export type ThreadOutput = {
    readonly type: "textSubmitted";
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

export interface ThreadStore extends ReadonlyStore<ThreadSnapshot> {
    textSubmit(input: SendMessageInput): void;
}
export interface ThreadHandle extends ThreadStore, Disposable {}
