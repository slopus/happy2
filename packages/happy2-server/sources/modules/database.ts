import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type Client } from "@libsql/client";
import { createId } from "@paralleldrive/cuid2";
import { and, eq, gt, isNull, lt, ne, or, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createDatabase, type DrizzleExecutor } from "./drizzle.js";
import {
    accounts,
    authMagicLinks,
    authOidcStates,
    authSessionEvents,
    authSessions,
    botIdentities,
    chatBookmarks,
    chats,
    customEmojis,
    dataExportJobs,
    fileAccessGrants,
    fileDerivatives,
    fileScanEvents,
    files,
    messageAttachments,
    messages,
    oidcIdentities,
    scheduledMessageAttachments,
    serverSettings,
    serverSyncState,
    syncEvents,
    userBookmarks,
    users,
} from "./schema.js";

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
    kind: "human" | "agent";
    agentImageId?: string;
    createdByUserId?: string;
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

/** Shared SQLite/libSQL access; no process-local authority is kept here. */
export class Database {
    private readonly client: Client;
    private readonly db;
    private readonly ownsClient: boolean;
    private readonly accessTouches = new Map<string, number>();

    constructor(source: string | Client, authToken?: string) {
        this.ownsClient = typeof source === "string";
        this.client =
            typeof source === "string" ? createClient({ url: source, authToken }) : source;
        this.db = createDatabase(this.client);
    }

    async migrate(): Promise<void> {
        // Local SQLite serves realtime readers while request and background workers persist
        // durable state. WAL lets those readers continue without blocking writer commits.
        if (this.client.protocol === "file") await this.client.execute("PRAGMA journal_mode = WAL");
        await migrate(this.db, {
            migrationsFolder: join(dirname(fileURLToPath(import.meta.url)), "../../drizzle"),
        });
        await this.db
            .insert(serverSyncState)
            .values({ id: 1, generation: createId(), sequence: 0 })
            .onConflictDoNothing();
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
        const [account] = await this.db
            .insert(accounts)
            .values({ id: createId(), email, passwordHash })
            .returning();
        if (!account) throw new Error("Could not create account");
        return asAccount(account);
    }

    async findPasswordAccount(email: string): Promise<Account | undefined> {
        const [account] = await this.db.select().from(accounts).where(eq(accounts.email, email));
        return account ? asAccount(account) : undefined;
    }

    async findOrCreateOidcAccount(
        provider: string,
        subject: string,
        email: string,
    ): Promise<Account> {
        return this.db.transaction(async (tx) => {
            await tx
                .insert(accounts)
                .values({ id: createId(), email })
                .onConflictDoNothing({ target: accounts.email });
            const [account] = await tx.select().from(accounts).where(eq(accounts.email, email));
            if (!account) throw new Error("Could not create OIDC account");
            await tx
                .insert(oidcIdentities)
                .values({ provider, subject, accountId: account.id })
                .onConflictDoNothing();
            const [identity] = await tx
                .select({ account: accounts })
                .from(oidcIdentities)
                .innerJoin(accounts, eq(accounts.id, oidcIdentities.accountId))
                .where(
                    and(eq(oidcIdentities.provider, provider), eq(oidcIdentities.subject, subject)),
                );
            if (!identity) throw new Error("Could not create OIDC identity");
            return asAccount(identity.account);
        });
    }

    async findOidcAccount(provider: string, subject: string): Promise<Account | undefined> {
        const [identity] = await this.db
            .select({ account: accounts })
            .from(oidcIdentities)
            .innerJoin(accounts, eq(accounts.id, oidcIdentities.accountId))
            .where(and(eq(oidcIdentities.provider, provider), eq(oidcIdentities.subject, subject)));
        return identity ? asAccount(identity.account) : undefined;
    }

    async createSession(
        accountId: string,
        expiresAt: Date,
        metadata: RequestMetadata,
    ): Promise<ActiveSession> {
        return this.db.transaction(async (tx) => {
            const [allowed] = await tx
                .select({ id: accounts.id })
                .from(accounts)
                .where(
                    and(
                        eq(accounts.id, accountId),
                        isNull(accounts.bannedAt),
                        isNull(accounts.deletedAt),
                    ),
                );
            if (!allowed) throw new Error("Account is not allowed to create sessions");
            const session = { id: createId(), accountId, expiresAt };
            await tx.insert(authSessions).values({
                id: session.id,
                accountId,
                expiresAt: expiresAt.toISOString(),
            });
            await recordSessionEvent(tx, session.id, "issued", metadata);
            return session;
        });
    }

