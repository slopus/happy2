import type { DrizzleExecutor } from "../drizzle.js";
import { withTransaction } from "../drizzle.js";
import { channelMemberAdd } from "./channelMemberAdd.js";
import { channelMemberRemove } from "./channelMemberRemove.js";
import type { MutationHint } from "./types.js";
import { CollaborationError } from "./types.js";

/**
 * Applies a manager-authorized set of channel membership grants and revocations as one transaction using the standard membership invariants.
 * The batch boundary prevents a multi-user plugin request from leaving only a prefix of its requested membership change durable.
 */
export async function channelMembersUpdate(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        chatId: string;
        addUserIds: readonly string[];
        removeUserIds: readonly string[];
    },
): Promise<{ hints: MutationHint[] }> {
    return withTransaction(executor, async (tx) => {
        const hints: MutationHint[] = [];
        const addUserIds = new Set(input.addUserIds);
        const removeUserIds = new Set(input.removeUserIds);
        if (
            addUserIds.size !== input.addUserIds.length ||
            removeUserIds.size !== input.removeUserIds.length
        )
            throw new CollaborationError("invalid", "Membership update contains a duplicate user");
        if ([...addUserIds].some((userId) => removeUserIds.has(userId)))
            throw new CollaborationError("invalid", "A user cannot be both added and removed");
        for (const userId of addUserIds) {
            const added = await channelMemberAdd(tx, {
                actorUserId: input.actorUserId,
                chatId: input.chatId,
                userId,
            });
            hints.push(added.hint);
        }
        for (const userId of removeUserIds) {
            const removed = await channelMemberRemove(tx, {
                actorUserId: input.actorUserId,
                chatId: input.chatId,
                userId,
            });
            hints.push(removed.hint);
        }
        return { hints };
    });
}
