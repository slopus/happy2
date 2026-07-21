import { type DrizzleTransaction } from "../../drizzle.js";

import { and, inArray, isNull } from "drizzle-orm";
import { chats } from "../../schema.js";

/** Returns every live descendant channel breadth-first from parent-channel links. */
export async function chatDescendantIds(
    tx: DrizzleTransaction,
    ancestorChatId: string,
): Promise<string[]> {
    const found: string[] = [];
    const seen = new Set([ancestorChatId]);
    let frontier = [ancestorChatId];
    while (frontier.length > 0) {
        const rows = await tx
            .select({ id: chats.id })
            .from(chats)
            .where(and(inArray(chats.parentChatId, frontier), isNull(chats.deletedAt)));
        const next: string[] = [];
        for (const row of rows) {
            if (seen.has(row.id)) continue;
            seen.add(row.id);
            found.push(row.id);
            next.push(row.id);
        }
        frontier = next;
    }
    return found;
}
