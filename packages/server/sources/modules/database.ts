import { createHash, randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type Client } from "@libsql/client";
import { sql } from "drizzle-orm";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

export interface RequestMetadata {
    ip?: string;
    forwardedFor?: string[];
    location?: Record<string, string>;
    device?: string;
    appVersion?: string;
    userAgent?: string;
}

export interface ActiveSession {
    id: string;
    userId: string;
    expiresAt: Date;
}
type User = { id: string; email: string; password_hash: string | null };
type SessionRow = { id: string; user_id: string; expires_at: string };

/** SQLite access is through Drizzle + libSQL, not process-local state. */
export class Database {
    private readonly client: Client;
    private readonly db: LibSQLDatabase;

    constructor(url: string, authToken?: string) {
        this.client = createClient({ url, authToken });
        this.db = drizzle(this.client);
    }

    async migrate(): Promise<void> {
        const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "../../drizzle");
        // Drizzle records migrations in SQLite. The database transaction/lock is the
        // authority when several instances reach startup together.
        await migrate(this.db, { migrationsFolder });
    }

    close(): void {
        this.client.close();
    }

    async createPasswordUser(email: string, passwordHash: string): Promise<User> {
        const id = randomUUID();
        const user = await first(
            this.db.all<User>(
                sql`INSERT INTO users (id, email, password_hash) VALUES (${id}, ${email}, ${passwordHash}) RETURNING id, email, password_hash`,
            ),
        );
        if (!user) throw new Error("Could not create user");
        return user;
    }

    async findPasswordUser(email: string): Promise<User | undefined> {
        return first(
            this.db.all<User>(
                sql`SELECT id, email, password_hash FROM users WHERE email = ${email}`,
            ),
        );
    }

    async findOrCreateOidcUser(provider: string, subject: string, email: string): Promise<User> {
        return this.db.transaction(async (tx) => {
            await tx.run(
                sql`INSERT OR IGNORE INTO users (id, email) VALUES (${randomUUID()}, ${email})`,
            );
            const user = await first(
                tx.all<User>(
                    sql`SELECT id, email, password_hash FROM users WHERE email = ${email}`,
                ),
            );
            if (!user) throw new Error("Could not create OIDC user");
            await tx.run(
                sql`INSERT OR IGNORE INTO oidc_identities (provider, subject, user_id) VALUES (${provider}, ${subject}, ${user.id})`,
            );
            const identity = await first(
                tx.all<User>(
                    sql`SELECT u.id, u.email, u.password_hash FROM oidc_identities i JOIN users u ON u.id = i.user_id WHERE i.provider = ${provider} AND i.subject = ${subject}`,
                ),
            );
            if (!identity) throw new Error("Could not create OIDC identity");
            return identity;
        });
    }

    async createSession(
        userId: string,
        expiresAt: Date,
        metadata: RequestMetadata,
    ): Promise<ActiveSession> {
        const session = { id: randomUUID(), userId, expiresAt };
        await this.db.run(
            sql`INSERT INTO auth_sessions (id, user_id, expires_at) VALUES (${session.id}, ${userId}, ${expiresAt.toISOString()})`,
        );
        await this.recordEvent(session.id, "issued", metadata);
        return session;
    }

    async findActiveSession(id: string): Promise<ActiveSession | undefined> {
        const row = await first(
            this.db.all<SessionRow>(
                sql`SELECT id, user_id, expires_at FROM auth_sessions WHERE id = ${id} AND revoked_at IS NULL AND expires_at > ${new Date().toISOString()}`,
            ),
        );
        return row ? asSession(row) : undefined;
    }

    async refreshSession(
        id: string,
        expiresAt: Date,
        metadata: RequestMetadata,
    ): Promise<ActiveSession | undefined> {
        const row = await first(
            this.db.all<SessionRow>(
                sql`UPDATE auth_sessions SET expires_at = ${expiresAt.toISOString()}, last_seen_at = CURRENT_TIMESTAMP WHERE id = ${id} AND revoked_at IS NULL AND expires_at > ${new Date().toISOString()} RETURNING id, user_id, expires_at`,
            ),
        );
        if (!row) return undefined;
        await this.recordEvent(id, "refreshed", metadata);
        return asSession(row);
    }

    async revokeSession(id: string, metadata: RequestMetadata): Promise<void> {
        const result = await this.db.run(
            sql`UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = ${id} AND revoked_at IS NULL`,
        );
        if (result.rowsAffected) await this.recordEvent(id, "revoked", metadata);
    }

    async createMagicLink(email: string, rawToken: string): Promise<void> {
        await this.db.transaction(async (tx) => {
            await tx.run(
                sql`INSERT OR IGNORE INTO users (id, email) VALUES (${randomUUID()}, ${email})`,
            );
            const user = await first(
                tx.all<User>(
                    sql`SELECT id, email, password_hash FROM users WHERE email = ${email}`,
                ),
            );
            if (!user) throw new Error("Could not create magic-link user");
            await tx.run(
                sql`INSERT INTO auth_magic_links (token_hash, user_id, expires_at) VALUES (${tokenHash(rawToken)}, ${user.id}, ${new Date(Date.now() + 15 * 60_000).toISOString()})`,
            );
        });
    }

    async consumeMagicLink(rawToken: string): Promise<User | undefined> {
        return first(
            this.db.all<User>(
                sql`UPDATE auth_magic_links SET consumed_at = CURRENT_TIMESTAMP WHERE token_hash = ${tokenHash(rawToken)} AND consumed_at IS NULL AND expires_at > ${new Date().toISOString()} RETURNING (SELECT id FROM users WHERE id = user_id) AS id, (SELECT email FROM users WHERE id = user_id) AS email, (SELECT password_hash FROM users WHERE id = user_id) AS password_hash`,
            ),
        );
    }

    async createOidcState(
        state: string,
        provider: string,
        verifier: string,
        nonce: string,
        redirectUri: string,
    ): Promise<void> {
        await this.db.run(
            sql`INSERT INTO auth_oidc_states (state, provider, code_verifier, nonce, redirect_uri, expires_at) VALUES (${state}, ${provider}, ${verifier}, ${nonce}, ${redirectUri}, ${new Date(Date.now() + 10 * 60_000).toISOString()})`,
        );
    }

    async consumeOidcState(
        state: string,
    ): Promise<
        { provider: string; verifier: string; nonce: string; redirectUri: string } | undefined
    > {
        const row = await first(
            this.db.all<{
                provider: string;
                code_verifier: string;
                nonce: string;
                redirect_uri: string;
            }>(
                sql`DELETE FROM auth_oidc_states WHERE state = ${state} AND expires_at > ${new Date().toISOString()} RETURNING provider, code_verifier, nonce, redirect_uri`,
            ),
        );
        return row
            ? {
                  provider: row.provider,
                  verifier: row.code_verifier,
                  nonce: row.nonce,
                  redirectUri: row.redirect_uri,
              }
            : undefined;
    }

    private async recordEvent(
        sessionId: string,
        type: string,
        metadata: RequestMetadata,
    ): Promise<void> {
        await this.db.run(
            sql`INSERT INTO auth_session_events (session_id, event_type, ip, forwarded_for, location, device, app_version, user_agent) VALUES (${sessionId}, ${type}, ${metadata.ip ?? null}, ${metadata.forwardedFor ? JSON.stringify(metadata.forwardedFor) : null}, ${metadata.location ? JSON.stringify(metadata.location) : null}, ${metadata.device ?? null}, ${metadata.appVersion ?? null}, ${metadata.userAgent ?? null})`,
        );
    }
}

function asSession(row: SessionRow): ActiveSession {
    return { id: row.id, userId: row.user_id, expiresAt: new Date(row.expires_at) };
}
async function first<T>(rows: Promise<T[]>): Promise<T | undefined> {
    return (await rows)[0];
}
export function tokenHash(token: string): string {
    return createHash("sha256").update(token).digest("base64url");
}
