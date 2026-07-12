import { createHash } from "node:crypto";
import { createId } from "@paralleldrive/cuid2";
import { createClient, type Client } from "@libsql/client";
import { sql } from "drizzle-orm";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
    accountId: string;
    expiresAt: Date;
}
export interface User {
    id: string;
    firstName: string;
    lastName?: string;
    username: string;
    email?: string;
    phone?: string;
    photoFileId?: string;
}
export interface Account {
    id: string;
    email: string;
    passwordHash: string | null;
    active: boolean;
}
export interface StoredFile {
    id: string;
    userId: string;
    uploadedByUserId: string;
    isPublic: boolean;
    storageName: string;
    contentType: string;
    size: number;
    width: number;
    height: number;
    thumbhash: string;
}
export interface CreateProfile {
    firstName: string;
    lastName?: string;
    username: string;
    email?: string;
    phone?: string;
}
type AccountRow = { id: string; email: string; password_hash: string | null; active: number };
type SessionRow = { id: string; account_id: string; expires_at: string };
type UserRow = {
    id: string;
    first_name: string;
    last_name: string | null;
    username: string;
    email: string | null;
    phone: string | null;
    photo_file_id: string | null;
};
type FileRow = {
    id: string;
    user_id: string;
    uploaded_by_user_id: string;
    is_public: number;
    storage_name: string;
    content_type: string;
    size: number;
    width: number;
    height: number;
    thumbhash: string;
};

/** Shared SQLite/libSQL access; no process-local authority is kept here. */
export class Database {
    private readonly client: Client;
    private readonly db: LibSQLDatabase;

    constructor(url: string, authToken?: string) {
        this.client = createClient({ url, authToken });
        this.db = drizzle(this.client);
    }
    async migrate(): Promise<void> {
        await migrate(this.db, {
            migrationsFolder: join(dirname(fileURLToPath(import.meta.url)), "../../drizzle"),
        });
    }
    close(): void {
        this.client.close();
    }

    async createPasswordAccount(email: string, passwordHash: string): Promise<Account> {
        const account = await first(
            this.db.all<AccountRow>(
                sql`INSERT INTO accounts (id, email, password_hash) VALUES (${createId()}, ${email}, ${passwordHash}) RETURNING id, email, password_hash, active`,
            ),
        );
        if (!account) throw new Error("Could not create account");
        return asAccount(account);
    }
    async findPasswordAccount(email: string): Promise<Account | undefined> {
        return mapFirst(
            this.db.all<AccountRow>(
                sql`SELECT id, email, password_hash, active FROM accounts WHERE email = ${email}`,
            ),
            asAccount,
        );
    }

    async findOrCreateOidcAccount(
        provider: string,
        subject: string,
        email: string,
    ): Promise<Account> {
        return this.db.transaction(async (tx) => {
            await tx.run(
                sql`INSERT OR IGNORE INTO accounts (id, email) VALUES (${createId()}, ${email})`,
            );
            const account = await first(
                tx.all<AccountRow>(
                    sql`SELECT id, email, password_hash, active FROM accounts WHERE email = ${email}`,
                ),
            );
            if (!account) throw new Error("Could not create OIDC account");
            await tx.run(
                sql`INSERT OR IGNORE INTO oidc_identities (provider, subject, account_id) VALUES (${provider}, ${subject}, ${account.id})`,
            );
            const identity = await first(
                tx.all<AccountRow>(
                    sql`SELECT a.id, a.email, a.password_hash, a.active FROM oidc_identities i JOIN accounts a ON a.id = i.account_id WHERE i.provider = ${provider} AND i.subject = ${subject}`,
                ),
            );
            if (!identity) throw new Error("Could not create OIDC identity");
            return asAccount(identity);
        });
    }