    async findActiveSession(id: string): Promise<ActiveSession | undefined> {
        const [row] = await this.db
            .select({
                id: authSessions.id,
                accountId: authSessions.accountId,
                expiresAt: authSessions.expiresAt,
            })
            .from(authSessions)
            .innerJoin(accounts, eq(accounts.id, authSessions.accountId))
            .where(
                and(
                    eq(authSessions.id, id),
                    isNull(authSessions.revokedAt),
                    gt(authSessions.expiresAt, new Date().toISOString()),
                    isNull(accounts.bannedAt),
                    isNull(accounts.deletedAt),
                ),
            );
        return row ? asSession(row) : undefined;
    }

    async refreshSession(
        id: string,
        expiresAt: Date,
        metadata: RequestMetadata,
    ): Promise<ActiveSession | undefined> {
        return this.db.transaction(async (tx) => {
            const activeAccount = tx
                .select({ id: accounts.id })
                .from(accounts)
                .where(
                    and(
                        eq(accounts.id, authSessions.accountId),
                        isNull(accounts.bannedAt),
                        isNull(accounts.deletedAt),
                    ),
                );
            const [session] = await tx
                .update(authSessions)
                .set({ expiresAt: expiresAt.toISOString(), lastSeenAt: sql`CURRENT_TIMESTAMP` })
                .where(
                    and(
                        eq(authSessions.id, id),
                        isNull(authSessions.revokedAt),
                        gt(authSessions.expiresAt, new Date().toISOString()),
                        sql`exists ${activeAccount}`,
                    ),
                )
                .returning({
                    id: authSessions.id,
                    accountId: authSessions.accountId,
                    expiresAt: authSessions.expiresAt,
                });
            if (!session) return undefined;
            await recordSessionEvent(tx, id, "refreshed", metadata);
            return asSession(session);
        });
    }

    async revokeSession(id: string, metadata: RequestMetadata): Promise<void> {
        await this.db.transaction(async (tx) => {
            const [session] = await tx
                .update(authSessions)
                .set({ revokedAt: sql`CURRENT_TIMESTAMP` })
                .where(and(eq(authSessions.id, id), isNull(authSessions.revokedAt)))
                .returning({ id: authSessions.id });
            if (session) await recordSessionEvent(tx, id, "revoked", metadata);
        });
    }

    async findActiveUserByAccount(accountId: string): Promise<User | undefined> {
        const [row] = await this.db
            .select({ user: users })
            .from(users)
            .innerJoin(accounts, eq(accounts.id, users.accountId))
            .where(
                and(
                    eq(users.accountId, accountId),
                    eq(accounts.active, 1),
                    isNull(accounts.bannedAt),
                    isNull(accounts.deletedAt),
                    isNull(users.deletedAt),
                ),
            );
        return row ? asUser(row.user) : undefined;
    }

    async findActiveUser(id: string): Promise<User | undefined> {
        const [row] = await this.db
            .select({ user: users })
            .from(users)
            .innerJoin(accounts, eq(accounts.id, users.accountId))
            .where(
                and(
                    eq(users.id, id),
                    eq(accounts.active, 1),
                    isNull(accounts.bannedAt),
                    isNull(accounts.deletedAt),
                    isNull(users.deletedAt),
                ),
            );
        return row ? asUser(row.user) : undefined;
    }

