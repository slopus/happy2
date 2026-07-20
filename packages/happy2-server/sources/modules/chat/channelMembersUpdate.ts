import type { DrizzleExecutor } from "../drizzle.js";
import { withTransaction } from "../drizzle.js";
import { channelMemberAdd } from "./channelMemberAdd.js";
import { channelMemberRemove } from "./channelMemberRemove.js";
import type { MutationHint } from "./types.js";
import { CollaborationError } from "./types.js";

/**
 * Applies a manager-authorized set of channel membership grants and revocations as one transaction using the standard membership invariants.
 * The batch boundary prevents a partial plugin update and preserves each affected identity's separately targeted documents hint.
 */
export async function channelMembersUpdate(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        chatId: string;
        addUserIds: readonly string[];
        removeUserIds: readonly string[];
    },
): Promise<{
    hints: MutationHint[];
    userHints: Array<{ userId: string; hint: MutationHint }>;
}> {
    return withTransaction(executor, async (tx) => {
        const hints: MutationHint[] = [];
        const userHints: Array<{ userId: string; hint: MutationHint }> = [];
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
            userHints.push({ userId, hint: membershipUserHint(added) });
        }
        for (const userId of removeUserIds) {
            const removed = await channelMemberRemove(tx, {
                actorUserId: input.actorUserId,
                chatId: input.chatId,
                userId,
            });
            hints.push(removed.hint);
            userHints.push({ userId, hint: membershipUserHint(removed) });
        }
        return { hints, userHints };
    });
}

function membershipUserHint(result: {
    hint: MutationHint;
    documentsHint?: MutationHint;
}): MutationHint {
    return result.documentsHint
        ? {
              ...result.hint,
              areas: [...new Set([...result.hint.areas, ...result.documentsHint.areas])],
          }
        : result.hint;
}