    async createSession(
        accountId: string,
        expiresAt: Date,
        metadata: RequestMetadata,
    ): Promise<ActiveSession> {
        const session = { id: createId(), accountId, expiresAt };
        await this.db.run(
            sql`INSERT INTO auth_sessions (id, account_id, expires_at) VALUES (${session.id}, ${accountId}, ${expiresAt.toISOString()})`,
        );
        await this.recordEvent(session.id, "issued", metadata);
        return session;
    }
    async findActiveSession(id: string): Promise<ActiveSession | undefined> {
        return mapFirst(
            this.db.all<SessionRow>(
                sql`SELECT id, account_id, expires_at FROM auth_sessions WHERE id = ${id} AND revoked_at IS NULL AND expires_at > ${new Date().toISOString()}`,
            ),
            asSession,
        );
    }
    async refreshSession(
        id: string,
        expiresAt: Date,
        metadata: RequestMetadata,
    ): Promise<ActiveSession | undefined> {
        const session = await mapFirst(
            this.db.all<SessionRow>(
                sql`UPDATE auth_sessions SET expires_at = ${expiresAt.toISOString()}, last_seen_at = CURRENT_TIMESTAMP WHERE id = ${id} AND revoked_at IS NULL AND expires_at > ${new Date().toISOString()} RETURNING id, account_id, expires_at`,
            ),
            asSession,
        );
        if (session) await this.recordEvent(id, "refreshed", metadata);
        return session;
    }
    async revokeSession(id: string, metadata: RequestMetadata): Promise<void> {
        const result = await this.db.run(
            sql`UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = ${id} AND revoked_at IS NULL`,
        );
        if (result.rowsAffected) await this.recordEvent(id, "revoked", metadata);
    }

    async findActiveUserByAccount(accountId: string): Promise<User | undefined> {
        return mapFirst(
            this.db.all<UserRow>(
                sql`SELECT u.id, u.first_name, u.last_name, u.username, u.email, u.phone, u.photo_file_id FROM users u JOIN accounts a ON a.id = u.account_id WHERE u.account_id = ${accountId} AND a.active = 1`,
            ),
            asUser,
        );
    }
    async createProfile(accountId: string, profile: CreateProfile): Promise<User> {
        return this.db.transaction(async (tx) => {
            const user = await first(
                tx.all<UserRow>(
                    sql`INSERT INTO users (id, account_id, first_name, last_name, username, email, phone) VALUES (${createId()}, ${accountId}, ${profile.firstName}, ${profile.lastName ?? null}, ${profile.username}, ${profile.email ?? null}, ${profile.phone ?? null}) RETURNING id, first_name, last_name, username, email, phone, photo_file_id`,
                ),
            );
            if (!user) throw new Error("Could not create user profile");
            const activation = await tx.run(
                sql`UPDATE accounts SET active = 1 WHERE id = ${accountId}`,
            );
            if (!activation.rowsAffected) throw new Error("Account no longer exists");
            return asUser(user);
        });
    }
    async updateProfile(userId: string, profile: CreateProfile): Promise<User | undefined> {
        return mapFirst(
            this.db.all<UserRow>(
                sql`UPDATE users SET first_name = ${profile.firstName}, last_name = ${profile.lastName ?? null}, username = ${profile.username}, email = ${profile.email ?? null}, phone = ${profile.phone ?? null} WHERE id = ${userId} RETURNING id, first_name, last_name, username, email, phone, photo_file_id`,
            ),
            asUser,
        );
    }

