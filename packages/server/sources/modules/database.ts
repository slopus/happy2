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
    title?: string;
    role: "member" | "admin";
    lastAccessAt?: string;
}
export interface Account {
    id: string;
    email: string;
    passwordHash: string | null;
    active: boolean;
    bannedAt?: string;
    deletedAt?: string;
}
export type FileKind = "file" | "photo" | "video" | "gif";
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
    kind: FileKind;
    originalName?: string;
    durationMs?: number;
}
export interface CreateProfile {
    firstName: string;
    lastName?: string;
    username: string;
    email?: string;
    phone?: string;
}
type AccountRow = {
    id: string;
    email: string;
    password_hash: string | null;
    active: number;
    banned_at: string | null;
    deleted_at: string | null;
};
type SessionRow = { id: string; account_id: string; expires_at: string };
type UserRow = {
    id: string;
    first_name: string;
    last_name: string | null;
    username: string;
    email: string | null;
    phone: string | null;
    photo_file_id: string | null;
    title: string | null;
    role: "member" | "admin";
    last_access_at: string | null;
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
    kind: FileKind;
    original_name: string | null;
    duration_ms: number | null;
};

const ACCOUNT_COLUMNS = "id, email, password_hash, active, banned_at, deleted_at";
const USER_COLUMNS =
    "id, first_name, last_name, username, email, phone, photo_file_id, title, role, last_access_at";
const FILE_COLUMNS =
    "id, user_id, uploaded_by_user_id, is_public, storage_name, content_type, size, width, height, thumbhash, kind, original_name, duration_ms";

/** Shared SQLite/libSQL access; no process-local authority is kept here. */
export class Database {
    private readonly client: Client;
    private readonly db: LibSQLDatabase;
    private readonly ownsClient: boolean;
    private readonly accessTouches = new Map<string, number>();

    constructor(source: string | Client, authToken?: string) {
        this.ownsClient = typeof source === "string";
        this.client =
            typeof source === "string" ? createClient({ url: source, authToken }) : source;
        this.db = drizzle(this.client);
    }
    async migrate(): Promise<void> {
        await migrate(this.db, {
            migrationsFolder: join(dirname(fileURLToPath(import.meta.url)), "../../drizzle"),
        });
        await this.db.run(
            sql`INSERT OR IGNORE INTO server_sync_state (id, generation, sequence) VALUES (1, ${createId()}, 0)`,
        );
    }
    close(): void {
        this.accessTouches.clear();
        if (this.ownsClient) this.client.close();
    }
    /** Package-internal shared connection for durable backend extensions. */
    extensionClient(): Client {
        return this.client;
    }

