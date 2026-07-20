import { HostApiError, type HappyCallContext, type JsonObject } from "happy2-plugin-sdk/server";

const READ_TIMEOUT_MS = 15_000;
const WRITE_TIMEOUT_MS = 330_000;

export interface AttachedDocument {
    readonly id: string;
    readonly title: string;
    readonly updatedAt: string;
    readonly latestSequence: string;
}

export interface DocumentSnapshotResponse {
    readonly document: AttachedDocument;
    readonly snapshot: {
        readonly sequence: string;
        readonly update: string;
    };
}

export type DocumentWriteOutcome =
    | {
          readonly status: "approved";
          readonly requestId: string;
          readonly documentId: string;
          readonly acceptedSequence: string;
      }
    | {
          readonly status: "denied" | "failed";
          readonly requestId: string;
          readonly documentId: string;
          readonly message: string;
      };

export interface DocumentWriteInput {
    readonly documentId: string;
    readonly baseSequence: string;
    readonly clientUpdateId: string;
    readonly updates: readonly string[];
}

export interface DocumentCreateInput {
    readonly title: string;
    readonly initialUpdate?: string;
}

export interface DocumentsHost {
    documentList(
        context: HappyCallContext,
        signal?: AbortSignal,
    ): Promise<readonly AttachedDocument[]>;
    documentRead(
        documentId: string,
        context: HappyCallContext,
        signal?: AbortSignal,
    ): Promise<DocumentSnapshotResponse>;
    documentCreate(
        input: DocumentCreateInput,
        context: HappyCallContext,
        signal?: AbortSignal,
    ): Promise<AttachedDocument>;
    documentWrite(
        input: DocumentWriteInput,
        context: HappyCallContext,
        signal?: AbortSignal,
    ): Promise<DocumentWriteOutcome>;
}

interface DocumentsHostEnvironment {
    readonly HAPPY2_PLUGIN_API_TOKEN?: string;
    readonly HAPPY2_PLUGIN_API_URL?: string;
}

/** Capability-scoped HTTP client for the current chat's document host API. */
export class DocumentsHostClient implements DocumentsHost {
    readonly #baseUrl: URL;
    readonly #fetch: typeof globalThis.fetch;
    readonly #token: string;

    constructor(options: { baseUrl: string; token: string; fetch?: typeof globalThis.fetch }) {
        this.#baseUrl = hostUrl(options.baseUrl);
        this.#token = required(options.token, "Host API token");
        this.#fetch = options.fetch ?? globalThis.fetch;
    }

    static fromEnvironment(
        environment: DocumentsHostEnvironment = process.env,
        options: { fetch?: typeof globalThis.fetch } = {},
    ): DocumentsHostClient {
        return new DocumentsHostClient({
            ...options,
            baseUrl: required(environment.HAPPY2_PLUGIN_API_URL, "HAPPY2_PLUGIN_API_URL"),
            token: required(environment.HAPPY2_PLUGIN_API_TOKEN, "HAPPY2_PLUGIN_API_TOKEN"),
        });
    }

    async documentList(
        context: HappyCallContext,
        signal?: AbortSignal,
    ): Promise<readonly AttachedDocument[]> {
        const result = await this.#request("GET", "/documents", context, undefined, signal);
        const documents = array(result.documents, "documents");
        return documents.map((value, index) => attachedDocument(value, `documents[${index}]`));
    }

    async documentRead(
        documentId: string,
        context: HappyCallContext,
        signal?: AbortSignal,
    ): Promise<DocumentSnapshotResponse> {
        const result = await this.#request(
            "GET",
            `/documents/${encodeURIComponent(identifier(documentId, "documentId"))}`,
            context,
            undefined,
            signal,
        );
        const snapshot = object(result.snapshot, "snapshot");
        return {
            document: attachedDocument(result.document, "document"),
            snapshot: {
                sequence: sequence(snapshot.sequence, "snapshot.sequence"),
                update: string(snapshot.update, "snapshot.update"),
            },
        };
    }

    async documentCreate(
        input: DocumentCreateInput,
        context: HappyCallContext,
        signal?: AbortSignal,
    ): Promise<AttachedDocument> {
        const result = await this.#request(
            "POST",
            "/documents/create",
            context,
            {
                title: input.title,
                ...(input.initialUpdate ? { initialUpdate: input.initialUpdate } : {}),
            },
            signal,
        );
        return attachedDocument(result.document, "document");
    }

    async documentWrite(
        input: DocumentWriteInput,
        context: HappyCallContext,
        signal?: AbortSignal,
    ): Promise<DocumentWriteOutcome> {
        const result = await this.#request(
            "POST",
            `/documents/${encodeURIComponent(identifier(input.documentId, "documentId"))}/applyUpdates`,
            context,
            {
                baseSequence: sequence(input.baseSequence, "baseSequence"),
                clientUpdateId: identifier(input.clientUpdateId, "clientUpdateId"),
                updates: [...input.updates],
            },
            signal,
        );
        const status = string(result.status, "status");
        const common = {
            requestId: identifier(result.requestId, "requestId"),
            documentId: identifier(result.documentId, "documentId"),
        };
        if (status === "approved")
            return {
                ...common,
                status,
                acceptedSequence: sequence(result.acceptedSequence, "acceptedSequence"),
            };
        if (status === "denied" || status === "failed")
            return { ...common, status, message: string(result.message, "message") };
        throw new TypeError("Happy plugin host returned an invalid document write status");
    }

    async #request(
        method: "GET" | "POST",
        path: string,
        context: HappyCallContext,
        body?: JsonObject,
        signal?: AbortSignal,
    ): Promise<JsonObject> {
        const chatToken = context.chat?.token;
        if (!chatToken) throw new TypeError("This document function requires a current chat");
        const timeout = AbortSignal.timeout(method === "POST" ? WRITE_TIMEOUT_MS : READ_TIMEOUT_MS);
        const response = await this.#fetch(new URL(route(path), this.#baseUrl), {
            ...(body ? { body: JSON.stringify(body) } : {}),
            headers: {
                accept: "application/json",
                authorization: `Bearer ${this.#token}`,
                "content-type": "application/json",
                "x-happy2-chat-token": chatToken,
            },
            method,
            signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        });
        if (!response.ok)
            throw new HostApiError(response.status, (await response.text()).slice(0, 2_048));
        const value: unknown = await response.json();
        return object(value, "Happy plugin host response") as JsonObject;
    }
}

function attachedDocument(value: unknown, label: string): AttachedDocument {
    const document = object(value, label);
    return {
        id: identifier(document.id, `${label}.id`),
        title: string(document.title, `${label}.title`),
        updatedAt: string(document.updatedAt, `${label}.updatedAt`),
        latestSequence: sequence(document.latestSequence, `${label}.latestSequence`),
    };
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

function object(value: unknown, label: string): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new TypeError(`${label} must be an object`);
    return value as Record<string, unknown>;
}

function array(value: unknown, label: string): unknown[] {
    if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
    return value;
}

function string(value: unknown, label: string): string {
    if (typeof value !== "string") throw new TypeError(`${label} must be a string`);
    return value;
}

function identifier(value: unknown, label: string): string {
    const result = string(value, label);
    if (!result || result.length > 128 || /\s/.test(result))
        throw new TypeError(`${label} must be a valid identifier`);
    return result;
}

function sequence(value: unknown, label: string): string {
    const result = string(value, label);
    if (!/^\d+$/.test(result)) throw new TypeError(`${label} must be a document sequence`);
    return result;
}
