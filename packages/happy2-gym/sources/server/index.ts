import { generateKeyPairSync, randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Writable } from "node:stream";
import {
    createClient,
    type Client,
    type InArgs,
    type InStatement,
    type ResultSet,
    type Replicated,
    type Transaction,
    type TransactionMode,
} from "@libsql/client";
import {
    buildServer,
    AesGcmSecretProtector,
    accountCreatePassword,
    createDatabase,
    defaultConfig,
    FileStorage,
    setupChooseRegistrationPolicy,
    setupRecordOperationalStep,
    setupSandboxProviderSelect,
    serverSchemaMigrate,
    sessionCreate,
    syncInitialize,
    TokenService,
    userOnboardingUpdateStep,
    userCreateProfile,
    type FileStorageFileSystem,
    type DrizzleExecutor,
    type AgentSandboxRuntime,
    type SandboxProvider,
    type ServerConfig,
    type User,
} from "happy2-server";
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from "fastify";

export interface GymUser extends User {
    accountId: string;
    token: string;
}

export interface CreateGymUser {
    email?: string;
    firstName?: string;
    lastName?: string;
    username?: string;
    phone?: string;
}

export interface GymRequestClient {
    request(options: InjectOptions): Promise<LightMyRequestResponse>;
    get(
        url: string,
        options?: Omit<InjectOptions, "method" | "url">,
    ): Promise<LightMyRequestResponse>;
    post(
        url: string,
        payload?: InjectOptions["payload"],
        options?: Omit<InjectOptions, "method" | "url" | "payload">,
    ): Promise<LightMyRequestResponse>;
}

export interface GymServer extends GymRequestClient, AsyncDisposable {
    readonly config: ServerConfig;
    createUser(input?: CreateGymUser): Promise<GymUser>;
    /** Simulates successful server-owned provider/image work for unrelated workflows. */
    completeSetup(input: { actorUserId: string; registrationEnabled: boolean }): Promise<void>;
    as(user: GymUser): GymRequestClient;
    /** Binds this same in-process server to an ephemeral loopback port for streaming tests. */
    listen(): Promise<string>;
    /** Rebuilds every process-local service while preserving durable state; `beforeStart` can model crash residue after shutdown. */
    restart(options?: { beforeStart?: () => Promise<void> }): Promise<void>;
    close(): Promise<void>;
}

export interface GymServerOptions {
    agentSandbox?: AgentSandboxRuntime;
    sandboxProviders?: readonly SandboxProvider[];
    configure?: (config: ServerConfig) => void;
    /** Reuses an explicit database URL so tests can run independent server instances together. */
    databaseUrl?: string;
    /** Uses libSQL's real multi-connection file adapter instead of serialized `:memory:` access. */
    databaseMode?: "file" | "memory";
}

/**
 * Creates a complete Happy (2) server backed only by memory. The returned object is
 * anonymous by default; call `as(user)` to make authenticated requests.
 */
export async function createGymServer(options: GymServerOptions = {}): Promise<GymServer> {
    const databaseDirectory =
        !options.databaseUrl && options.databaseMode === "file"
            ? await mkdtemp(join(tmpdir(), "happy2-gym-database-"))
            : undefined;
    const databaseUrl =
        options.databaseUrl ??
        (databaseDirectory ? `file:${join(databaseDirectory, "happy2.db")}` : ":memory:");
    const rawClient = createClient({ url: databaseUrl });
    const client = databaseUrl === ":memory:" ? singleConnectionClient(rawClient) : rawClient;
    const fileSystem = new MemoryFileSystem();
    const config = gymConfig(databaseUrl);
    options.configure?.(config);
    const executor = createDatabase(client);
    const tokenKeys = generateKeys();
    const integrationProtector = new AesGcmSecretProtector(randomBytes(32));
    let app: FastifyInstance | undefined;

    try {
        await serverSchemaMigrate(client);
        const tokens = await TokenService.create(config, tokenKeys);
        await syncInitialize(executor);
        app = await buildServer(config, {
            client,
            tokens,
            integrationSecretProtector: integrationProtector,
            fileStorage: new FileStorage(config, executor, fileSystem),
            agentSandbox: options.agentSandbox,
            sandboxProviders: options.sandboxProviders,
            logger: false,
        });
        return new GymServerInstance(
            app,
            config,
            executor,
            tokens,
            client,
            fileSystem,
            tokenKeys,
            integrationProtector,
            options.agentSandbox,
            options.sandboxProviders,
            async () => {
                if (databaseDirectory)
                    await rm(databaseDirectory, { force: true, recursive: true });
            },
        );
    } catch (error) {
        await app?.close();
        client.close();
        fileSystem.reset();
        if (databaseDirectory) await rm(databaseDirectory, { force: true, recursive: true });
        throw error;
    }
}