    async createMagicLink(email: string, rawToken: string): Promise<void> {
        await this.db.transaction(async (tx) => {
            await tx.run(
                sql`INSERT OR IGNORE INTO accounts (id, email) VALUES (${createId()}, ${email})`,
            );
            const account = await first(
                tx.all<AccountRow>(
                    sql`SELECT id, email, password_hash, active FROM accounts WHERE email = ${email}`,
                ),
            );
            if (!account) throw new Error("Could not create magic-link account");
            await tx.run(
                sql`INSERT INTO auth_magic_links (token_hash, account_id, expires_at) VALUES (${tokenHash(rawToken)}, ${account.id}, ${new Date(Date.now() + 15 * 60_000).toISOString()})`,
            );
        });
    }
    async consumeMagicLink(rawToken: string): Promise<Account | undefined> {
        return mapFirst(
            this.db.all<AccountRow>(
                sql`UPDATE auth_magic_links SET consumed_at = CURRENT_TIMESTAMP WHERE token_hash = ${tokenHash(rawToken)} AND consumed_at IS NULL AND expires_at > ${new Date().toISOString()} RETURNING (SELECT id FROM accounts WHERE id = account_id) AS id, (SELECT email FROM accounts WHERE id = account_id) AS email, (SELECT password_hash FROM accounts WHERE id = account_id) AS password_hash, (SELECT active FROM accounts WHERE id = account_id) AS active`,
            ),
            asAccount,
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

    async createFile(file: StoredFile): Promise<void> {
        await this.db.run(
            sql`INSERT INTO files (id, user_id, uploaded_by_user_id, is_public, storage_name, content_type, size, width, height, thumbhash) VALUES (${file.id}, ${file.userId}, ${file.uploadedByUserId}, ${file.isPublic ? 1 : 0}, ${file.storageName}, ${file.contentType}, ${file.size}, ${file.width}, ${file.height}, ${file.thumbhash})`,
        );
    }
    async findFileUploadedBy(id: string, userId: string): Promise<StoredFile | undefined> {
        return mapFirst(
            this.db.all<FileRow>(
                sql`SELECT id, user_id, uploaded_by_user_id, is_public, storage_name, content_type, size, width, height, thumbhash FROM files WHERE id = ${id} AND uploaded_by_user_id = ${userId}`,
            ),
            asFile,
        );
    }
    async findFile(id: string): Promise<StoredFile | undefined> {
        return mapFirst(
            this.db.all<FileRow>(
                sql`SELECT id, user_id, uploaded_by_user_id, is_public, storage_name, content_type, size, width, height, thumbhash FROM files WHERE id = ${id}`,
            ),
            asFile,
        );
    }
    async setUserPhoto(userId: string, fileId: string): Promise<boolean> {
        const result = await this.db.run(
            sql`UPDATE users SET photo_file_id = ${fileId} WHERE id = ${userId} AND EXISTS (SELECT 1 FROM files WHERE id = ${fileId} AND uploaded_by_user_id = ${userId} AND is_public = 1)`,
        );
        return result.rowsAffected > 0;
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
function asAccount(row: AccountRow): Account {
    return {
        id: row.id,
        email: row.email,
        passwordHash: row.password_hash,
        active: row.active === 1,
    };
}
function asSession(row: SessionRow): ActiveSession {
    return { id: row.id, accountId: row.account_id, expiresAt: new Date(row.expires_at) };
}
function asUser(row: UserRow): User {
    return {
        id: row.id,
        firstName: row.first_name,
        lastName: row.last_name ?? undefined,
        username: row.username,
        email: row.email ?? undefined,
        phone: row.phone ?? undefined,
        photoFileId: row.photo_file_id ?? undefined,
    };
}
function asFile(row: FileRow): StoredFile {
    return {
        id: row.id,
        userId: row.user_id,
        uploadedByUserId: row.uploaded_by_user_id,
        isPublic: row.is_public === 1,
        storageName: row.storage_name,
        contentType: row.content_type,
        size: row.size,
        width: row.width,
        height: row.height,
        thumbhash: row.thumbhash,
    };
}
async function first<T>(rows: Promise<T[]>): Promise<T | undefined> {
    return (await rows)[0];
}
async function mapFirst<T, R>(rows: Promise<T[]>, map: (row: T) => R): Promise<R | undefined> {
    const row = await first(rows);
    return row ? map(row) : undefined;
}
export function tokenHash(token: string): string {
    return createHash("sha256").update(token).digest("base64url");
}
