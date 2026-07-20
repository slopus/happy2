import { chatGetAccess } from "../../chat/chatGetAccess.js";
import { type DrizzleExecutor } from "../../drizzle.js";
import { type DocumentRealtimeAudience } from "../types.js";
import { documentAttachmentRowsList } from "./documentAttachmentRowsList.js";
import { type DocumentRow } from "./documentRowGet.js";

/** Reads the owner and all attached channel ids used for access-filtered realtime fanout. */
export async function documentAudienceGet(
    executor: DrizzleExecutor,
    row: DocumentRow,
): Promise<DocumentRealtimeAudience> {
    const attachments = await documentAttachmentRowsList(executor, row.id);
    const ownerHasAttachedMembership = (
        await Promise.all(
            attachments.map((attachment) =>
                chatGetAccess(executor, row.ownerUserId, attachment.chatId, true),
            ),
        )
    ).some(Boolean);
    return {
        ownerUserId: row.ownerUserId,
        ownerNeedsUserTopic: !ownerHasAttachedMembership,
        chatIds: attachments.map((attachment) => attachment.chatId),
    };
}
