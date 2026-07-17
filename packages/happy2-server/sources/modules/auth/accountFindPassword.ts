import { type Account } from "./types.js";
import { type DrizzleExecutor } from "../drizzle.js";
import { accounts } from "../schema.js";
import { asAccount } from "./impl/asAccount.js";
import { eq } from "drizzle-orm";
/**
 * Resolves the account credential row for an exact email address during password authentication.
 * Returning the canonical account regardless of active or banned state leaves credential verification and eligibility checks as separate, auditable decisions.
 */
export async function accountFindPassword(
    executor: DrizzleExecutor,
    email: string,
): Promise<Account | undefined> {
    const [account] = await executor.select().from(accounts).where(eq(accounts.email, email));
    return account ? asAccount(account) : undefined;
}
