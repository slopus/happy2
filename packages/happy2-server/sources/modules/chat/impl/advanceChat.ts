import { type ChatMutation } from "./chatMutation.js";
import { type DrizzleTransaction } from "../../drizzle.js";
import { chatAdvanceWithSequence } from "../chatAdvanceWithSequence.js";
import { syncSequenceNext } from "../../sync/syncSequenceNext.js";
/**
 * Resolves advance chat through chatAdvanceWithSequence, syncSequenceNext.
 * It requires the caller's transaction for the composed operations, so callers cannot bypass the ordering and failure semantics defined for advance chat.
 */
export async function advanceChat(
    tx: DrizzleTransaction,
    actorUserId: string,
    chatId: string,
    kind: string,
    entityId?: string,
    targetUserId?: string,
): Promise<
    ChatMutation & {
        messageSequence?: number;
    }
> {
    const sequence = await syncSequenceNext(tx);
    return chatAdvanceWithSequence(tx, sequence, actorUserId, chatId, kind, entityId, targetUserId);
}
