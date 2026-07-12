export const integrationKinds = [
    "app",
    "incoming_webhook",
    "outgoing_webhook",
    "slash_command",
    "service_account",
] as const;

export type IntegrationKind = (typeof integrationKinds)[number];

export const integrationScopes = [
    "channels:read",
    "commands:receive",
    "events:read",
    "files:read",
    "files:write",
    "messages:read",
    "messages:write",
    "users:read",
] as const;

export type IntegrationScope = (typeof integrationScopes)[number];

export interface BotSummary {
    id: string;
    name: string;
    username: string;
    description?: string;
    photoFileId?: string;
    ownerUserId?: string;
    active: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface IntegrationSummary {
    id: string;
    kind: IntegrationKind;
    name: string;
    description?: string;
    botId?: string;
    scopes: IntegrationScope[];
    active: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface ApiCredentialSummary {
    id: string;
    integrationId: string;
    name: string;
    tokenPrefix: string;
    scopes: IntegrationScope[];
    expiresAt?: string;
    lastUsedAt?: string;
    revokedAt?: string;
    createdAt: string;
}

export interface IssuedApiCredential {
    credential: ApiCredentialSummary;
    /** Returned only from the creation call. It is never persisted or listed. */
    token: string;
}

export interface AuthenticatedIntegration {
    integrationId: string;
    credentialId: string;
    actorUserId: string;
    botId?: string;
    scopes: IntegrationScope[];
}

export interface WebhookSubscriptionSummary {
    id: string;
    integrationId: string;
    direction: "incoming" | "outgoing";
    chatId?: string;
    url?: string;
    eventTypes: string[];
    active: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface IssuedIncomingWebhook {
    integration: IntegrationSummary;
    subscription: WebhookSubscriptionSummary;
    /** Returned only once and subsequently represented only by its hash. */
    token: string;
}

export interface IssuedOutgoingWebhook {
    integration: IntegrationSummary;
    subscription: WebhookSubscriptionSummary;
    /** Returned only once; the database contains authenticated ciphertext. */
    signingSecret: string;
}

export interface SlashCommandSummary {
    id: string;
    integrationId: string;
    command: string;
    description?: string;
    usageHint?: string;
    active: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface IssuedSlashCommand {
    integration: IntegrationSummary;
    command: SlashCommandSummary;
    /** Used to verify queued invocation deliveries and returned only once. */
    signingSecret: string;
}

export interface IncomingWebhookMessage {
    /** Administrative authority used by the collaboration repository for bot posts. */
    actorUserId: string;
    integrationId: string;
    subscriptionId: string;
    botId: string;
    chatId: string;
    text: string;
    attachmentFileIds?: string[];
    idempotencyKey?: string;
}

export interface IncomingWebhookSinkResult {
    messageId: string;
    sync?: unknown;
}

export interface IncomingWebhookSink {
    sendMessage(message: IncomingWebhookMessage): Promise<IncomingWebhookSinkResult>;
}

export interface QueuedWebhookDelivery {
    id: string;
    subscriptionId: string;
    eventId: string;
    eventType: string;
    status: "pending" | "delivering" | "delivered" | "failed" | "cancelled";
    attempts: number;
    nextAttemptAt: string;
    createdAt: string;
}

export interface WebhookTransportRequest {
    deliveryId: string;
    eventId: string;
    eventType: string;
    url: string;
    /** All addresses were checked by the URL policy; transports must pin to one. */
    allowedAddresses: ReadonlyArray<{ address: string; family: 4 | 6 }>;
    body: string;
    headers: Readonly<Record<string, string>>;
}

export interface WebhookTransportResponse {
    statusCode: number;
    body?: string;
}

export interface WebhookTransport {
    deliver(request: WebhookTransportRequest): Promise<WebhookTransportResponse>;
}

export interface IntegrationChange {
    sequence: string;
    kind: string;
    entityId: string;
}

export interface IntegrationMutation<T> {
    value: T;
    change: IntegrationChange;
}

export interface IntegrationRouteCallbacks {
    incomingWebhook: IncomingWebhookSink;
    onChange?: (change: IntegrationChange) => Promise<void>;
}

export type IntegrationErrorCode =
    | "conflict"
    | "forbidden"
    | "invalid"
    | "not_found"
    | "unauthorized";

export class IntegrationError extends Error {
    constructor(
        readonly code: IntegrationErrorCode,
        message: string,
    ) {
        super(message);
        this.name = "IntegrationError";
    }
}
