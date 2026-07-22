import { CollaborationError } from "../types.js";
import { type DrizzleExecutor } from "../../drizzle.js";
import { chatGetAccess } from "../chatGetAccess.js";

/** Requires an active parent membership before one user may become or remain a child-channel member. */
export async function childMemberRequireParent(
    executor: DrizzleExecutor,
    parentChatId: string | undefined,
    userId: string,
): Promise<void> {
    if (!parentChatId) return;
    const parent = await chatGetAccess(executor, userId, parentChatId, true);
    if (!parent)
        throw new CollaborationError(
            "not_found",
            "Child channel membership requires an active parent membership",
        );
    if (parent.archivedAt)
        throw new CollaborationError("conflict", "Unarchive the parent channel before joining");
}
