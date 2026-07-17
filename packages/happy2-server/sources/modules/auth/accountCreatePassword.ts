import { type Account } from "./types.js";
import { type DrizzleExecutor } from "../drizzle.js";
import { accounts } from "../schema.js";
import { asAccount } from "./impl/asAccount.js";
import { createId } from "@paralleldrive/cuid2";
/**
 * Inserts an accounts credential row from a caller-normalized email and precomputed password hash.
 * This low-level primitive deliberately leaves registration eligibility and hashing policy to the authenticated workflow that invokes it.
 */
export async function accountCreatePassword(
    executor: DrizzleExecutor,
    email: string,
    passwordHash: string,
): Promise<Account> {
    const [account] = await executor
        .insert(accounts)
        .values({
            id: createId(),
            email,
            passwordHash,
        })
        .returning();
    if (!account) throw new Error("Could not create account");
    return asAccount(account);
}
