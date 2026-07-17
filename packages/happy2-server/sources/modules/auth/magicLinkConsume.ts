import { type Account } from "./types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { RegistrationClosedError } from "./errors.js";
import { accounts, authMagicLinks } from "../schema.js";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { asAccount } from "./impl/asAccount.js";

import { authorizeNewRegistrationDb } from "./impl/authorizeNewRegistrationDb.js";
import { createId } from "@paralleldrive/cuid2";

import { tokenHash } from "./impl/tokenHash.js";

/**
 * Consumes one unexpired authMagicLinks token, returning an existing email account or creating a new account when registration policy permits.
 * The guarded token update and account lookup share a transaction so concurrent requests cannot redeem the same one-time link twice.
 */
export async function magicLinkConsume(
    executor: DrizzleExecutor,
    rawToken: string,
): Promise<Account | undefined> {
    try {
        return await withTransaction(executor, async (tx) => {
            const [link] = await tx
                .update(authMagicLinks)
                .set({
                    consumedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(
                    and(
                        eq(authMagicLinks.tokenHash, tokenHash(rawToken)),
                        isNull(authMagicLinks.consumedAt),
                        gt(authMagicLinks.expiresAt, new Date().toISOString()),
                    ),
                )
                .returning({
                    email: authMagicLinks.email,
                });
            if (!link) return undefined;
            let [account] = await tx.select().from(accounts).where(eq(accounts.email, link.email));
            if (!account) {
                [account] = await tx
                    .insert(accounts)
                    .values({
                        id: createId(),
                        email: link.email,
                    })
                    .returning();
                if (!account) throw new Error("Could not create magic-link account");
                await authorizeNewRegistrationDb(tx, account.id);
            }
            return asAccount(account);
        });
    } catch (error) {
        if (error instanceof RegistrationClosedError) return undefined;
        throw error;
    }
}
