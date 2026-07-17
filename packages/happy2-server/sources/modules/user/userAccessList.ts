import { type AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { type DrizzleExecutor } from "../drizzle.js";
import { type Page, type UserAccessTelemetry } from "../operations/types.js";
import { and, desc, eq, lt, or, sql, type SQL } from "drizzle-orm";

import { accounts, authSessionEvents, authSessions, users } from "../schema.js";

import { asAccess } from "./impl/asAccess.js";

import { decodeCursor } from "../operations/decodeCursor.js";

import { page } from "../operations/page.js";

import { userRequireOperationsAdmin } from "../operations/userRequireOperationsAdmin.js";
/**
 * Pages account access telemetry for an operations administrator, including active sessions and the latest request metadata.
 * Authorization, aggregation, and stable cursor ordering stay together so sensitive access history has one protected read boundary.
 */
export async function userAccessList(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        before?: string;
        limit: number;
    },
): Promise<Page<UserAccessTelemetry>> {
    await userRequireOperationsAdmin(executor, input.actorUserId);
    const cursor = decodeCursor(input.before);
    const recentEvent = (column: AnySQLiteColumn) =>
        executor
            .select({
                value: column,
            })
            .from(authSessionEvents)
            .innerJoin(authSessions, eq(authSessions.id, authSessionEvents.sessionId))
            .where(eq(authSessions.accountId, accounts.id))
            .orderBy(desc(authSessionEvents.createdAt), desc(authSessionEvents.id))
            .limit(1);
    const conditions: SQL[] = [];
    const accessAt = sql`coalesce(${users.lastAccessAt}, '')`;
    if (cursor)
        conditions.push(
            or(lt(accessAt, cursor.at), and(eq(accessAt, cursor.at), lt(users.id, cursor.id)))!,
        );
    const result = await executor
        .select({
            id: users.id,
            username: users.username,
            email: accounts.email,
            role: users.role,
            last_access_at: users.lastAccessAt,
            banned_at: accounts.bannedAt,
            ban_expires_at: accounts.banExpiresAt,
            deleted_at: accounts.deletedAt,
            last_session_access_at: sql<string | null>`max(${authSessions.lastSeenAt})`,
            active_session_count: sql<number>`sum(case when ${authSessions.revokedAt} is null and ${authSessions.expiresAt} > CURRENT_TIMESTAMP then 1 else 0 end)`,
            last_client_ip: sql<string | null>`(${recentEvent(authSessionEvents.ip)})`,
            last_device: sql<string | null>`(${recentEvent(authSessionEvents.device)})`,
            last_app_version: sql<string | null>`(${recentEvent(authSessionEvents.appVersion)})`,
            last_user_agent: sql<string | null>`(${recentEvent(authSessionEvents.userAgent)})`,
        })
        .from(users)
        .innerJoin(accounts, eq(accounts.id, users.accountId))
        .leftJoin(authSessions, eq(authSessions.accountId, accounts.id))
        .where(and(...conditions))
        .groupBy(
            users.id,
            users.username,
            accounts.email,
            users.role,
            users.lastAccessAt,
            accounts.bannedAt,
            accounts.banExpiresAt,
            accounts.deletedAt,
        )
        .orderBy(desc(accessAt), desc(users.id))
        .limit(input.limit + 1);
    return page(
        result,
        input.limit,
        asAccess,
        (item) => item.lastAccessAt ?? "",
        (item) => item.userId,
    );
}
