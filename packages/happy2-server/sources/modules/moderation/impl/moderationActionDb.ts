import { type DrizzleExecutor } from "../../drizzle.js";
import { type ModerationAction, OperationsError } from "../../operations/types.js";

import { asModerationAction } from "./asModerationAction.js";
import { eq } from "drizzle-orm";
import { moderationActionSelection } from "./moderationActionSelection.js";
import { moderationActions } from "../../schema.js";
/**
 * Loads the canonical moderation-action projection by identifier and maps absence to the operations not-found error.
 * Reusing this projection after take and revoke keeps enforcement target, expiry, automation, and audit metadata aligned.
 */
export async function moderationActionDb(
    executor: DrizzleExecutor,
    id: string,
): Promise<ModerationAction> {
    const [row] = await executor
        .select(moderationActionSelection)
        .from(moderationActions)
        .where(eq(moderationActions.id, id))
        .limit(1);
    if (!row) throw new OperationsError("not_found", "Moderation action was not found");
    return asModerationAction(row);
}
