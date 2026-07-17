import type { SendMessageInput } from "../../types.js";
import { messageItemProject } from "../chat/messageProject.js";
import type { ThreadActionContext } from "./threadLoad.js";

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
    context.threadGet(rootMessageId)?.threadInput({
        type: "replyUpserted",
        reply: messageItemProject(context.identities, result.message),
    });
}