    async touchAccess(sessionId: string | undefined, userId: string): Promise<void> {
        const now = Date.now();
        const touchKey = sessionId ?? `external:${userId}`;
        if (now - (this.accessTouches.get(touchKey) ?? 0) < 60_000) return;
        this.accessTouches.set(touchKey, now);
        if (this.accessTouches.size > 10_000)
            this.accessTouches.delete(this.accessTouches.keys().next().value!);
        try {
            if (sessionId) {
                const activeSessionAccount = this.db
                    .select({ id: accounts.id })
                    .from(accounts)
                    .where(
                        and(
                            eq(accounts.id, authSessions.accountId),
                            eq(accounts.active, 1),
                            isNull(accounts.bannedAt),
                            isNull(accounts.deletedAt),
                        ),
                    );
                await this.db
                    .update(authSessions)
                    .set({ lastSeenAt: sql`CURRENT_TIMESTAMP` })
                    .where(
                        and(
                            eq(authSessions.id, sessionId),
                            isNull(authSessions.revokedAt),
                            sql`exists ${activeSessionAccount}`,
                            or(
                                isNull(authSessions.lastSeenAt),
                                lt(authSessions.lastSeenAt, sql`datetime('now', '-1 minute')`),
                            ),
                        ),
                    );
            }
            const activeUserAccount = this.db
                .select({ id: accounts.id })
                .from(accounts)
                .where(
                    and(
                        eq(accounts.id, users.accountId),
                        eq(accounts.active, 1),
                        isNull(accounts.bannedAt),
                        isNull(accounts.deletedAt),
                    ),
                );
            await this.db
                .update(users)
                .set({ lastAccessAt: sql`CURRENT_TIMESTAMP` })
                .where(
                    and(
                        eq(users.id, userId),
                        isNull(users.deletedAt),
                        sql`exists ${activeUserAccount}`,
                        or(
                            isNull(users.lastAccessAt),
                            lt(users.lastAccessAt, sql`datetime('now', '-1 minute')`),
                        ),
                    ),
                );
        } catch {
            // Last-access telemetry must not turn a valid authenticated request into a failure.
        }
    }

    async createProfile(accountId: string, profile: CreateProfile): Promise<User> {
        return this.db.transaction(async (tx) => {
            const [account] = await tx
                .select({ id: accounts.id })
                .from(accounts)
                .where(
                    and(
                        eq(accounts.id, accountId),
                        isNull(accounts.bannedAt),
                        isNull(accounts.deletedAt),
                    ),
                );
            if (!account) throw new Error("Could not create user profile");
            const [existing] = await tx
                .select({ id: users.id })
                .from(users)
                .innerJoin(accounts, eq(accounts.id, users.accountId))
                .where(
                    and(
                        isNull(users.deletedAt),
                        eq(accounts.active, 1),
                        isNull(accounts.bannedAt),
                        isNull(accounts.deletedAt),
                    ),
                )
                .limit(1);
            const id = createId();
            const [user] = await tx
                .insert(users)
                .values({
                    id,
                    accountId,
                    firstName: profile.firstName,
                    lastName: profile.lastName ?? null,
                    username: profile.username,
                    email: profile.email ?? null,
                    phone: profile.phone ?? null,
                    role: existing ? "member" : "admin",
                })
                .returning();
            if (!user) throw new Error("Could not create user profile");
            const [activation] = await tx
                .update(accounts)
                .set({ active: 1 })
                .where(
                    and(
                        eq(accounts.id, accountId),
                        isNull(accounts.bannedAt),
                        isNull(accounts.deletedAt),
                    ),
                )
                .returning({ id: accounts.id });
            if (!activation) throw new Error("Account no longer exists");
            const sequence = await nextSequence(tx);
            await tx.update(users).set({ syncSequence: sequence }).where(eq(users.id, id));
            await tx.insert(syncEvents).values({
                sequence,
                kind: "user.created",
                entityId: id,
                actorUserId: id,
            });
            return asUser({ ...user, syncSequence: sequence });
        });
    }

    async updateProfile(userId: string, profile: CreateProfile): Promise<User | undefined> {
        return this.db.transaction(async (tx) => {
            const [active] = await tx
                .select({ id: users.id })
                .from(users)
                .innerJoin(accounts, eq(accounts.id, users.accountId))
                .where(
                    and(
                        eq(users.id, userId),
                        isNull(users.deletedAt),
                        eq(accounts.active, 1),
                        isNull(accounts.bannedAt),
                        isNull(accounts.deletedAt),
                    ),
                );
            if (!active) return undefined;
            const sequence = await nextSequence(tx);
            const [user] = await tx
                .update(users)
                .set({
                    firstName: profile.firstName,
                    lastName: profile.lastName ?? null,
                    username: profile.username,
                    email: profile.email ?? null,
                    phone: profile.phone ?? null,
                    syncSequence: sequence,
                })
                .where(eq(users.id, userId))
                .returning();
            if (!user) return undefined;
            await tx.insert(syncEvents).values({
                sequence,
                kind: "user.updated",
                entityId: userId,
                actorUserId: userId,
            });
            return asUser(user);
        });
    }

