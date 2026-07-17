import { type AccountBan, OperationsError } from "../../operations/types.js";
import { type DrizzleExecutor } from "../../drizzle.js";

import { accountBans, users } from "../../schema.js";
import { asBan } from "./asBan.js";
import { banSelection } from "./banSelection.js";
import { eq } from "drizzle-orm";

/**
 * Loads the canonical ban projection by identifier with any current user joined through its account.
 * Sharing this mapper across apply, expire, and revoke paths keeps returned target and lifecycle fields consistent when a profile is absent.
 */
export async function banDb(executor: DrizzleExecutor, id: string): Promise<AccountBan> {
    const [row] = await executor
        .select(banSelection)
        .from(accountBans)
        .leftJoin(users, eq(users.accountId, accountBans.accountId))
        .where(eq(accountBans.id, id))
        .limit(1);
    if (!row) throw new OperationsError("not_found", "Ban was not found");
    return asBan(row);
}
