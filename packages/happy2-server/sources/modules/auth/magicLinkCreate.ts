import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { RegistrationClosedError } from "./errors.js";
import { accounts, authMagicLinks } from "../schema.js";

import { eq } from "drizzle-orm";
import { requireNewRegistrationRequestAllowedDb } from "./impl/requireNewRegistrationRequestAllowedDb.js";
import { tokenHash } from "./impl/tokenHash.js";

/**
 * Issues a single-use authMagicLinks challenge for an email only when the server currently accepts that registration request.
 * Centralizing expiry, token hashing, and policy validation keeps delivery code from persisting links that could never be redeemed.
 */
export async function magicLinkCreate(
    executor: DrizzleExecutor,
    email: string,
    rawToken: string,
): Promise<boolean> {
    try {
        await withTransaction(executor, async (tx) => {
            const [account] = await tx
                .select({
                    id: accounts.id,
                })
                .from(accounts)
                .where(eq(accounts.email, email));
            if (!account) await requireNewRegistrationRequestAllowedDb(tx);
            await tx.insert(authMagicLinks).values({
                tokenHash: tokenHash(rawToken),
                email,
                expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
            });
        });
        return true;
    } catch (error) {
        if (error instanceof RegistrationClosedError) return false;
        throw error;
    }
}