/** Runs a callback with a fresh server and always destroys it afterwards. */
export async function withGymServer<T>(run: (server: GymServer) => Promise<T>): Promise<T> {
    const server = await createGymServer();
    try {
        return await run(server);
    } finally {
        await server.close();
    }
}

class GymServerInstance implements GymServer {
    private closed = false;
    private userSequence = 0;

    constructor(
        private app: FastifyInstance,
        readonly config: ServerConfig,
        private readonly executor: ReturnType<typeof createDatabase>,
        private tokens: TokenService,
        private readonly client: Client,
        private readonly fileSystem: MemoryFileSystem,
        private readonly tokenKeys: { privateKey: string; publicKey: string },
        private readonly integrationProtector: AesGcmSecretProtector,
        private readonly agentSandbox: AgentSandboxRuntime | undefined,
        private readonly sandboxProviders: readonly SandboxProvider[] | undefined,
        private readonly cleanupDatabase: () => Promise<void>,
    ) {}

    request(options: InjectOptions): Promise<LightMyRequestResponse> {
        this.assertOpen();
        return this.app.inject(options);
    }

    get(
        url: string,
        options: Omit<InjectOptions, "method" | "url"> = {},
    ): Promise<LightMyRequestResponse> {
        return this.request({ ...options, method: "GET", url });
    }

    post(
        url: string,
        payload?: InjectOptions["payload"],
        options: Omit<InjectOptions, "method" | "url" | "payload"> = {},
    ): Promise<LightMyRequestResponse> {
        return this.request({ ...options, method: "POST", url, payload });
    }

    async createUser(input: CreateGymUser = {}): Promise<GymUser> {
        this.assertOpen();
        const sequence = ++this.userSequence;
        const email = input.email ?? `user-${sequence}@gym.invalid`;
        const account = await accountCreatePassword(this.executor, email, "gym-server-disabled");
        const user = await userCreateProfile(
            this.executor,
            account.id,
            {
                firstName: input.firstName ?? `User ${sequence}`,
                lastName: input.lastName,
                username: input.username ?? `gym_user_${sequence}`,
                email,
                phone: input.phone,
            },
            sequence === 1 ? {} : { provisioned: true },
        );
        if (sequence === 1) {
            const providerId = this.sandboxProviders?.[0]?.id ?? "docker";
            await setupSandboxProviderSelect(this.executor, user.id, {
                id: providerId,
                version: `${providerId} gym runtime`,
            });
            await this.completeSetupImageFixture(this.executor, user.id, true);
        }
        await userOnboardingUpdateStep(this.executor, {
            userId: user.id,
            step: "avatar",
            state: "skipped",
        });
        await userOnboardingUpdateStep(this.executor, {
            userId: user.id,
            step: "desktop_notifications",
            state: "skipped",
        });
        const session = await sessionCreate(
            this.executor,
            account.id,
            new Date(Date.now() + this.config.jwt.expiryDays * 86_400_000),
            {},
        );
        return {
            ...user,
            accountId: account.id,
            token: await this.tokens.issue(session.id, account.id),
        };
    }

    async completeSetup(input: {
        actorUserId: string;
        registrationEnabled: boolean;
    }): Promise<void> {
        this.assertOpen();
        const executor = createDatabase(this.client);
        const providerId = this.sandboxProviders?.[0]?.id ?? "docker";
        await setupSandboxProviderSelect(executor, input.actorUserId, {
            id: providerId,
            version: `${providerId} gym runtime`,
        });
        await this.completeSetupImageFixture(
            executor,
            input.actorUserId,
            input.registrationEnabled,
        );
    }

    as(user: GymUser): GymRequestClient {
        this.assertOpen();
        return new AuthenticatedClient(this, user.token);
    }

    async listen(): Promise<string> {
        this.assertOpen();
        return this.app.listen({ host: "127.0.0.1", port: 0 });
    }

