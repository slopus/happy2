import { type Account } from "./types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { accounts, oidcIdentities } from "../schema.js";
import { and, eq } from "drizzle-orm";
import { asAccount } from "./impl/asAccount.js";
import { authorizeNewRegistrationDb } from "./impl/authorizeNewRegistrationDb.js";
import { createId } from "@paralleldrive/cuid2";

/**
 * Resolves an OIDC subject to its accounts identity, creating both the account and oidcIdentities link only when registration policy allows it.
 * Serializing lookup, bootstrap authorization, and insertion prevents concurrent callbacks from creating duplicate credentials or bypassing the first-user gate.
 */
export async function accountFindOrCreateOidc(
    executor: DrizzleExecutor,
    provider: string,
    subject: string,
    email: string,
): Promise<Account> {
    return withTransaction(executor, async (tx) => {
        const [knownIdentity] = await tx
            .select({
                account: accounts,
            })
            .from(oidcIdentities)
            .innerJoin(accounts, eq(accounts.id, oidcIdentities.accountId))
            .where(and(eq(oidcIdentities.provider, provider), eq(oidcIdentities.subject, subject)));
        if (knownIdentity) return asAccount(knownIdentity.account);
        let [account] = await tx.select().from(accounts).where(eq(accounts.email, email));
        if (!account) {
            [account] = await tx
                .insert(accounts)
                .values({
                    id: createId(),
                    email,
                })
                .returning();
            if (!account) throw new Error("Could not create OIDC account");
            await authorizeNewRegistrationDb(tx, account.id);
        }
        await tx.insert(oidcIdentities).values({
            provider,
            subject,
            accountId: account.id,
        });
        return asAccount(account);
    });
}
