import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type Client } from "@libsql/client";
import { createId } from "@paralleldrive/cuid2";
import { and, eq, gt, isNull, lt, ne, or, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createDatabase, retrySqliteBusy, type DrizzleExecutor } from "./drizzle.js";
import {
    accounts,
    agentImages,
    authMagicLinks,
    authOidcStates,
    authSessionEvents,
    authSessions,
    botIdentities,
    chatBookmarks,
    chatMembers,
    chatUpdates,
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
    serverSetupState,
    serverSetupSteps,
    serverSyncState,
    syncEvents,
    userBookmarks,
    userOnboardingSteps,
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
    systemRole?: "service";
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

export class RegistrationClosedError extends Error {
    constructor() {
        super("Registration is closed");
        this.name = "RegistrationClosedError";
    }
}

export class AccountExistsError extends Error {
    constructor() {
        super("Account already exists");
        this.name = "AccountExistsError";
    }
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
        await this.db.transaction((tx) => this.ensureChannelDefaults(tx));
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

    async registerPasswordAccount(email: string, passwordHash: string): Promise<Account> {
        return retrySqliteBusy(() =>
            this.db.transaction(async (tx) => {
                await requireNewRegistrationRequestAllowedDb(tx);
                const [existing] = await tx
                    .select({ id: accounts.id })
                    .from(accounts)
                    .where(eq(accounts.email, email));
                if (existing) throw new AccountExistsError();
                const [account] = await tx
                    .insert(accounts)
                    .values({ id: createId(), email, passwordHash })
                    .returning();
                if (!account) throw new Error("Could not create account");
                await authorizeNewRegistrationDb(tx, account.id);
                return asAccount(account);
            }),
        );
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
        return retrySqliteBusy(() =>
            this.db.transaction(async (tx) => {
                const [knownIdentity] = await tx
                    .select({ account: accounts })
                    .from(oidcIdentities)
                    .innerJoin(accounts, eq(accounts.id, oidcIdentities.accountId))
                    .where(
                        and(
                            eq(oidcIdentities.provider, provider),
                            eq(oidcIdentities.subject, subject),
                        ),
                    );
                if (knownIdentity) return asAccount(knownIdentity.account);
                let [account] = await tx.select().from(accounts).where(eq(accounts.email, email));
                if (!account) {
                    [account] = await tx
                        .insert(accounts)
                        .values({ id: createId(), email })
                        .returning();
                    if (!account) throw new Error("Could not create OIDC account");
                    await authorizeNewRegistrationDb(tx, account.id);
                }
                await tx.insert(oidcIdentities).values({
                    provider,
                    subject,
                    accountId: account.id,
                });
                return asAccount(account);
            }),
        );
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

    async createProfile(
        accountId: string,
        profile: CreateProfile,
        /** Trusted test/provisioning bypass; request handlers must use the default. */
        options: { provisioned?: boolean } = {},
    ): Promise<User> {
        return retrySqliteBusy(() =>
            this.db.transaction(async (tx) => {
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
                const [existingProvisionedUser] = options.provisioned
                    ? await tx
                          .select({ id: users.id })
                          .from(users)
                          .innerJoin(accounts, eq(accounts.id, users.accountId))
                          .where(
                              and(
                                  eq(users.kind, "human"),
                                  isNull(users.deletedAt),
                                  eq(accounts.active, 1),
                                  isNull(accounts.bannedAt),
                                  isNull(accounts.deletedAt),
                              ),
                          )
                          .limit(1)
                    : [];
                const [setup] = await tx
                    .select({
                        bootstrapAccountId: serverSetupState.bootstrapAccountId,
                        bootstrapAdminUserId: serverSetupState.bootstrapAdminUserId,
                    })
                    .from(serverSetupState)
                    .where(eq(serverSetupState.id, 1));
                const [completion] = await tx
                    .select({ state: serverSetupSteps.state })
                    .from(serverSetupSteps)
                    .where(eq(serverSetupSteps.step, "server_setup_complete"));
                if (!setup || !completion) throw new Error("Server setup state is not initialized");
                const setupComplete = completion.state === "complete";
                if (
                    !options.provisioned &&
                    !setupComplete &&
                    setup.bootstrapAccountId &&
                    setup.bootstrapAccountId !== accountId
                )
                    throw new RegistrationClosedError();
                if (!options.provisioned && !setupComplete && !setup.bootstrapAccountId) {
                    const [reserved] = await tx
                        .update(serverSetupState)
                        .set({
                            bootstrapAccountId: accountId,
                            updatedAt: new Date().toISOString(),
                        })
                        .where(
                            and(
                                eq(serverSetupState.id, 1),
                                isNull(serverSetupState.bootstrapAccountId),
                            ),
                        )
                        .returning({ id: serverSetupState.id });
                    if (!reserved) throw new RegistrationClosedError();
                }
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
                        role: options.provisioned && !existingProvisionedUser ? "admin" : "member",
                    })
                    .returning();
                if (!user) throw new Error("Could not create user profile");
                let bootstrapClaimed = false;
                if (!options.provisioned && !setupComplete && !setup.bootstrapAdminUserId) {
                    const [claim] = await tx
                        .update(serverSetupState)
                        .set({
                            bootstrapAdminUserId: id,
                            updatedAt: new Date().toISOString(),
                        })
                        .where(
                            and(
                                eq(serverSetupState.id, 1),
                                eq(serverSetupState.bootstrapAccountId, accountId),
                                isNull(serverSetupState.bootstrapAdminUserId),
                            ),
                        )
                        .returning({ id: serverSetupState.id });
                    bootstrapClaimed = Boolean(claim);
                    if (!bootstrapClaimed) throw new RegistrationClosedError();
                    await tx.update(users).set({ role: "admin" }).where(eq(users.id, id));
                    const now = new Date().toISOString();
                    await tx
                        .update(serverSetupSteps)
                        .set({
                            state: "complete",
                            metadataJson: JSON.stringify({ source: "profile_claim" }),
                            startedAt: now,
                            completedAt: now,
                            updatedAt: now,
                        })
                        .where(eq(serverSetupSteps.step, "bootstrap_administrator"));
                }
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
                await tx.insert(userOnboardingSteps).values([
                    { userId: id, step: "avatar", state: "pending" },
                    { userId: id, step: "desktop_notifications", state: "pending" },
                ]);
                const sequence = await nextSequence(tx);
                await tx.update(users).set({ syncSequence: sequence }).where(eq(users.id, id));
                await tx.insert(syncEvents).values([
                    {
                        sequence,
                        kind: "user.created",
                        entityId: id,
                        actorUserId: id,
                    },
                    ...(bootstrapClaimed
                        ? [
                              {
                                  sequence,
                                  kind: "setup.bootstrap_administrator.complete",
                                  entityId: "bootstrap_administrator",
                                  actorUserId: id,
                              },
                          ]
                        : []),
                ]);
                const happyUserId = await this.joinUserToAutoJoinChannels(
                    tx,
                    {
                        id,
                        username: profile.username,
                    },
                    sequence,
                );
                await this.announceUserJoinedServer(
                    tx,
                    { id, username: profile.username },
                    happyUserId,
                    sequence,
                );
                return asUser({
                    ...user,
                    role:
                        bootstrapClaimed || (options.provisioned && !existingProvisionedUser)
                            ? "admin"
                            : "member",
                    syncSequence: sequence,
                });
            }),
        );
    }

    private async ensureChannelDefaults(executor: DrizzleExecutor): Promise<void> {
        let [serviceImage] = await executor
            .select({ id: agentImages.id })
            .from(agentImages)
            .where(eq(agentImages.systemOnly, 1))
            .limit(1);
        if (!serviceImage) {
            const id = createId();
            await executor.insert(agentImages).values({
                id,
                name: "Happy service agent",
                dockerfile: "# Happy (2) internal service agent; not an executable image.\n",
                definitionHash: "happy2:system-service-agent:v1",
                dockerTag: "happy2/system-service-agent:v1",
                status: "pending",
                systemOnly: 1,
            });
            serviceImage = { id };
        }

        let [happy] = await executor
            .select({ id: users.id })
            .from(users)
            .where(and(eq(users.systemRole, "service"), isNull(users.deletedAt)))
            .limit(1);
        if (!happy) {
            const conflicts = await executor
                .select({ id: users.id, deletedAt: users.deletedAt })
                .from(users)
                .where(sql`lower(${users.username}) = 'happy'`);
            for (const conflict of conflicts) {
                let username: string;
                let occupied: { id: string } | undefined;
                do {
                    username = `former-happy-${createId().slice(0, 10)}`;
                    [occupied] = await executor
                        .select({ id: users.id })
                        .from(users)
                        .where(sql`lower(${users.username}) = lower(${username})`)
                        .limit(1);
                } while (occupied);
                const sequence = await nextSequence(executor);
                await executor
                    .update(users)
                    .set({ username, syncSequence: sequence })
                    .where(eq(users.id, conflict.id));
                if (!conflict.deletedAt)
                    await executor.insert(syncEvents).values({
                        sequence,
                        kind: "user.updated",
                        entityId: conflict.id,
                        actorUserId: conflict.id,
                    });
            }
            const id = createId();
            const sequence = await nextSequence(executor);
            await executor.insert(users).values({
                id,
                accountId: null,
                kind: "agent",
                agentImageId: serviceImage.id,
                firstName: "Happy",
                username: "happy",
                role: "member",
                systemRole: "service",
                syncSequence: sequence,
            });
            await executor.insert(syncEvents).values({
                sequence,
                kind: "user.created",
                entityId: id,
                actorUserId: id,
            });
            happy = { id };
        }

        let [main] = await executor
            .select({ id: chats.id })
            .from(chats)
            .where(and(eq(chats.isMain, 1), isNull(chats.deletedAt)))
            .limit(1);
        if (!main) {
            const [welcome] = await executor
                .select({ id: chats.id })
                .from(chats)
                .where(and(eq(chats.slug, "welcome"), isNull(chats.deletedAt)))
                .limit(1);
            const sequence = await nextSequence(executor);
            if (welcome) {
                await executor
                    .update(chats)
                    .set({
                        kind: "public_channel",
                        visibility: "public",
                        isListed: 1,
                        archivedAt: null,
                        isMain: 1,
                        autoJoin: 1,
                        lastChangeSequence: sequence,
                        updatedAt: sql`CURRENT_TIMESTAMP`,
                    })
                    .where(eq(chats.id, welcome.id));
                await advanceChannel(executor, {
                    sequence,
                    chatId: welcome.id,
                    kind: "chat.mainAssigned",
                    entityId: welcome.id,
                    actorUserId: happy.id,
                });
                main = { id: welcome.id };
            } else {
                const id = createId();
                await executor.insert(chats).values({
                    id,
                    kind: "public_channel",
                    name: "Welcome",
                    slug: "welcome",
                    createdByUserId: happy.id,
                    ownerUserId: happy.id,
                    visibility: "public",
                    isListed: 1,
                    isMain: 1,
                    autoJoin: 1,
                    pts: 1,
                    lastChangeSequence: sequence,
                });
                await executor.insert(chatMembers).values({
                    chatId: id,
                    userId: happy.id,
                    role: "owner",
                    membershipEpoch: createId(),
                    syncSequence: sequence,
                });
                await insertChannelUpdate(executor, {
                    sequence,
                    pts: 1,
                    chatId: id,
                    kind: "chat.created",
                    entityId: id,
                    actorUserId: happy.id,
                });
                main = { id };
            }
        } else {
            await executor.update(chats).set({ autoJoin: 1 }).where(eq(chats.id, main.id));
        }

        const channels = await executor
            .select({ id: chats.id })
            .from(chats)
            .where(and(ne(chats.kind, "dm"), isNull(chats.deletedAt)));
        for (const channel of channels) {
            const [membership] = await executor
                .select({ leftAt: chatMembers.leftAt })
                .from(chatMembers)
                .where(and(eq(chatMembers.chatId, channel.id), eq(chatMembers.userId, happy.id)))
                .limit(1);
            if (membership?.leftAt === null) continue;
            const sequence = await nextSequence(executor);
            await advanceChannel(executor, {
                sequence,
                chatId: channel.id,
                kind: "member.systemJoined",
                entityId: happy.id,
                actorUserId: happy.id,
            });
            await executor
                .insert(chatMembers)
                .values({
                    chatId: channel.id,
                    userId: happy.id,
                    role: channel.id === main.id ? "owner" : "member",
                    membershipEpoch: createId(),
                    syncSequence: sequence,
                })
                .onConflictDoUpdate({
                    target: [chatMembers.chatId, chatMembers.userId],
                    set: {
                        membershipEpoch: sql`excluded.membership_epoch`,
                        syncSequence: sequence,
                        joinedAt: sql`CURRENT_TIMESTAMP`,
                        updatedAt: sql`CURRENT_TIMESTAMP`,
                        leftAt: null,
                    },
                });
        }

        const activeUsers = await executor
            .select({
                id: users.id,
                username: users.username,
            })
            .from(users)
            .innerJoin(accounts, eq(accounts.id, users.accountId))
            .where(
                and(
                    eq(users.kind, "human"),
                    isNull(users.deletedAt),
                    eq(accounts.active, 1),
                    isNull(accounts.bannedAt),
                    isNull(accounts.deletedAt),
                ),
            );
        for (const user of activeUsers)
            await this.joinUserToAutoJoinChannels(executor, user, undefined, main.id);
    }

    private async joinUserToAutoJoinChannels(
        executor: DrizzleExecutor,
        user: { id: string; username: string },
        sequence?: number,
        onlyChatId?: string,
    ): Promise<string> {
        const [happy] = await executor
            .select({ id: users.id })
            .from(users)
            .where(and(eq(users.systemRole, "service"), isNull(users.deletedAt)))
            .limit(1);
        if (!happy) throw new Error("Happy service agent is not initialized");
        const channels = await executor
            .select({ id: chats.id, name: chats.name, slug: chats.slug })
            .from(chats)
            .where(
                and(
                    ...(onlyChatId ? [eq(chats.id, onlyChatId)] : []),
                    eq(chats.autoJoin, 1),
                    ne(chats.kind, "dm"),
                    isNull(chats.deletedAt),
                    isNull(chats.archivedAt),
                ),
            );
        for (const channel of channels) {
            const [membership] = await executor
                .select({ leftAt: chatMembers.leftAt })
                .from(chatMembers)
                .where(and(eq(chatMembers.chatId, channel.id), eq(chatMembers.userId, user.id)))
                .limit(1);
            if (membership?.leftAt === null) continue;
            sequence ??= await nextSequence(executor);
            const membershipEpoch = createId();
            await executor
                .insert(chatMembers)
                .values({
                    chatId: channel.id,
                    userId: user.id,
                    role: "member",
                    membershipEpoch,
                    syncSequence: sequence,
                })
                .onConflictDoUpdate({
                    target: [chatMembers.chatId, chatMembers.userId],
                    set: {
                        role: "member",
                        membershipEpoch,
                        syncSequence: sequence,
                        joinedAt: sql`CURRENT_TIMESTAMP`,
                        updatedAt: sql`CURRENT_TIMESTAMP`,
                        leftAt: null,
                    },
                });
            await advanceChannel(executor, {
                sequence,
                chatId: channel.id,
                kind: "member.autoJoined",
                entityId: user.id,
                actorUserId: happy.id,
                targetUserId: user.id,
            });
            const messageId = createId();
            const messageMutation = await advanceChannel(executor, {
                sequence,
                chatId: channel.id,
                kind: "message.serviceCreated",
                entityId: messageId,
                actorUserId: happy.id,
                incrementMessageSequence: true,
            });
            await executor.insert(messages).values({
                id: messageId,
                chatId: channel.id,
                sequence: messageMutation.messageSequence!,
                changePts: messageMutation.pts,
                senderUserId: happy.id,
                kind: "automated",
                text: `@${user.username} joined #${channel.slug ?? channel.name ?? "channel"}`,
                contentJson: JSON.stringify({
                    service: { type: "user_added", userId: user.id },
                }),
                publishedAt: sql`CURRENT_TIMESTAMP`,
            });
        }
        return happy.id;
    }

    private async announceUserJoinedServer(
        executor: DrizzleExecutor,
        user: { id: string; username: string },
        happyUserId: string,
        sequence: number,
    ): Promise<void> {
        const [main] = await executor
            .select({ id: chats.id })
            .from(chats)
            .where(and(eq(chats.isMain, 1), isNull(chats.deletedAt), isNull(chats.archivedAt)))
            .limit(1);
        if (!main) throw new Error("Main channel is not initialized");
        const messageId = createId();
        const mutation = await advanceChannel(executor, {
            sequence,
            chatId: main.id,
            kind: "message.serviceCreated",
            entityId: messageId,
            actorUserId: happyUserId,
            incrementMessageSequence: true,
        });
        await executor.insert(messages).values({
            id: messageId,
            chatId: main.id,
            sequence: mutation.messageSequence!,
            changePts: mutation.pts,
            senderUserId: happyUserId,
            kind: "automated",
            text: `@${user.username} joined the server`,
            contentJson: JSON.stringify({
                service: { type: "user_joined", userId: user.id },
            }),
            publishedAt: sql`CURRENT_TIMESTAMP`,
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

    async createMagicLink(email: string, rawToken: string): Promise<boolean> {
        try {
            await retrySqliteBusy(() =>
                this.db.transaction(async (tx) => {
                    const [account] = await tx
                        .select({ id: accounts.id })
                        .from(accounts)
                        .where(eq(accounts.email, email));
                    if (!account) await requireNewRegistrationRequestAllowedDb(tx);
                    await tx.insert(authMagicLinks).values({
                        tokenHash: tokenHash(rawToken),
                        email,
                        expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
                    });
                }),
            );
            return true;
        } catch (error) {
            if (error instanceof RegistrationClosedError) return false;
            throw error;
        }
    }

    async consumeMagicLink(rawToken: string): Promise<Account | undefined> {
        try {
            return await retrySqliteBusy(() =>
                this.db.transaction(async (tx) => {
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
                        .returning({ email: authMagicLinks.email });
                    if (!link) return undefined;
                    let [account] = await tx
                        .select()
                        .from(accounts)
                        .where(eq(accounts.email, link.email));
                    if (!account) {
                        [account] = await tx
                            .insert(accounts)
                            .values({ id: createId(), email: link.email })
                            .returning();
                        if (!account) throw new Error("Could not create magic-link account");
                        await authorizeNewRegistrationDb(tx, account.id);
                    }
                    return asAccount(account);
                }),
            );
        } catch (error) {
            if (error instanceof RegistrationClosedError) return undefined;
            throw error;
        }
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

async function advanceChannel(
    executor: DrizzleExecutor,
    input: {
        sequence: number;
        chatId: string;
        kind: string;
        entityId?: string;
        actorUserId?: string;
        targetUserId?: string;
        incrementMessageSequence?: boolean;
    },
): Promise<{ pts: number; messageSequence?: number }> {
    const [row] = await executor
        .update(chats)
        .set({
            pts: sql`${chats.pts} + 1`,
            lastMessageSequence: sql`${chats.lastMessageSequence} + ${input.incrementMessageSequence ? 1 : 0}`,
            lastChangeSequence: input.sequence,
            updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(and(eq(chats.id, input.chatId), isNull(chats.deletedAt)))
        .returning({ pts: chats.pts, lastMessageSequence: chats.lastMessageSequence });
    if (!row) throw new Error("Channel no longer exists");
    await insertChannelUpdate(executor, {
        ...input,
        pts: row.pts,
    });
    return {
        pts: row.pts,
        ...(input.incrementMessageSequence ? { messageSequence: row.lastMessageSequence } : {}),
    };
}

async function insertChannelUpdate(
    executor: DrizzleExecutor,
    input: {
        sequence: number;
        pts: number;
        chatId: string;
        kind: string;
        entityId?: string;
        actorUserId?: string;
        targetUserId?: string;
    },
): Promise<void> {
    await executor.insert(chatUpdates).values({
        chatId: input.chatId,
        pts: input.pts,
        kind: input.kind,
        entityId: input.entityId,
    });
    await executor.insert(syncEvents).values({
        sequence: input.sequence,
        kind: input.kind,
        chatId: input.chatId,
        chatPts: input.pts,
        entityId: input.entityId,
        actorUserId: input.actorUserId,
    });
    if (input.targetUserId)
        await executor.insert(syncEvents).values({
            sequence: input.sequence,
            kind: input.kind,
            chatId: input.chatId,
            chatPts: input.pts,
            entityId: input.entityId,
            actorUserId: input.actorUserId,
            targetUserId: input.targetUserId,
        });
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

/** Atomically claims the bootstrap slot, or enforces the final open-registration policy. */
async function authorizeNewRegistrationDb(
    executor: DrizzleExecutor,
    accountId: string,
): Promise<void> {
    const [setup] = await executor
        .select({
            bootstrapAccountId: serverSetupState.bootstrapAccountId,
            registrationEnabled: serverSetupState.registrationEnabled,
        })
        .from(serverSetupState)
        .where(eq(serverSetupState.id, 1));
    const [completion] = await executor
        .select({ state: serverSetupSteps.state })
        .from(serverSetupSteps)
        .where(eq(serverSetupSteps.step, "server_setup_complete"));
    if (!setup || !completion) throw new Error("Server setup state is not initialized");
    if (completion.state === "complete") {
        if (setup.registrationEnabled !== 1) throw new RegistrationClosedError();
        return;
    }
    if (setup.bootstrapAccountId) throw new RegistrationClosedError();
    const [reserved] = await executor
        .update(serverSetupState)
        .set({ bootstrapAccountId: accountId, updatedAt: new Date().toISOString() })
        .where(and(eq(serverSetupState.id, 1), isNull(serverSetupState.bootstrapAccountId)))
        .returning({ id: serverSetupState.id });
    if (!reserved) throw new RegistrationClosedError();
}

/** Checks whether a registration may start without reserving the bootstrap slot. */
async function requireNewRegistrationRequestAllowedDb(executor: DrizzleExecutor): Promise<void> {
    const [setup] = await executor
        .select({
            bootstrapAccountId: serverSetupState.bootstrapAccountId,
            registrationEnabled: serverSetupState.registrationEnabled,
        })
        .from(serverSetupState)
        .where(eq(serverSetupState.id, 1));
    const [completion] = await executor
        .select({ state: serverSetupSteps.state })
        .from(serverSetupSteps)
        .where(eq(serverSetupSteps.step, "server_setup_complete"));
    if (!setup || !completion) throw new Error("Server setup state is not initialized");
    const allowed =
        completion.state === "complete"
            ? setup.registrationEnabled === 1
            : setup.bootstrapAccountId === null;
    if (!allowed) throw new RegistrationClosedError();
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
        systemRole: row.systemRole === "service" ? "service" : undefined,
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