    async createMagicLink(email: string, rawToken: string): Promise<void> {
        await this.db.transaction(async (tx) => {
            await tx
                .insert(accounts)
                .values({ id: createId(), email })
                .onConflictDoNothing({ target: accounts.email });
            const [account] = await tx
                .select({ id: accounts.id })
                .from(accounts)
                .where(eq(accounts.email, email));
            if (!account) throw new Error("Could not create magic-link account");
            await tx.insert(authMagicLinks).values({
                tokenHash: tokenHash(rawToken),
                accountId: account.id,
                expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
            });
        });
    }

    async consumeMagicLink(rawToken: string): Promise<Account | undefined> {
        return this.db.transaction(async (tx) => {
            const [link] = await tx
                .update(authMagicLinks)
                .set({ consumedAt: sql`CURRENT_TIMESTAMP` })
                .where(
                    and(
                        eq(authMagicLinks.tokenHash, tokenHash(rawToken)),
                        isNull(authMagicLinks.consumedAt),
                        gt(authMagicLinks.expiresAt, new Date().toISOString()),
                    ),
                )
                .returning({ accountId: authMagicLinks.accountId });
            if (!link) return undefined;
            const [account] = await tx
                .select()
                .from(accounts)
                .where(eq(accounts.id, link.accountId));
            return account ? asAccount(account) : undefined;
        });
    }

    async createOidcState(
        state: string,
        provider: string,
        verifier: string,
        nonce: string,
        redirectUri: string,
    ): Promise<void> {
        await this.db.insert(authOidcStates).values({
            state,
            provider,
            codeVerifier: verifier,
            nonce,
            redirectUri,
            expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
        });
    }

    async consumeOidcState(
        state: string,
    ): Promise<
        { provider: string; verifier: string; nonce: string; redirectUri: string } | undefined
    > {
        const [row] = await this.db
            .delete(authOidcStates)
            .where(
                and(
                    eq(authOidcStates.state, state),
                    gt(authOidcStates.expiresAt, new Date().toISOString()),
                ),
            )
            .returning({
                provider: authOidcStates.provider,
                verifier: authOidcStates.codeVerifier,
                nonce: authOidcStates.nonce,
                redirectUri: authOidcStates.redirectUri,
            });
        return row;
    }

    async createFile(
        file: StoredFile,
        scan: { status: "clean" | "failed" | "skipped"; result?: unknown } = {
            status: "skipped",
        },
    ): Promise<void> {
        await this.db.transaction(async (tx) => {
            await tx.insert(files).values({
                id: file.id,
                userId: file.userId,
                uploadedByUserId: file.uploadedByUserId,
                isPublic: file.isPublic ? 1 : 0,
                storageName: file.storageName,
                contentType: file.contentType,
                size: file.size,
                width: file.width,
                height: file.height,
                thumbhash: file.thumbhash,
                kind: file.kind,
                originalName: file.originalName ?? null,
                durationMs: file.durationMs ?? null,
                scanStatus: scan.status,
                scannedAt: sql`CURRENT_TIMESTAMP`,
                scanResultJson: scan.result === undefined ? null : JSON.stringify(scan.result),
            });
            await tx.insert(fileScanEvents).values({
                id: createId(),
                fileId: file.id,
                scanner: "upload_policy",
                status: scan.status,
                resultJson: scan.result === undefined ? null : JSON.stringify(scan.result),
            });
        });
    }

    async findFileUploadedBy(id: string, userId: string): Promise<StoredFile | undefined> {
        const [file] = await this.db
            .select()
            .from(files)
            .where(
                and(
                    eq(files.id, id),
                    eq(files.uploadedByUserId, userId),
                    isNull(files.deletedAt),
                    eq(files.uploadStatus, "complete"),
                    ne(files.scanStatus, "infected"),
                ),
            );
        return file ? asFile(file) : undefined;
    }

