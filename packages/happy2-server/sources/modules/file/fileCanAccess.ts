import { type DrizzleExecutor } from "../drizzle.js";
import { fileCanAccessWith } from "../chat/fileCanAccessWith.js";
/**
 * Reports access only for complete, non-infected files that are public, user-owned, visibly referenced, or covered by an unexpired grant.
 * Centralizing that predicate prevents download and attachment callers from diverging on indirect chat, profile, emoji, or server-file visibility.
 */
export async function fileCanAccess(
    executor: DrizzleExecutor,
    userId: string,
    fileId: string,
): Promise<boolean> {
    return fileCanAccessWith(executor, userId, fileId);
}
