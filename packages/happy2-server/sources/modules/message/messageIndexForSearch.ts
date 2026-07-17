import { type DrizzleTransaction } from "../drizzle.js";
import { eq } from "drizzle-orm";
import { messages, messageSearchDocuments, messageSearchNgrams } from "../schema.js";

import { normalizeSearch } from "../search/normalizeSearch.js";
import { searchGrams } from "../search/searchGrams.js";
/**
 * Replaces messageSearchDocuments and derived messageSearchNgrams for one message using its current normalized searchable text.
 * Requiring the message transaction prevents search from exposing tokens for content that was rolled back or has already changed again.
 */
export async function messageIndexForSearch(
    tx: DrizzleTransaction,
    messageId: string,
    chatId: string,
    messageText: string,
    revision: number,
): Promise<void> {
    await tx.delete(messageSearchDocuments).where(eq(messageSearchDocuments.messageId, messageId));
    const normalized = normalizeSearch(messageText);
    if (!normalized) return;
    const grams = searchGrams(normalized);
    const [created] = await tx
        .select({
            createdAt: messages.createdAt,
        })
        .from(messages)
        .where(eq(messages.id, messageId))
        .limit(1);
    if (!created) throw new Error("Search source message is missing");
    await tx.insert(messageSearchDocuments).values({
        messageId,
        chatId,
        normalizedText: normalized,
        normalizedLength: normalized.length,
        gramCount: grams.size,
        indexedRevision: revision,
        messageCreatedAt: created.createdAt,
    });
    if (grams.size)
        await tx.insert(messageSearchNgrams).values(
            [...grams].map(([gram, occurrences]) => ({
                gram,
                messageId,
                occurrences,
            })),
        );
}
