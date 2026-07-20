import { type ChatAccess } from "./chatAccess.js";
import { CollaborationError } from "./types.js";
import { type DrizzleExecutor } from "../drizzle.js";
import { chatGetAccess } from "./chatGetAccess.js";
/**
 * Requires owner or administrator authority from active membership, a recoverable voluntary departure, or server administration.
 * The durable-membership fallback lets departed managers administer while an explicit removal still produces not-found non-disclosure.
 */
export async function chatRequireManager(
    executor: DrizzleExecutor,
    userId: string,
    chatId: string,
): Promise<ChatAccess> {
    let access = await chatGetAccess(executor, userId, chatId, true);
    if (!access) {
        const readable = await chatGetAccess(executor, userId, chatId, false);
        if (
            readable?.isServerAdmin ||
            readable?.recoverableMembershipRole === "owner" ||
            readable?.recoverableMembershipRole === "admin"
        )
            access = readable;
    }
    if (!access) throw new CollaborationError("not_found", "Chat was not found");
    if (
        !access.isServerAdmin &&
        access.recoverableMembershipRole !== "owner" &&
        access.recoverableMembershipRole !== "admin" &&
        access.membershipRole !== "owner" &&
        access.membershipRole !== "admin"
    )
        throw new CollaborationError("forbidden", "Channel manager permission is required");
    return access;
}
