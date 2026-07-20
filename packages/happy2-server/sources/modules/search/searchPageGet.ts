import { type ChatSummary, type MessageSummary, type UserSummary } from "../chat/types.js";
import { type DrizzleExecutor } from "../drizzle.js";

import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import {
    chatMembers,
    chats,
    messages,
    messageSearchDocuments,
    messageSearchNgrams,
} from "../schema.js";

import { decodeSearchCursor } from "./impl/decodeSearchCursor.js";

import { encodeSearchCursor } from "./impl/encodeSearchCursor.js";

import { fuzzyScore } from "./impl/fuzzyScore.js";

import { normalizeSearch } from "./normalizeSearch.js";

import { resultId } from "./impl/resultId.js";
import { searchGrams } from "./searchGrams.js";

import { text } from "../chat/text.js";
import { channelDirectoryList } from "../chat/channelDirectoryList.js";
import { contactList } from "../user/contactList.js";
import { messageGetProjection } from "../message/messageGetProjection.js";
/**
 * Ranks visible people, channels, and message projections into one cursor-based search page.
 * Keeping visibility rules and cross-entity scoring together makes every search caller observe the same result ordering.
 */
export async function searchPageGet(
    executor: DrizzleExecutor,
    input: {
        userId: string;
        query: string;
        limit: number;
        cursor?: string;
        types?: readonly ("user" | "channel" | "message")[];
    },
): Promise<{
    results: Array<
        | {
              type: "message";
              score: number;
              message: MessageSummary;
          }
        | {
              type: "channel";
              score: number;
              channel: ChatSummary;
          }
        | {
              type: "user";
              score: number;
              user: UserSummary;
          }
    >;
    nextCursor?: string;
}> {
    const types = new Set(input.types ?? ["user", "channel", "message"]);
    const normalized = normalizeSearch(input.query);
    const cursorScope = `${normalized}\0${[...types].sort().join(",")}`;
    const offset = decodeSearchCursor(input.cursor, cursorScope);
    const candidates: Array<
        | {
              type: "message";
              score: number;
              message: MessageSummary;
          }
        | {
              type: "channel";
              score: number;
              channel: ChatSummary;
          }
        | {
              type: "user";
              score: number;
              user: UserSummary;
          }
    > = [];
    if (types.has("user")) {
        const users = await contactList(executor);
        for (const user of users) {
            const score = fuzzyScore(
                normalized,
                [user.username, user.firstName, user.lastName, user.title]
                    .filter(Boolean)
                    .join(" "),
            );
            if (score > 0)
                candidates.push({
                    type: "user",
                    score,
                    user,
                });
        }
    }
    if (types.has("channel")) {
        const channels = await channelDirectoryList(executor, input.userId);
        for (const channel of channels) {
            const score = fuzzyScore(
                normalized,
                [channel.name, channel.slug, channel.topic].filter(Boolean).join(" "),
            );
            if (score > 0)
                candidates.push({
                    type: "channel",
                    score,
                    channel,
                });
        }
    }
    const grams = [...searchGrams(normalized).keys()];
    const rankedMessages: Array<{
        messageId: string;
        score: number;
    }> = [];
    if (types.has("message") && grams.length > 0) {
        const candidateLimit = offset + input.limit + candidates.length + 1;
        const matched = executor
            .select({
                messageId: messageSearchNgrams.messageId,
                matchedGrams: sql<number>`count(*)`.as("matched_grams"),
            })
            .from(messageSearchNgrams)
            .where(inArray(messageSearchNgrams.gram, grams))
            .groupBy(messageSearchNgrams.messageId)
            .as("matched");
        const candidateScore = sql<number>`case when instr(${messageSearchDocuments.normalizedText}, ${normalized}) > 0 then 1.0 else cast(${matched.matchedGrams} as real) / max(1, ${messageSearchDocuments.gramCount} + ${grams.length} - ${matched.matchedGrams}) end`;
        const messageRows = await executor
            .select({
                message_id: messageSearchDocuments.messageId,
                normalized_text: messageSearchDocuments.normalizedText,
                candidate_score: candidateScore,
            })
            .from(matched)
            .innerJoin(
                messageSearchDocuments,
                eq(messageSearchDocuments.messageId, matched.messageId),
            )
            .innerJoin(messages, eq(messages.id, messageSearchDocuments.messageId))
            .innerJoin(chats, eq(chats.id, messageSearchDocuments.chatId))
            .leftJoin(
                chatMembers,
                and(
                    eq(chatMembers.chatId, chats.id),
                    eq(chatMembers.userId, input.userId),
                    isNull(chatMembers.leftAt),
                ),
            )
            .where(
                and(
                    isNull(messages.deletedAt),
                    or(
                        isNull(messages.expiresAt),
                        sql`datetime(${messages.expiresAt}) > CURRENT_TIMESTAMP`,
                    ),
                    isNull(chats.deletedAt),
                    or(eq(chats.kind, "public_channel"), sql`${chatMembers.userId} IS NOT NULL`),
                ),
            )
            .orderBy(
                desc(candidateScore),
                desc(messageSearchDocuments.messageCreatedAt),
                desc(messageSearchDocuments.messageId),
            )
            .limit(candidateLimit);
        for (const row of messageRows) {
            const fuzzy = fuzzyScore(normalized, text(row.normalized_text));
            const ngram = Number(row.candidate_score);
            const score = Math.max(fuzzy, Number.isFinite(ngram) ? ngram * 0.85 : 0);
            if (score > 0)
                rankedMessages.push({
                    messageId: text(row.message_id),
                    score,
                });
        }
    }
    for (const { messageId, score } of rankedMessages) {
        const message = await messageGetProjection(executor, input.userId, messageId);
        if (message)
            candidates.push({
                type: "message",
                score,
                message,
            });
    }
    const ranked = candidates.sort(
        (left, right) => right.score - left.score || resultId(left).localeCompare(resultId(right)),
    );
    const results = ranked.slice(offset, offset + input.limit);
    return {
        results,
        nextCursor:
            ranked.length > offset + input.limit
                ? encodeSearchCursor(cursorScope, offset + input.limit)
                : undefined,
    };
}
