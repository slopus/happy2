import { type SendMessageInput, UserError } from "../../types.js";
import {
    type ChatMessageItem,
    type ChatMessageProjection,
    type ChatStore,
    messageItemProject,
} from "../chat/chatState.js";
import { type ComposerStore } from "../composer/composerState.js";
import { type IdentityCatalog } from "../identity/identityState.js";
import { type StateRuntime } from "../runtime/runtimeState.js";

export interface MessageActionContext {
    readonly runtime: StateRuntime;
    readonly identities: IdentityCatalog;
    chatGet(chatId: string): ChatStore | undefined;
    chatPinsReconcile(chatId: string): void;
    composerGet(scopeId: string): ComposerStore | undefined;
}

/** Persists deletion and reconciles the server's deleted-message projection if materialized. */
export async function messageDelete(
    context: MessageActionContext,
    chatId: string,
    messageId: string,
): Promise<void> {
    const result = await context.runtime.operation("deleteMessage", { messageId });
    context
        .chatGet(chatId)
        ?.getState()
        .chatInput({
            type: "messageUpserted",
            item: messageItemProject(context.identities, result.message),
        });
}

/** Persists an edit and replaces only its materialized message projection. */
export async function messageEdit(
    context: MessageActionContext,
    chatId: string,
    messageId: string,
    text: string,
    expectedRevision: number,
): Promise<void> {
    const result = await context.runtime.operation("editMessage", {
        messageId,
        text,
        expectedRevision,
    });
    context
        .chatGet(chatId)
        ?.getState()
        .chatInput({
            type: "messageUpserted",
            item: messageItemProject(context.identities, result.message),
        });
}

/** Pins one message durably and refreshes pins only when that chat resource is materialized. */
export async function messagePin(
    context: MessageActionContext,
    chatId: string,
    messageId: string,
): Promise<void> {
    await context.runtime.operation("pinMessage", { messageId });
    context.chatPinsReconcile(chatId);
}

/** Optimistically inserts and sends a message, preserving one idempotency key across retries. */
export function messageSend(
    context: MessageActionContext,
    chatId: string,
    input: SendMessageInput,
    composerRevision?: number,
): void {
    const clientMutationId = input.clientMutationId ?? context.runtime.createId();
    const localId = `local:${clientMutationId}`;
    const chatStatus = context.chatGet(chatId)?.getState().status;
    const defaultAudience =
        chatStatus?.type === "ready" && chatStatus.value.isDefaultAgentConversation
            ? "agents"
            : "people";
    const optimistic: ChatMessageItem = {
        message: optimisticMessage(localId, chatId, input, defaultAudience, context.runtime.now()),
        source: "local",
        delivery: "sending",
        clientMutationId,
    };
    context.chatGet(chatId)?.getState().chatInput({ type: "messageUpserted", item: optimistic });

    context.runtime.background(
        (async () => {
            try {
                const result = await context.runtime.operation("sendMessage", {
                    chatId,
                    ...input,
                    clientMutationId,
                });
                context
                    .chatGet(chatId)
                    ?.getState()
                    .chatInput({
                        type: "messageUpserted",
                        item: {
                            ...messageItemProject(context.identities, result.message),
                            clientMutationId,
                        },
                    });
                if (composerRevision !== undefined)
                    context.composerGet(chatId)?.getState().composerInput({
                        type: "submissionConfirmed",
                        revision: composerRevision,
                    });
            } catch (error) {
                const current = context
                    .chatGet(chatId)
                    ?.getState()
                    .messages.find((item) => item.clientMutationId === clientMutationId);
                if (current) {
                    context
                        .chatGet(chatId)
                        ?.getState()
                        .chatInput({
                            type: "messageUpserted",
                            item: { ...current, delivery: "failed", error: asError(error) },
                        });
                }
                const composer = context.composerGet(chatId);
                if (composer && composerRevision !== undefined) {
                    composer.getState().composerInput({
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
    defaultAudience: "people" | "agents",
    now: number,
): ChatMessageProjection {
    const createdAt = new Date(now).toISOString();
    return {
        id,
        chatId,
        sequence: id,
        changePts: "0",
        kind: "user",
        audience: input.audience ?? defaultAudience,
        agentUserIds: input.agentUserIds ?? [],
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

/** Unpins one message durably and refreshes pins only when that chat resource is materialized. */
export async function messageUnpin(
    context: MessageActionContext,
    chatId: string,
    messageId: string,
): Promise<void> {
    await context.runtime.operation("unpinMessage", { messageId });
    context.chatPinsReconcile(chatId);
}
