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
    CollaborationRepository,
    Database,
    defaultConfig,
    FileStorage,
    IntegrationRepository,
    TokenService,
    type FileStorageFileSystem,
    type ServerConfig,
    type User,
} from "@slopus/rigged";
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
    as(user: GymUser): GymRequestClient;
    /** Binds this same in-process server to an ephemeral loopback port for streaming tests. */
    listen(): Promise<string>;
    /** Rebuilds every process-local service while preserving durable database and file state. */
    restart(): Promise<void>;
    close(): Promise<void>;
}

export interface GymServerOptions {
    configure?: (config: ServerConfig) => void;
    /** Uses libSQL's real multi-connection file adapter instead of serialized `:memory:` access. */
    databaseMode?: "file" | "memory";
}

/**
 * Creates a complete Rigged server backed only by memory. The returned object is
 * anonymous by default; call `as(user)` to make authenticated requests.
 */
export async function createGymServer(options: GymServerOptions = {}): Promise<GymServer> {
    const databaseDirectory =
        options.databaseMode === "file"
            ? await mkdtemp(join(tmpdir(), "rigged-gym-database-"))
            : undefined;
    const databaseUrl = databaseDirectory
        ? `file:${join(databaseDirectory, "rigged.db")}`
        : ":memory:";
    const rawClient = createClient({ url: databaseUrl });
    const client = databaseDirectory ? rawClient : singleConnectionClient(rawClient);
    const fileSystem = new MemoryFileSystem();
    const config = gymConfig(databaseUrl);
    options.configure?.(config);
    const database = new Database(client);
    const tokenKeys = generateKeys();
    const integrationProtector = new AesGcmSecretProtector(randomBytes(32));
    let app: FastifyInstance | undefined;
    let integrations: IntegrationRepository | undefined;

    try {
        await database.migrate();
        const tokens = await TokenService.create(config, tokenKeys);
        const collaboration = new CollaborationRepository(client);
        integrations = new IntegrationRepository(client, {
            secretProtector: integrationProtector,
        });
        app = await buildServer(config, {
            database,
            tokens,
            collaboration,
            integrations,
            fileStorage: new FileStorage(config, database, fileSystem),
            logger: false,
        });
        return new GymServerInstance(
            app,
            config,
            database,
            tokens,
            client,
            fileSystem,
            tokenKeys,
            integrationProtector,
            integrations,
            async () => {
                if (databaseDirectory)
                    await rm(databaseDirectory, { force: true, recursive: true });
            },
        );
    } catch (error) {
        await app?.close();
        integrations?.close();
        database.close();
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
        private readonly database: Database,
        private tokens: TokenService,
        private readonly client: Client,
        private readonly fileSystem: MemoryFileSystem,
        private readonly tokenKeys: { privateKey: string; publicKey: string },
        private readonly integrationProtector: AesGcmSecretProtector,
        private integrations: IntegrationRepository,
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
        const account = await this.database.createPasswordAccount(email, "gym-server-disabled");
        const user = await this.database.createProfile(account.id, {
            firstName: input.firstName ?? `User ${sequence}`,
            lastName: input.lastName,
            username: input.username ?? `gym_user_${sequence}`,
            email,
            phone: input.phone,
        });
        const session = await this.database.createSession(
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

    as(user: GymUser): GymRequestClient {
        this.assertOpen();
        return new AuthenticatedClient(this, user.token);
    }

    async listen(): Promise<string> {
        this.assertOpen();
        return this.app.listen({ host: "127.0.0.1", port: 0 });
    }

    async restart(): Promise<void> {
        this.assertOpen();
        await this.app.close();
        this.integrations.close();
        this.tokens = await TokenService.create(this.config, this.tokenKeys);
        const collaboration = new CollaborationRepository(this.client);
        this.integrations = new IntegrationRepository(this.client, {
            secretProtector: this.integrationProtector,
        });
        this.app = await buildServer(this.config, {
            database: this.database,
            tokens: this.tokens,
            collaboration,
            integrations: this.integrations,
            fileStorage: new FileStorage(this.config, this.database, this.fileSystem),
            logger: false,
        });
    }

    async close(): Promise<void> {
        if (this.closed) return;
        this.closed = true;
        try {
            await this.app.close();
        } finally {
            this.integrations.close();
            this.database.close();
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
    config.auth.password.signupEnabled = false;
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
