import { UserError, type SendMessageInput } from "../../types.js";
import { messageItemProject } from "../chat/messageProject.js";
import type { ChatMessageItem, ChatMessageProjection } from "../chat/chatTypes.js";
import type { MessageActionContext } from "./messageActionContext.js";

/** Optimistically inserts and sends a message, preserving one idempotency key across retries. */
export function messageSend(
    context: MessageActionContext,
    chatId: string,
    input: SendMessageInput,
    composerRevision?: number,
): void {
    const clientMutationId = input.clientMutationId ?? context.runtime.createId();
    const localId = `local:${clientMutationId}`;
    const optimistic: ChatMessageItem = {
        message: optimisticMessage(localId, chatId, input, context.runtime.now()),
        source: "local",
        delivery: "sending",
        clientMutationId,
    };
    context.chatGet(chatId)?.chatInput({ type: "messageUpserted", item: optimistic });

    context.runtime.background(
        (async () => {
            try {
                const result = await context.runtime.operation("sendMessage", {
                    chatId,
                    ...input,
                    clientMutationId,
                });
                context.chatGet(chatId)?.chatInput({
                    type: "messageUpserted",
                    item: {
                        ...messageItemProject(context.identities, result.message),
                        clientMutationId,
                    },
                });
                if (composerRevision !== undefined)
                    context.composerGet(chatId)?.composerInput({
                        type: "submissionConfirmed",
                        revision: composerRevision,
                    });
            } catch (error) {
                const current = context
                    .chatGet(chatId)
                    ?.store.get()
                    .messages.find((item) => item.clientMutationId === clientMutationId);
                if (current) {
                    context.chatGet(chatId)?.chatInput({
                        type: "messageUpserted",
                        item: { ...current, delivery: "failed", error: asError(error) },
                    });
                }
                const composer = context.composerGet(chatId);
                if (composer && composerRevision !== undefined) {
                    composer.composerInput({
                        type: "submissionFailed",
                        revision: composerRevision,
                        error: asError(error),
                    });
                }
                throw error;
            }
        })(),
    );
}

function optimisticMessage(
    id: string,
    chatId: string,
    input: SendMessageInput,
    now: number,
): ChatMessageProjection {
    const createdAt = new Date(now).toISOString();
    return {
        id,
        chatId,
        sequence: id,
        changePts: "0",
        kind: "user",
        text: input.text ?? "",
        threadRootMessageId: input.threadRootMessageId,
        threadReplyCount: 0,
        revision: 0,
        mentions: [],
        attachments: [],
        reactions: [],
        receipts: [],
        expiryMode: input.expiryMode ?? "none",
        selfDestructSeconds: input.selfDestructSeconds,
        createdAt,
    };
}

function asError(error: unknown): UserError {
    return error instanceof UserError
        ? error
        : new UserError(error instanceof Error ? error.message : "Could not send the message.");
}
