import { asc, eq } from "drizzle-orm";
import { type DrizzleExecutor } from "../drizzle.js";
import { drafts } from "../schema.js";
import { type DraftSummary } from "./types.js";

/**
 * Lists every durable chat draft owned by one user without exposing another user's composer state.
 * Stable chat ordering and revision metadata let any signed-in node reconcile the complete personal projection deterministically.
 */
export async function draftList(
    executor: DrizzleExecutor,
    actorUserId: string,
): Promise<DraftSummary[]> {
    const rows = await executor
        .select({
            chatId: drafts.chatId,
            text: drafts.text,
            revision: drafts.syncSequence,
            updatedAt: drafts.updatedAt,
        })
        .from(drafts)
        .where(eq(drafts.userId, actorUserId))
        .orderBy(asc(drafts.chatId));
    return rows.map((row) => ({
        chatId: row.chatId,
        text: row.text,
        revision: String(row.revision),
        updatedAt: row.updatedAt,
    }));
}
