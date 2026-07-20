import type {
    AppInstanceContextUpdate,
    AppInstanceDefinition,
    AppInstanceDelete,
    ContributionDefinition,
    ContributionDelete,
    HappyCallContext,
    JsonObject,
    PluginAudience,
} from "../types.js";

const DEFAULT_ROUTES = {
    appDelete: "/apps/deleteInstance",
    appPut: "/apps/putInstance",
    appUpdateContext: "/apps/updateInstanceContext",
    contributionDelete: "/contributions/deleteContribution",
    contributionPut: "/contributions/putContribution",
} as const;

export interface HostClientRoutes {
    readonly appDelete: string;
    readonly appPut: string;
    readonly appUpdateContext: string;
    readonly contributionDelete: string;
    readonly contributionPut: string;
}

export interface HostClientOptions {
    readonly baseUrl: string;
    readonly fetch?: typeof globalThis.fetch;
    readonly routes?: Partial<HostClientRoutes>;
    readonly timeoutMs?: number;
    readonly token: string;
}

export interface HostClientEnvironment {
    readonly HAPPY2_PLUGIN_API_TOKEN?: string;
    readonly HAPPY2_PLUGIN_API_URL?: string;
}

/** An error response from Happy's capability-only plugin host API. */
export class HostApiError extends Error {
    constructor(
        readonly status: number,
        readonly body: string,
    ) {
        super(`Happy plugin host request failed with HTTP ${status}${body ? `: ${body}` : ""}`);
        this.name = "HostApiError";
    }
}

/** Typed client for durable Happy app instances and native contributions. */
export class HostClient {
    readonly #baseUrl: URL;
    readonly #fetch: typeof globalThis.fetch;
    readonly #routes: HostClientRoutes;
    readonly #timeoutMs: number;
    readonly #token: string;

    constructor(options: HostClientOptions) {
        this.#baseUrl = hostUrl(options.baseUrl);
        this.#token = required(options.token, "Host API token");
        this.#fetch = options.fetch ?? globalThis.fetch;
        this.#routes = { ...DEFAULT_ROUTES, ...options.routes };
        this.#timeoutMs = options.timeoutMs ?? 15_000;
        if (!Number.isSafeInteger(this.#timeoutMs) || this.#timeoutMs <= 0)
            throw new TypeError("Host API timeout must be a positive integer");
    }

    static fromEnvironment(
        environment: HostClientEnvironment = process.env,
        options: Omit<HostClientOptions, "baseUrl" | "token"> = {},
    ): HostClient {
        return new HostClient({
            ...options,
            baseUrl: required(environment.HAPPY2_PLUGIN_API_URL, "HAPPY2_PLUGIN_API_URL"),
            token: required(environment.HAPPY2_PLUGIN_API_TOKEN, "HAPPY2_PLUGIN_API_TOKEN"),
        });
    }

    putAppInstance(
        definition: AppInstanceDefinition,
        context: HappyCallContext = {},
    ): Promise<JsonObject> {
        return this.#post(
            this.#routes.appPut,
            bodyWithAudience(definition),
            actionContext(context, definition.audience),
            definition.audience.chatToken,
        );
    }

    updateAppInstanceContext(
        update: AppInstanceContextUpdate,
        context: HappyCallContext = {},
    ): Promise<JsonObject> {
        return this.#post(this.#routes.appUpdateContext, update, context);
    }

    deleteAppInstance(
        input: AppInstanceDelete,
        context: HappyCallContext = {},
    ): Promise<JsonObject> {
        return this.#post(this.#routes.appDelete, input, context);
    }

    putContribution(
        definition: ContributionDefinition,
        context: HappyCallContext = {},
    ): Promise<JsonObject> {
        return this.#post(
            this.#routes.contributionPut,
            bodyWithAudience(definition),
            actionContext(context, definition.audience),
            definition.audience.chatToken,
        );
    }

    deleteContribution(
        input: ContributionDelete,
        context: HappyCallContext = {},
    ): Promise<JsonObject> {
        return this.#post(this.#routes.contributionDelete, input, context);
    }

    async #post(
        path: string,
        body: object,
        context: HappyCallContext,
        chatToken?: string,
    ): Promise<JsonObject> {
        const timeout = AbortSignal.timeout(this.#timeoutMs);
        const response = await this.#fetch(new URL(route(path), this.#baseUrl), {
            body: JSON.stringify(body),
            headers: capabilityHeaders(this.#token, context, chatToken),
            method: "POST",
            signal: timeout,
        });
        if (!response.ok)
            throw new HostApiError(response.status, await boundedResponseText(response));
        if (response.status === 204) return {};
        const value: unknown = await response.json();
        if (!value || typeof value !== "object" || Array.isArray(value))
            throw new TypeError("Happy plugin host returned a non-object response");
        return value as JsonObject;
    }
}

function bodyWithAudience<T extends { readonly audience: PluginAudience }>(input: T): object {
    const { audience, ...body } = input;
    return { ...body, audience: { scope: audience.scope } };
}

function actionContext(context: HappyCallContext, audience: PluginAudience): HappyCallContext {
    if (audience.scope === "user" && !context.viewer)
        throw new TypeError("A user-scoped definition requires the current viewer capability");
    if (audience.chatToken && context.chat && audience.chatToken !== context.chat.token)
        throw new TypeError("Audience and current-call chat capabilities do not match");
    if (!audience.chatToken) {
        const { chat: _chat, ...unscoped } = context;
        return unscoped;
    }
    return context;
}

function capabilityHeaders(token: string, context: HappyCallContext, chatToken?: string): Headers {
    const headers = new Headers({
        accept: "application/json",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
    });
    if (context.viewer) headers.set("x-happy2-viewer-token", context.viewer.token);
    if (context.chat || chatToken)
        headers.set("x-happy2-chat-token", context.chat?.token ?? chatToken!);
    if (context.message) headers.set("x-happy2-message-token", context.message.token);
    return headers;
}

async function boundedResponseText(response: Response): Promise<string> {
    const text = await response.text();
    return text.slice(0, 2_048);
}

function hostUrl(value: string): URL {
    const url = new URL(required(value, "Host API URL"));
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash)
        throw new TypeError("Host API URL must be an HTTP(S) URL without credentials or fragment");
    if (!url.pathname.endsWith("/")) url.pathname += "/";
    return url;
}

function route(value: string): string {
    if (!value.startsWith("/") || value.startsWith("//"))
        throw new TypeError("Host API route must be root-relative");
    return value.slice(1);
}

function required(value: string | undefined, label: string): string {
    if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} is required`);
    return value;
}