    async findFile(id: string): Promise<StoredFile | undefined> {
        const [file] = await this.db
            .select()
            .from(files)
            .where(
                and(
                    eq(files.id, id),
                    isNull(files.deletedAt),
                    eq(files.uploadStatus, "complete"),
                    ne(files.scanStatus, "infected"),
                ),
            );
        return file ? asFile(file) : undefined;
    }

    async listStoredFiles(): Promise<StoredFile[]> {
        const rows = await this.db
            .select()
            .from(files)
            .where(
                and(
                    isNull(files.deletedAt),
                    eq(files.uploadStatus, "complete"),
                    ne(files.scanStatus, "infected"),
                ),
            )
            .orderBy(files.id);
        return rows.map(asFile);
    }

    async deleteOwnedUnreferencedFile(
        id: string,
        userId: string,
        reason?: string,
    ): Promise<"deleted" | "not_found" | "in_use"> {
        return this.db.transaction(async (tx) => {
            const [file] = await tx
                .select({ id: files.id })
                .from(files)
                .where(
                    and(
                        eq(files.id, id),
                        eq(files.uploadedByUserId, userId),
                        isNull(files.deletedAt),
                    ),
                );
            if (!file) return "not_found";
            if (await hasFileReference(tx, id)) return "in_use";
            await tx
                .update(files)
                .set({
                    deletedAt: sql`CURRENT_TIMESTAMP`,
                    deletedByUserId: userId,
                    deleteReason: reason ?? null,
                })
                .where(and(eq(files.id, id), isNull(files.deletedAt)));
            return "deleted";
        });
    }

    async setUserPhoto(userId: string, fileId: string): Promise<boolean> {
        return this.db.transaction(async (tx) => {
            const [active] = await tx
                .select({ id: users.id })
                .from(users)
                .innerJoin(accounts, eq(accounts.id, users.accountId))
                .where(
                    and(
                        eq(users.id, userId),
                        isNull(users.deletedAt),
                        eq(accounts.active, 1),
                        isNull(accounts.bannedAt),
                        isNull(accounts.deletedAt),
                    ),
                );
            const [file] = await tx
                .select({ id: files.id })
                .from(files)
                .where(
                    and(
                        eq(files.id, fileId),
                        eq(files.uploadedByUserId, userId),
                        eq(files.isPublic, 1),
                    ),
                );
            if (!active || !file) return false;
            const sequence = await nextSequence(tx);
            await tx
                .update(users)
                .set({ photoFileId: fileId, syncSequence: sequence })
                .where(eq(users.id, userId));
            await tx.insert(syncEvents).values({
                sequence,
                kind: "user.updated",
                entityId: userId,
                actorUserId: userId,
            });
            return true;
        });
    }
}

async function hasFileReference(executor: DrizzleExecutor, fileId: string): Promise<boolean> {
    const checks = [
        executor
            .select({ id: messageAttachments.fileId })
            .from(messageAttachments)
            .innerJoin(messages, eq(messages.id, messageAttachments.messageId))
            .where(and(eq(messageAttachments.fileId, fileId), isNull(messages.deletedAt)))
            .limit(1),
        executor
            .select({ id: scheduledMessageAttachments.fileId })
            .from(scheduledMessageAttachments)
            .where(eq(scheduledMessageAttachments.fileId, fileId))
            .limit(1),
        executor
            .select({ id: customEmojis.fileId })
            .from(customEmojis)
            .where(and(eq(customEmojis.fileId, fileId), isNull(customEmojis.deletedAt)))
            .limit(1),
        executor.select({ id: users.id }).from(users).where(eq(users.photoFileId, fileId)).limit(1),
        executor.select({ id: chats.id }).from(chats).where(eq(chats.photoFileId, fileId)).limit(1),
        executor
            .select({ id: serverSettings.id })
            .from(serverSettings)
            .where(eq(serverSettings.photoFileId, fileId))
            .limit(1),
        executor
            .select({ id: botIdentities.id })
            .from(botIdentities)
            .where(eq(botIdentities.photoFileId, fileId))
            .limit(1),
        executor
            .select({ id: chatBookmarks.id })
            .from(chatBookmarks)
            .where(eq(chatBookmarks.fileId, fileId))
            .limit(1),
        executor
            .select({ id: userBookmarks.id })
            .from(userBookmarks)
            .where(eq(userBookmarks.fileId, fileId))
            .limit(1),
        executor
            .select({ id: fileAccessGrants.id })
            .from(fileAccessGrants)
            .where(eq(fileAccessGrants.fileId, fileId))
            .limit(1),
        executor
            .select({ id: dataExportJobs.id })
            .from(dataExportJobs)
            .where(
                and(
                    eq(dataExportJobs.outputFileId, fileId),
                    sql`${dataExportJobs.status} not in ('cancelled', 'expired')`,
                ),
            )
            .limit(1),
        executor
            .select({ id: fileDerivatives.sourceFileId })
            .from(fileDerivatives)
            .where(
                or(
                    eq(fileDerivatives.sourceFileId, fileId),
                    eq(fileDerivatives.derivedFileId, fileId),
                ),
            )
            .limit(1),
        executor
            .select({ id: files.id })
            .from(files)
            .where(or(eq(files.previewFileId, fileId), eq(files.thumbnailFileId, fileId)))
            .limit(1),
        executor
            .select({ id: files.id })
            .from(files)
            .where(
                and(
                    eq(files.id, fileId),
                    or(
                        sql`${files.previewFileId} is not null`,
                        sql`${files.thumbnailFileId} is not null`,
                    ),
                ),
            )
            .limit(1),
    ];
    for (const check of checks) if ((await check).length > 0) return true;
    return false;
}

