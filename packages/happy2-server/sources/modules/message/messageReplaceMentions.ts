import { type DrizzleTransaction } from "../drizzle.js";
import { messageMentions, users } from "../schema.js";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";

/**
 * Replaces messageMentions with the normalized users and special audience tokens parsed from the message's current text.
 * Performing replacement in the content transaction keeps mention routing from referring to an earlier revision of the message.
 */
export async function messageReplaceMentions(
    tx: DrizzleTransaction,
    messageId: string,
    messageText: string,
): Promise<{
    userIds: string[];
    notifyAll: boolean;
}> {
    await tx.delete(messageMentions).where(eq(messageMentions.messageId, messageId));
    const mentionedUsers = new Set<string>();
    let notifyAll = false;
    const seenRanges = new Set<string>();
    for (const match of messageText.matchAll(
        /(^|[^\p{L}\p{N}_])@([a-zA-Z0-9_][a-zA-Z0-9_.-]{0,63})/gu,
    )) {
        const candidate = match[2].replace(/[.-]+$/g, "");
        if (!candidate) continue;
        const rawText = `@${candidate}`;
        const startOffset = (match.index ?? 0) + match[1].length;
        const range = `${startOffset}:${rawText.length}`;
        if (seenRanges.has(range)) continue;
        seenRanges.add(range);
        const special = candidate.toLowerCase();
        if (["channel", "here", "everyone"].includes(special)) {
            await tx.insert(messageMentions).values({
                id: createId(),
                messageId,
                kind: special,
                startOffset,
                length: rawText.length,
                rawText,
            });
            notifyAll = true;
            continue;
        }
        const [user] = await tx
            .select({
                id: users.id,
            })
            .from(users)
            .where(
                and(
                    sql`lower(${users.username}) = lower(${candidate})`,
                    isNull(users.deletedAt),
                    eq(users.active, 1),
                ),
            )
            .limit(1);
        if (!user) continue;
        await tx.insert(messageMentions).values({
            id: createId(),
            messageId,
            kind: "user",
            mentionedUserId: user.id,
            startOffset,
            length: rawText.length,
            rawText,
        });
        mentionedUsers.add(user.id);
    }
    return {
        userIds: [...mentionedUsers],
        notifyAll,
    };
}
