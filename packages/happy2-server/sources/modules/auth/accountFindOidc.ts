import { type Account } from "./types.js";
import { type DrizzleExecutor } from "../drizzle.js";
import { accounts, oidcIdentities } from "../schema.js";
import { and, eq } from "drizzle-orm";
import { asAccount } from "./impl/asAccount.js";

/**
 * Resolves an authentication account by the exact OIDC provider and subject pair stored in oidcIdentities.
 * Keeping provider identity lookup independent of account eligibility lets the authentication flow apply activation, ban, and profile policy explicitly afterward.
 */
export async function accountFindOidc(
    executor: DrizzleExecutor,
    provider: string,
    subject: string,
): Promise<Account | undefined> {
    const [identity] = await executor
        .select({
            account: accounts,
        })
        .from(oidcIdentities)
        .innerJoin(accounts, eq(accounts.id, oidcIdentities.accountId))
        .where(and(eq(oidcIdentities.provider, provider), eq(oidcIdentities.subject, subject)));
    return identity ? asAccount(identity.account) : undefined;
}