    private async completeSetupImageFixture(
        executor: DrizzleExecutor,
        actorUserId: string,
        registrationEnabled: boolean,
    ): Promise<void> {
        const imageId = "happy2-gym-setup-ready-image";
        await this.client.execute({
            sql: `INSERT OR IGNORE INTO agent_images
                (id, name, dockerfile, definition_hash, docker_tag, status, build_progress, docker_image_id, ready_at)
                VALUES (?, 'Gym setup image', 'FROM scratch', 'happy2-gym-setup-ready-hash', 'happy2-gym:setup-ready', 'ready', 100, 'sha256:happy2-gym-setup-ready', CURRENT_TIMESTAMP)`,
            args: [imageId],
        });
        await this.client.execute({
            sql: "UPDATE agent_image_settings SET default_image_id = ?, updated_by_user_id = ? WHERE id = 1",
            args: [imageId, actorUserId],
        });
        try {
            for (const step of [
                "base_image_selected",
                "base_image_build_requested",
                "base_image_ready",
            ] as const)
                await setupRecordOperationalStep(executor, {
                    step,
                    state: "complete",
                    actorUserId,
                    metadata: { imageId },
                });
            await setupChooseRegistrationPolicy(executor, actorUserId, registrationEnabled);
        } finally {
            await this.client.execute({
                sql: "UPDATE agent_image_settings SET default_image_id = NULL, updated_by_user_id = NULL WHERE default_image_id = ?",
                args: [imageId],
            });
            await this.client.execute({
                sql: "DELETE FROM agent_images WHERE id = ?",
                args: [imageId],
            });
        }
    }

    async restart(options: { beforeStart?: () => Promise<void> } = {}): Promise<void> {
        this.assertOpen();
        await this.app.close();
        await options.beforeStart?.();
        this.tokens = await TokenService.create(this.config, this.tokenKeys);
        await syncInitialize(createDatabase(this.client));
        this.app = await buildServer(this.config, {
            client: this.client,
            tokens: this.tokens,
            integrationSecretProtector: this.integrationProtector,
            fileStorage: new FileStorage(this.config, createDatabase(this.client), this.fileSystem),
            agentSandbox: this.agentSandbox,
            sandboxProviders: this.sandboxProviders,
            logger: false,
        });
    }

    async close(): Promise<void> {
        if (this.closed) return;
        this.closed = true;
        try {
            await this.app.close();
        } finally {
            this.client.close();
            this.fileSystem.reset();
            await this.cleanupDatabase();
        }
    }

    async [Symbol.asyncDispose](): Promise<void> {
        await this.close();
    }

    private assertOpen(): void {
        if (this.closed) throw new Error("Gym server is closed");
    }
}

class AuthenticatedClient implements GymRequestClient {
    constructor(
        private readonly server: GymRequestClient,
        private readonly token: string,
    ) {}

    request(options: InjectOptions): Promise<LightMyRequestResponse> {
        return this.server.request({
            ...options,
            headers: {
                ...options.headers,
                authorization: `Bearer ${this.token}`,
            },
        });
    }

    get(
        url: string,
        options: Omit<InjectOptions, "method" | "url"> = {},
    ): Promise<LightMyRequestResponse> {
        return this.request({ ...options, method: "GET", url });
    }

    post(
        url: string,
        payload?: InjectOptions["payload"],
        options: Omit<InjectOptions, "method" | "url" | "payload"> = {},
    ): Promise<LightMyRequestResponse> {
        return this.request({ ...options, method: "POST", url, payload });
    }
}

function gymConfig(databaseUrl: string): ServerConfig {
    const config = defaultConfig();
    config.database.url = databaseUrl;
    config.files.directory = "/files";
    config.server.publicUrl = "http://gym.invalid";
    config.jwt.issuer = "http://gym.invalid";
    config.jwt.keyId = "gym-server";
    config.auth.password.enabled = false;
    config.agents.enabled = false;
    return config;
}