async function nextSequence(executor: DrizzleExecutor): Promise<number> {
    const [state] = await executor
        .update(serverSyncState)
        .set({ sequence: sql`${serverSyncState.sequence} + 1` })
        .where(eq(serverSyncState.id, 1))
        .returning({ sequence: serverSyncState.sequence });
    if (!state) throw new Error("Sync state is not initialized");
    return state.sequence;
}

async function recordSessionEvent(
    executor: DrizzleExecutor,
    sessionId: string,
    type: string,
    metadata: RequestMetadata,
): Promise<void> {
    await executor.insert(authSessionEvents).values({
        sessionId,
        eventType: type,
        ip: metadata.ip ?? null,
        forwardedFor: metadata.forwardedFor ? JSON.stringify(metadata.forwardedFor) : null,
        location: metadata.location ? JSON.stringify(metadata.location) : null,
        device: metadata.device ?? null,
        appVersion: metadata.appVersion ?? null,
        userAgent: metadata.userAgent ?? null,
    });
}

type AccountRow = typeof accounts.$inferSelect;
type UserRow = typeof users.$inferSelect;
type FileRow = typeof files.$inferSelect;

function asAccount(row: AccountRow): Account {
    return {
        id: row.id,
        email: row.email,
        passwordHash: row.passwordHash,
        active: row.active === 1,
        bannedAt: row.bannedAt ?? undefined,
        deletedAt: row.deletedAt ?? undefined,
    };
}

function asSession(row: { id: string; accountId: string; expiresAt: string }): ActiveSession {
    return { id: row.id, accountId: row.accountId, expiresAt: new Date(row.expiresAt) };
}

function asUser(row: UserRow): User {
    return {
        id: row.id,
        firstName: row.firstName,
        lastName: row.lastName ?? undefined,
        username: row.username,
        email: row.email ?? undefined,
        phone: row.phone ?? undefined,
        photoFileId: row.photoFileId ?? undefined,
        title: row.title ?? undefined,
        role: row.role as User["role"],
        kind: row.kind as User["kind"],
        agentImageId: row.agentImageId ?? undefined,
        createdByUserId: row.createdByUserId ?? undefined,
        lastAccessAt: row.lastAccessAt ?? undefined,
    };
}

function asFile(row: FileRow): StoredFile {
    if (!row.uploadedByUserId) throw new Error("Stored file is missing its uploader");
    return {
        id: row.id,
        userId: row.userId,
        uploadedByUserId: row.uploadedByUserId,
        isPublic: row.isPublic === 1,
        storageName: row.storageName,
        contentType: row.contentType,
        size: row.size,
        width: row.width,
        height: row.height,
        thumbhash: row.thumbhash,
        kind: row.kind as FileKind,
        originalName: row.originalName ?? undefined,
        durationMs: row.durationMs ?? undefined,
    };
}

export function tokenHash(token: string): string {
    return createHash("sha256").update(token).digest("base64url");
}
