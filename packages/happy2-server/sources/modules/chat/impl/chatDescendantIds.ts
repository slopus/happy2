import { type DrizzleTransaction } from "../../drizzle.js";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { chats, messages } from "../../schema.js";

/** Returns every live descendant chat breadth-first from parent-message links. */
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
            .innerJoin(messages, eq(messages.id, chats.parentMessageId))
            .where(and(inArray(messages.chatId, frontier), isNull(chats.deletedAt)));
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
