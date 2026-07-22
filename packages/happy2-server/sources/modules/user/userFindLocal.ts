import { and, eq, isNull } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { serverSetupState, users } from "../schema.js";
import { asUser } from "./impl/asUser.js";
import type { User } from "./types.js";

/**
 * Resolves the active account-free administrator durably claimed by server setup state.
 * This exact product principal backs loopback access; no arbitrary accountless user, authentication account, or session is accepted by this read boundary.
 */
export async function userFindLocal(executor: DrizzleExecutor): Promise<User | undefined> {
    const [row] = await executor
        .select({ user: users })
        .from(users)
        .innerJoin(serverSetupState, eq(serverSetupState.bootstrapAdminUserId, users.id))
        .where(
            and(
                eq(users.kind, "human"),
                eq(users.role, "admin"),
                eq(users.active, 1),
                isNull(users.deletedAt),
                isNull(serverSetupState.bootstrapAccountId),
                eq(serverSetupState.registrationEnabled, 0),
            ),
        )
        .limit(1);
    return row ? asUser(row.user) : undefined;
}
