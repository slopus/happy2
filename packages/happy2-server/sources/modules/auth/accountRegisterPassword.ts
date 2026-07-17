import { type Account } from "./types.js";
import { AccountExistsError } from "./errors.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { accounts } from "../schema.js";
import { asAccount } from "./impl/asAccount.js";
import { authorizeNewRegistrationDb } from "./impl/authorizeNewRegistrationDb.js";
import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import { requireNewRegistrationRequestAllowedDb } from "./impl/requireNewRegistrationRequestAllowedDb.js";

/**
 * Creates a password-backed accounts credential after enforcing both bootstrap ownership and the current public-registration policy.
 * The registration transaction makes the policy decision and unique credential insertion one race-safe operation across server instances.
 */
export async function accountRegisterPassword(
    executor: DrizzleExecutor,
    email: string,
    passwordHash: string,
): Promise<Account> {
    return withTransaction(executor, async (tx) => {
        await requireNewRegistrationRequestAllowedDb(tx);
        const [existing] = await tx
            .select({
                id: accounts.id,
            })
            .from(accounts)
            .where(eq(accounts.email, email));
        if (existing) throw new AccountExistsError();
        const [account] = await tx
            .insert(accounts)
            .values({
                id: createId(),
                email,
                passwordHash,
            })
            .returning();
        if (!account) throw new Error("Could not create account");
        await authorizeNewRegistrationDb(tx, account.id);
        return asAccount(account);
    });
}
