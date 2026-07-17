import { type DrizzleExecutor } from "../drizzle.js";
import { chatGetAccess } from "./chatGetAccess.js";
/**
 * Reports whether a user has ordinary access to a live chat under its visibility, membership, and active-identity rules.
 * Returning only a boolean lets authorization probes reuse the full chat predicate without exposing the inaccessible chat projection.
 */
export async function chatCanAccess(
    executor: DrizzleExecutor,
    userId: string,
    chatId: string,
): Promise<boolean> {
    return Boolean(await chatGetAccess(executor, userId, chatId, false));
}
