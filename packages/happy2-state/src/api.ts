import type { ClientTransport, HttpRequest, HttpResponse } from "./transport.js";
import type {
    ChatSummary,
    CreateAgentInput,
    CreateChannelInput,
    MessageSummary,
    SendMessageInput,
    SyncState,
} from "./types.js";

export interface DifferenceResponse {
    readonly kind: "empty" | "difference" | "slice" | "reset";
    readonly changedChats: readonly ChatSummary[];
    readonly removedChatIds: readonly string[];
    readonly areas: readonly string[];
    readonly state: SyncState;
    readonly targetState: SyncState;
}

export interface ChatDifferenceResponse {
    readonly kind: "empty" | "difference" | "slice" | "reset" | "tooLong";
    readonly updates: readonly {
        readonly pts: string;
        readonly ptsCount: 1;
        readonly kind: string;
        readonly entityId?: string;
    }[];
    readonly messages: readonly MessageSummary[];
    readonly chat: ChatSummary;
    readonly state: { readonly membershipEpoch: string; readonly pts: string };
    readonly targetState: { readonly membershipEpoch: string; readonly pts: string };
}

export class ApiResponseError extends Error {
    readonly code?: string;
    readonly retryAfterMs?: number;

    constructor(
        readonly response: HttpResponse<unknown>,
        message: string,
    ) {
        super(message);
        this.name = "ApiResponseError";
        const body = object(response.body);
        this.code = string(body?.error);
        const seconds = number(body?.retryAfterSeconds);
        this.retryAfterMs =
            seconds === undefined
                ? retryAfterMs(header(response.headers, "retry-after"))
                : Math.max(0, seconds * 1_000);
    }
}

function header(
    headers: Readonly<Record<string, string>> | undefined,
    name: string,
): string | undefined {
    return Object.entries(headers ?? {}).find(
        ([headerName]) => headerName.toLowerCase() === name,
    )?.[1];
}

function retryAfterMs(value: string | undefined): number | undefined {
    const seconds = number(value);
    if (seconds !== undefined) return Math.max(0, seconds * 1_000);
    const timestamp = value === undefined ? Number.NaN : Date.parse(value);
    return Number.isNaN(timestamp) ? undefined : Math.max(0, timestamp - Date.now());
}

export class Happy2Api {
    constructor(private readonly transport: ClientTransport) {}

    async state(): Promise<{ state: SyncState; serverTime: string }> {
        return this.get("/v0/sync/state");
    }

    async chats(): Promise<{ chats: readonly ChatSummary[] }> {
        return this.get("/v0/chats");
    }

    async messages(chatId: string): Promise<{
        messages: readonly MessageSummary[];
        chatPts: string;
        hasMore: boolean;
    }> {
        return this.get(`/v0/chats/${encodeURIComponent(chatId)}/messages?limit=100`);
    }

    async difference(state: SyncState): Promise<DifferenceResponse> {
        return this.post("/v0/sync/getDifference", { state, limit: 500 });
    }

    async chatDifference(
        chatId: string,
        state: { membershipEpoch: string; pts: string },
    ): Promise<ChatDifferenceResponse> {
        return this.post(`/v0/chats/${encodeURIComponent(chatId)}/getDifference`, {
            state,
            limit: 100,
        });
    }

    async createChannel(
        input: CreateChannelInput,
        idempotencyKey: string,
    ): Promise<{ chat: ChatSummary }> {
        return this.post("/v0/chats/createChannel", input, idempotencyKey);
    }

    async createAgent(
        input: CreateAgentInput,
        idempotencyKey: string,
    ): Promise<{ chat: ChatSummary }> {
        return this.post("/v0/chats/createAgent", input, idempotencyKey);
    }

    async createDirectMessage(
        userId: string,
        idempotencyKey: string,
    ): Promise<{ chat: ChatSummary }> {
        return this.post("/v0/chats/createDirectMessage", { userId }, idempotencyKey);
    }

    async joinChat(chatId: string, idempotencyKey: string): Promise<{ chat: ChatSummary }> {
        return this.post(`/v0/chats/${encodeURIComponent(chatId)}/join`, undefined, idempotencyKey);
    }

    async sendMessage(
        chatId: string,
        input: SendMessageInput,
        idempotencyKey: string,
    ): Promise<{ message: MessageSummary }> {
        return this.post(
            `/v0/chats/${encodeURIComponent(chatId)}/sendMessage`,
            input,
            idempotencyKey,
        );
    }

    async setTyping(chatId: string, active: boolean, idempotencyKey: string): Promise<void> {
        await this.post(
            `/v0/chats/${encodeURIComponent(chatId)}/setTyping`,
            { active },
            idempotencyKey,
        );
    }

    private async get<T>(path: string): Promise<T> {
        return this.request<T>({ method: "GET", path });
    }

    private async post<T>(path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
        return this.request<T>({
            method: "POST",
            path,
            body,
            headers: idempotencyKey ? { "idempotency-key": idempotencyKey } : undefined,
        });
    }

    private async request<T>(request: HttpRequest): Promise<T> {
        const response = await this.transport.request<T>(request);
        if (response.status < 200 || response.status >= 300) {
            const body = object(response.body);
            throw new ApiResponseError(
                response,
                string(body?.message) ?? string(body?.error) ?? "The server request failed.",
            );
        }
        return response.body;
    }
}

function object(value: unknown): Record<string, unknown> | undefined {
    return value !== null && typeof value === "object"
        ? (value as Record<string, unknown>)
        : undefined;
}

function string(value: unknown): string | undefined {
    return typeof value === "string" ? value : undefined;
}

function number(value: unknown): number | undefined {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value !== "" && Number.isFinite(Number(value)))
        return Number(value);
    return undefined;
}