function generateKeys(): { privateKey: string; publicKey: string } {
    const pair = generateKeyPairSync("rsa", {
        modulusLength: 2048,
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    return { privateKey: pair.privateKey, publicKey: pair.publicKey };
}

class MemoryFileSystem implements FileStorageFileSystem {
    private readonly files = new Map<string, Buffer>();

    async mkdir(): Promise<void> {}

    async readHeader(path: string, maximumBytes: number): Promise<Buffer> {
        return this.file(path).subarray(0, maximumBytes);
    }

    async imageSource(path: string): Promise<Buffer> {
        return Buffer.from(this.file(path));
    }

    async rename(from: string, to: string): Promise<void> {
        const contents = this.file(from);
        this.files.set(to, contents);
        this.files.delete(from);
    }

    async rm(path: string): Promise<void> {
        this.files.delete(path);
    }

    async writeFile(path: string, contents: Buffer): Promise<void> {
        this.files.set(path, Buffer.from(contents));
    }

    createReadStream(path: string, range?: { start: number; end: number }): Readable {
        const contents = this.file(path);
        return Readable.from([
            range ? contents.subarray(range.start, range.end + 1) : Buffer.from(contents),
        ]);
    }

    createWriteStream(path: string): Writable {
        const chunks: Buffer[] = [];
        return new Writable({
            write: (chunk: Buffer | string, encoding, callback) => {
                chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
                callback();
            },
            final: (callback) => {
                this.files.set(path, Buffer.concat(chunks));
                callback();
            },
        });
    }

    reset(): void {
        this.files.clear();
    }

    private file(path: string): Buffer {
        const contents = this.files.get(path);
        if (!contents) {
            const error = new Error(`No such file: ${path}`) as NodeJS.ErrnoException;
            error.code = "ENOENT";
            throw error;
        }
        return contents;
    }
}

/**
 * libSQL normally opens a second connection for interactive transactions. A
 * plain SQLite `:memory:` database is connection-local, so the harness keeps
 * transactions on its one private connection instead.
 */
function singleConnectionClient(client: Client): Client {
    return new SingleConnectionClient(client);
}

class SingleConnectionClient implements Client {
    private queue: Promise<void> = Promise.resolve();

    constructor(private readonly client: Client) {}

    get closed(): boolean {
        return this.client.closed;
    }

    get protocol(): string {
        return this.client.protocol;
    }

    execute(statement: InStatement): Promise<ResultSet>;
    execute(sql: string, args?: InArgs): Promise<ResultSet>;
    execute(statement: InStatement | string, args?: InArgs): Promise<ResultSet> {
        return this.exclusive(() =>
            typeof statement === "string"
                ? this.client.execute(statement, args)
                : this.client.execute(statement),
        );
    }

    batch(
        statements: Array<InStatement | [string, InArgs?]>,
        mode?: TransactionMode,
    ): Promise<ResultSet[]> {
        return this.exclusive(() => this.client.batch(statements, mode));
    }

    migrate(statements: InStatement[]): Promise<ResultSet[]> {
        return this.exclusive(() => this.client.migrate(statements));
    }

    async transaction(mode: TransactionMode = "write"): Promise<Transaction> {
        const release = await this.acquire();
        try {
            await this.client.execute(transactionStart(mode));
            return new SingleConnectionTransaction(this.client, release);
        } catch (error) {
            release();
            throw error;
        }
    }

    executeMultiple(sql: string): Promise<void> {
        return this.exclusive(() => this.client.executeMultiple(sql));
    }

    sync(): Promise<Replicated> {
        return this.exclusive(() => this.client.sync());
    }

    close(): void {
        this.client.close();
    }

    reconnect(): void {
        this.client.reconnect();
    }

    private async exclusive<T>(operation: () => Promise<T>): Promise<T> {
        const release = await this.acquire();
        try {
            return await operation();
        } finally {
            release();
        }
    }

    private async acquire(): Promise<() => void> {
        const previous = this.queue;
        let release!: () => void;
        this.queue = new Promise<void>((resolve) => {
            release = resolve;
        });
        await previous;
        return release;
    }
}

class SingleConnectionTransaction implements Transaction {
    closed = false;

    constructor(
        private readonly client: Client,
        private readonly release: () => void,
    ) {}

    execute(statement: InStatement): Promise<ResultSet>;
    execute(sql: string, args?: InArgs): Promise<ResultSet>;
    execute(statement: InStatement | string, args?: InArgs): Promise<ResultSet> {
        this.assertOpen();
        return typeof statement === "string"
            ? this.client.execute(statement, args)
            : this.client.execute(statement);
    }

    async batch(statements: InStatement[]): Promise<ResultSet[]> {
        const results: ResultSet[] = [];
        for (const statement of statements) results.push(await this.execute(statement));
        return results;
    }

    async executeMultiple(sql: string): Promise<void> {
        this.assertOpen();
        await this.client.executeMultiple(sql);
    }

    async rollback(): Promise<void> {
        this.assertOpen();
        try {
            await this.client.execute("ROLLBACK");
        } finally {
            this.finish();
        }
    }

    async commit(): Promise<void> {
        this.assertOpen();
        try {
            await this.client.execute("COMMIT");
        } finally {
            this.finish();
        }
    }

    close(): void {
        if (!this.closed) {
            this.closed = true;
            void this.client.execute("ROLLBACK").finally(this.release);
        }
    }

    private assertOpen(): void {
        if (this.closed) throw new Error("Transaction is closed");
    }

    private finish(): void {
        this.closed = true;
        this.release();
    }
}

function transactionStart(mode: TransactionMode): string {
    if (mode === "write") return "BEGIN IMMEDIATE";
    if (mode === "read") return "BEGIN";
    return `BEGIN ${mode.toUpperCase()}`;
}
