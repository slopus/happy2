import { createId } from "@paralleldrive/cuid2";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { authDevTokens } from "../schema.js";
import { randomToken } from "./crypto.js";
import { recordSessionEvent } from "./impl/recordSessionEvent.js";
import { tokenHash } from "./impl/tokenHash.js";
import { sessionFindActive } from "./sessionFindActive.js";
import type { ActiveSession, RequestMetadata } from "./types.js";

export interface CreatedDevToken {
    token: string;
    session: ActiveSession;
}

/**
 * Inserts one opaque development credential into authDevTokens for an active session and records issuance telemetry in the same transaction.
 * Storing only the token hash and resolving its session on every use makes the credential inherit durable session expiry, revocation, and account eligibility.
 */
export async function developmentTokenCreate(
    executor: DrizzleExecutor,
    sessionId: string,
    metadata: RequestMetadata,
): Promise<CreatedDevToken | undefined> {
    return withTransaction(executor, async (tx) => {
        const session = await sessionFindActive(tx, sessionId);
        if (!session) return undefined;
        const token = `happy2_dev_${randomToken()}`;
        await tx.insert(authDevTokens).values({
            id: createId(),
            sessionId,
            tokenHash: tokenHash(token),
        });
        await recordSessionEvent(tx, sessionId, "dev_token_issued", metadata);
        return { token, session };
    });
}