    async createPasswordAccount(email: string, passwordHash: string): Promise<Account> {
        const account = await first(
            this.db.all<AccountRow>(
                sql`INSERT INTO accounts (id, email, password_hash) VALUES (${createId()}, ${email}, ${passwordHash}) RETURNING ${sql.raw(ACCOUNT_COLUMNS)}`,
            ),
        );
        if (!account) throw new Error("Could not create account");
        return asAccount(account);
    }
    async findPasswordAccount(email: string): Promise<Account | undefined> {
        return mapFirst(
            this.db.all<AccountRow>(
                sql`SELECT ${sql.raw(ACCOUNT_COLUMNS)} FROM accounts WHERE email = ${email}`,
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
                    sql`SELECT ${sql.raw(ACCOUNT_COLUMNS)} FROM accounts WHERE email = ${email}`,
                ),
            );
            if (!account) throw new Error("Could not create OIDC account");
            await tx.run(
                sql`INSERT OR IGNORE INTO oidc_identities (provider, subject, account_id) VALUES (${provider}, ${subject}, ${account.id})`,
            );
            const identity = await first(
                tx.all<AccountRow>(
                    sql`SELECT a.id, a.email, a.password_hash, a.active, a.banned_at, a.deleted_at FROM oidc_identities i JOIN accounts a ON a.id = i.account_id WHERE i.provider = ${provider} AND i.subject = ${subject}`,
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
        const inserted = await this.db.run(
            sql`INSERT INTO auth_sessions (id, account_id, expires_at) SELECT ${session.id}, ${accountId}, ${expiresAt.toISOString()} FROM accounts WHERE id = ${accountId} AND banned_at IS NULL AND deleted_at IS NULL`,
        );
        if (!inserted.rowsAffected) throw new Error("Account is not allowed to create sessions");
        await this.recordEvent(session.id, "issued", metadata);
        return session;
    }
    async findActiveSession(id: string): Promise<ActiveSession | undefined> {
        return mapFirst(
            this.db.all<SessionRow>(
                sql`SELECT s.id, s.account_id, s.expires_at FROM auth_sessions s JOIN accounts a ON a.id = s.account_id WHERE s.id = ${id} AND s.revoked_at IS NULL AND s.expires_at > ${new Date().toISOString()} AND a.banned_at IS NULL AND a.deleted_at IS NULL`,
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
                sql`UPDATE auth_sessions SET expires_at = ${expiresAt.toISOString()}, last_seen_at = CURRENT_TIMESTAMP WHERE id = ${id} AND revoked_at IS NULL AND expires_at > ${new Date().toISOString()} AND EXISTS (SELECT 1 FROM accounts WHERE accounts.id = auth_sessions.account_id AND accounts.banned_at IS NULL AND accounts.deleted_at IS NULL) RETURNING id, account_id, expires_at`,
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
                sql`SELECT u.id, u.first_name, u.last_name, u.username, u.email, u.phone, u.photo_file_id, u.title, u.role, u.last_access_at FROM users u JOIN accounts a ON a.id = u.account_id WHERE u.account_id = ${accountId} AND a.active = 1 AND a.banned_at IS NULL AND a.deleted_at IS NULL AND u.deleted_at IS NULL`,
            ),
            asUser,
        );
    }
    async touchAccess(sessionId: string, userId: string): Promise<void> {
        const now = Date.now();
        if (now - (this.accessTouches.get(sessionId) ?? 0) < 60_000) return;
        this.accessTouches.set(sessionId, now);
        if (this.accessTouches.size > 10_000)
            this.accessTouches.delete(this.accessTouches.keys().next().value!);
        try {
            await this.db.run(
                sql`UPDATE auth_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ${sessionId} AND revoked_at IS NULL AND EXISTS (SELECT 1 FROM accounts WHERE accounts.id = auth_sessions.account_id AND accounts.active = 1 AND accounts.banned_at IS NULL AND accounts.deleted_at IS NULL) AND (last_seen_at IS NULL OR last_seen_at < datetime('now', '-1 minute'))`,
            );
            await this.db.run(
                sql`UPDATE users SET last_access_at = CURRENT_TIMESTAMP WHERE id = ${userId} AND deleted_at IS NULL AND EXISTS (SELECT 1 FROM accounts WHERE accounts.id = users.account_id AND accounts.active = 1 AND accounts.banned_at IS NULL AND accounts.deleted_at IS NULL) AND (last_access_at IS NULL OR last_access_at < datetime('now', '-1 minute'))`,
            );
        } catch {
            // Last-access telemetry must not turn a valid authenticated request into a failure.
        }
    }
    async createProfile(accountId: string, profile: CreateProfile): Promise<User> {
        return this.db.transaction(async (tx) => {
            const user = await first(
                tx.all<UserRow>(
                    sql`INSERT INTO users (id, account_id, first_name, last_name, username, email, phone, role) SELECT ${createId()}, a.id, ${profile.firstName}, ${profile.lastName ?? null}, ${profile.username}, ${profile.email ?? null}, ${profile.phone ?? null}, CASE WHEN EXISTS (SELECT 1 FROM users u JOIN accounts existing_account ON existing_account.id = u.account_id WHERE u.deleted_at IS NULL AND existing_account.active = 1 AND existing_account.banned_at IS NULL AND existing_account.deleted_at IS NULL) THEN 'member' ELSE 'admin' END FROM accounts a WHERE a.id = ${accountId} AND a.banned_at IS NULL AND a.deleted_at IS NULL RETURNING ${sql.raw(USER_COLUMNS)}`,
                ),
            );
            if (!user) throw new Error("Could not create user profile");
            const activation = await tx.run(
                sql`UPDATE accounts SET active = 1 WHERE id = ${accountId} AND banned_at IS NULL AND deleted_at IS NULL`,
            );
            if (!activation.rowsAffected) throw new Error("Account no longer exists");
            const sequence = await first(
                tx.all<{ sequence: number }>(
                    sql`UPDATE server_sync_state SET sequence = sequence + 1 WHERE id = 1 RETURNING sequence`,
                ),
            );
            if (!sequence) throw new Error("Sync state is not initialized");
            await tx.run(
                sql`UPDATE users SET sync_sequence = ${sequence.sequence} WHERE id = ${user.id}`,
            );
            await tx.run(
                sql`INSERT INTO sync_events (sequence, kind, entity_id, actor_user_id) VALUES (${sequence.sequence}, 'user.created', ${user.id}, ${user.id})`,
            );
            return asUser(user);
        });
    }
    async updateProfile(userId: string, profile: CreateProfile): Promise<User | undefined> {
        return this.db.transaction(async (tx) => {
            const sequence = await first(
                tx.all<{ sequence: number }>(
                    sql`UPDATE server_sync_state SET sequence = sequence + 1 WHERE id = 1 RETURNING sequence`,
                ),
            );
            if (!sequence) throw new Error("Sync state is not initialized");
            const user = await mapFirst(
                tx.all<UserRow>(
                    sql`UPDATE users SET first_name = ${profile.firstName}, last_name = ${profile.lastName ?? null}, username = ${profile.username}, email = ${profile.email ?? null}, phone = ${profile.phone ?? null}, sync_sequence = ${sequence.sequence} WHERE id = ${userId} AND deleted_at IS NULL AND EXISTS (SELECT 1 FROM accounts WHERE accounts.id = users.account_id AND accounts.active = 1 AND accounts.banned_at IS NULL AND accounts.deleted_at IS NULL) RETURNING ${sql.raw(USER_COLUMNS)}`,
                ),
                asUser,
            );
            if (!user) return undefined;
            await tx.run(
                sql`INSERT INTO sync_events (sequence, kind, entity_id, actor_user_id) VALUES (${sequence.sequence}, 'user.updated', ${userId}, ${userId})`,
            );
            return user;
        });
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
                sql`UPDATE auth_magic_links SET consumed_at = CURRENT_TIMESTAMP WHERE token_hash = ${tokenHash(rawToken)} AND consumed_at IS NULL AND expires_at > ${new Date().toISOString()} RETURNING (SELECT id FROM accounts WHERE id = account_id) AS id, (SELECT email FROM accounts WHERE id = account_id) AS email, (SELECT password_hash FROM accounts WHERE id = account_id) AS password_hash, (SELECT active FROM accounts WHERE id = account_id) AS active, (SELECT banned_at FROM accounts WHERE id = account_id) AS banned_at, (SELECT deleted_at FROM accounts WHERE id = account_id) AS deleted_at`,
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

    async createFile(
        file: StoredFile,
        scan: { status: "clean" | "failed" | "skipped"; result?: unknown } = {
            status: "skipped",
        },
    ): Promise<void> {
        await this.db.transaction(async (tx) => {
            await tx.run(
                sql`INSERT INTO files (id, user_id, uploaded_by_user_id, is_public, storage_name, content_type, size, width, height, thumbhash, kind, original_name, duration_ms, scan_status, scanned_at, scan_result_json) VALUES (${file.id}, ${file.userId}, ${file.uploadedByUserId}, ${file.isPublic ? 1 : 0}, ${file.storageName}, ${file.contentType}, ${file.size}, ${file.width}, ${file.height}, ${file.thumbhash}, ${file.kind}, ${file.originalName ?? null}, ${file.durationMs ?? null}, ${scan.status}, CURRENT_TIMESTAMP, ${scan.result === undefined ? null : JSON.stringify(scan.result)})`,
            );
            await tx.run(
                sql`INSERT INTO file_scan_events (id, file_id, scanner, status, result_json) VALUES (${createId()}, ${file.id}, 'upload_policy', ${scan.status}, ${scan.result === undefined ? null : JSON.stringify(scan.result)})`,
            );
        });
    }
    async findFileUploadedBy(id: string, userId: string): Promise<StoredFile | undefined> {
        return mapFirst(
            this.db.all<FileRow>(
                sql`SELECT ${sql.raw(FILE_COLUMNS)} FROM files WHERE id = ${id} AND uploaded_by_user_id = ${userId} AND deleted_at IS NULL AND upload_status = 'complete' AND scan_status != 'infected'`,
            ),
            asFile,
        );
    }
    async findFile(id: string): Promise<StoredFile | undefined> {
        return mapFirst(
            this.db.all<FileRow>(
                sql`SELECT ${sql.raw(FILE_COLUMNS)} FROM files WHERE id = ${id} AND deleted_at IS NULL AND upload_status = 'complete' AND scan_status != 'infected'`,
            ),
            asFile,
        );
    }
    async listStoredFiles(): Promise<StoredFile[]> {
        return (
            await this.db.all<FileRow>(
                sql`SELECT ${sql.raw(FILE_COLUMNS)} FROM files WHERE deleted_at IS NULL AND upload_status = 'complete' AND scan_status != 'infected' ORDER BY id`,
            )
        ).map(asFile);
    }
    async deleteOwnedUnreferencedFile(
        id: string,
        userId: string,
        reason?: string,
    ): Promise<"deleted" | "not_found" | "in_use"> {
        return this.db.transaction(async (tx) => {
            const file = await first(
                tx.all<{ id: string }>(
                    sql`SELECT id FROM files WHERE id = ${id} AND uploaded_by_user_id = ${userId} AND deleted_at IS NULL`,
                ),
            );
            if (!file) return "not_found";
            const reference = await first(
                tx.all<{ found: number }>(
                    sql`SELECT 1 AS found WHERE
                        EXISTS (SELECT 1 FROM message_attachments ma JOIN messages m ON m.id = ma.message_id WHERE ma.file_id = ${id} AND m.deleted_at IS NULL)
                        OR EXISTS (SELECT 1 FROM scheduled_message_attachments WHERE file_id = ${id})
                        OR EXISTS (SELECT 1 FROM custom_emojis e WHERE e.file_id = ${id} AND e.deleted_at IS NULL)
                        OR EXISTS (SELECT 1 FROM users u WHERE u.photo_file_id = ${id} AND u.deleted_at IS NULL)
                        OR EXISTS (SELECT 1 FROM chats c WHERE c.photo_file_id = ${id} AND c.deleted_at IS NULL)
                        OR EXISTS (SELECT 1 FROM server_settings s WHERE s.photo_file_id = ${id})
                        OR EXISTS (SELECT 1 FROM bot_identities b WHERE b.photo_file_id = ${id} AND b.deleted_at IS NULL)
                        OR EXISTS (SELECT 1 FROM chat_bookmarks WHERE file_id = ${id})
                        OR EXISTS (SELECT 1 FROM user_bookmarks WHERE file_id = ${id})
                        OR EXISTS (SELECT 1 FROM file_access_grants WHERE file_id = ${id})
                        OR EXISTS (SELECT 1 FROM data_export_jobs WHERE output_file_id = ${id} AND status NOT IN ('cancelled', 'expired'))
                        OR EXISTS (SELECT 1 FROM file_derivatives d WHERE d.source_file_id = ${id} OR d.derived_file_id = ${id})
                        OR EXISTS (SELECT 1 FROM files child WHERE child.preview_file_id = ${id} OR child.thumbnail_file_id = ${id})
                        OR EXISTS (SELECT 1 FROM files parent WHERE parent.id = ${id} AND (parent.preview_file_id IS NOT NULL OR parent.thumbnail_file_id IS NOT NULL))`,
                ),
            );
            if (reference) return "in_use";
            await tx.run(
                sql`UPDATE files SET deleted_at = CURRENT_TIMESTAMP, deleted_by_user_id = ${userId}, delete_reason = ${reason ?? null} WHERE id = ${id} AND deleted_at IS NULL`,
            );
            return "deleted";
        });
    }
    async setUserPhoto(userId: string, fileId: string): Promise<boolean> {
        return this.db.transaction(async (tx) => {
            const sequence = await first(
                tx.all<{ sequence: number }>(
                    sql`UPDATE server_sync_state SET sequence = sequence + 1 WHERE id = 1 RETURNING sequence`,
                ),
            );
            if (!sequence) throw new Error("Sync state is not initialized");
            const result = await tx.run(
                sql`UPDATE users SET photo_file_id = ${fileId}, sync_sequence = ${sequence.sequence} WHERE id = ${userId} AND deleted_at IS NULL AND EXISTS (SELECT 1 FROM accounts WHERE accounts.id = users.account_id AND accounts.active = 1 AND accounts.banned_at IS NULL AND accounts.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM files WHERE id = ${fileId} AND uploaded_by_user_id = ${userId} AND is_public = 1)`,
            );
            if (!result.rowsAffected) return false;
            await tx.run(
                sql`INSERT INTO sync_events (sequence, kind, entity_id, actor_user_id) VALUES (${sequence.sequence}, 'user.updated', ${userId}, ${userId})`,
            );
            return true;
        });
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
        bannedAt: row.banned_at ?? undefined,
        deletedAt: row.deleted_at ?? undefined,
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
        title: row.title ?? undefined,
        role: row.role,
        lastAccessAt: row.last_access_at ?? undefined,
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
        kind: row.kind,
        originalName: row.original_name ?? undefined,
        durationMs: row.duration_ms ?? undefined,
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
