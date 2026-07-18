import type { ChatSummary, MessageSummary, UserSummary } from "./types.js";

export interface ClientUser {
    readonly id: string;
    readonly firstName: string;
    readonly lastName?: string;
    readonly username: string;
    readonly email?: string;
    readonly phone?: string;
    readonly photoFileId?: string;
}

export interface AdminUserSummary extends UserSummary {
    readonly lastAccessAt?: string;
}

export type SearchResultSummary =
    | { readonly type: "message"; readonly score: number; readonly message: MessageSummary }
    | { readonly type: "channel"; readonly score: number; readonly channel: ChatSummary }
    | { readonly type: "user"; readonly score: number; readonly user: UserSummary };

export interface NotificationPreferences {
    readonly directMessages: "all" | "none";
    readonly mentions: "all" | "none";
    readonly threadReplies: "all" | "mentions" | "none";
    readonly reactions: "all" | "none";
    readonly calls: "all" | "none";
    readonly emailNotifications: boolean;
    readonly desktopNotifications: boolean;
    readonly dndStartMinutes?: number;
    readonly dndEndMinutes?: number;
    readonly timezone?: string;
}

export interface AutomationSummary {
    readonly id: string;
    readonly name: string;
    readonly chatId?: string;
    readonly botId?: string;
    readonly triggerType: "schedule" | "event" | "webhook";
    readonly triggerConfig: Readonly<Record<string, unknown>>;
    readonly actionType: "send_message" | "call_webhook" | "moderate";
    readonly actionConfig: Readonly<Record<string, unknown>>;
    readonly timezone?: string;
    readonly nextRunAt?: string;
    readonly active: boolean;
    readonly lastRunAt?: string;
    readonly lastError?: string;
    readonly createdAt: string;
    readonly updatedAt: string;
}

export interface ScheduledMessageSummary {
    readonly id: string;
    readonly chatId: string;
    readonly text: string;
    readonly attachmentFileIds: readonly string[];
    readonly scheduledFor: string;
    readonly timezone?: string;
    readonly status: "scheduled" | "publishing" | "published" | "cancelled" | "failed";
    readonly publishedMessageId?: string;
    readonly lastError?: string;
    readonly createdAt: string;
    readonly updatedAt: string;
}

export type IntegrationKind =
    | "app"
    | "incoming_webhook"
    | "outgoing_webhook"
    | "slash_command"
    | "service_account";
export type IntegrationScope =
    | "channels:read"
    | "commands:receive"
    | "events:read"
    | "files:read"
    | "files:write"
    | "messages:read"
    | "messages:write"
    | "users:read";

export interface BotSummary {
    readonly id: string;
    readonly name: string;
    readonly username: string;
    readonly description?: string;
    readonly photoFileId?: string;
    readonly ownerUserId?: string;
    readonly active: boolean;
    readonly createdAt: string;
    readonly updatedAt: string;
}

export type AgentImageStatus = "pending" | "building" | "ready" | "failed";

export interface AgentImageSummary {
    readonly id: string;
    readonly name: string;
    readonly definitionHash: string;
    readonly dockerTag: string;
    readonly builtinKey?: "daycare-full" | "daycare-minimal";
    readonly status: AgentImageStatus;
    readonly buildAttempt: number;
    /** Best-effort build completion percentage (0–100). */
    readonly buildProgress: number;
    readonly lastBuildLogLine?: string;
    readonly buildLogUpdatedAt?: string;
    readonly dockerImageId?: string;
    readonly lastError?: string;
    readonly buildRequestedAt?: string;
    readonly buildStartedAt?: string;
    readonly readyAt?: string;
    readonly createdByUserId?: string;
    readonly createdAt: string;
    readonly updatedAt: string;
}

/** A single image with its full Dockerfile and captured build log. */
export interface AgentImageDetails extends AgentImageSummary {
    readonly dockerfile: string;
    readonly buildLog: string;
    readonly buildLogTruncated: boolean;
}

/**
 * Durable server/user onboarding contract mirrored from the backend `/v0/setup`
 * responses. These are wire shapes the setup surface store reconciles against;
 * they are not owned here, so they must match the server presentation exactly.
 */
export type RegistrationAvailability = "bootstrap" | "open" | "closed";

export type ServerSetupStep =
    | "bootstrap_administrator"
    | "sandbox_provider_selected"
    | "sandbox_provider_validated"
    | "base_image_selected"
    | "base_image_build_requested"
    | "base_image_ready"
    | "default_agent_created"
    | "registration_policy_selected"
    | "server_setup_complete";

export type ServerSetupStepState = "pending" | "in_progress" | "complete" | "failed";

export type UserOnboardingStep = "avatar" | "desktop_notifications";
export type UserOnboardingStepState = "pending" | "complete" | "skipped";

export type SafeSetupMetadataValue = string | number | boolean | null;
export type SafeSetupMetadata = Readonly<Record<string, SafeSetupMetadataValue>>;

export interface SetupStepStatus<State extends string> {
    readonly state: State;
    readonly metadata?: SafeSetupMetadata;
    readonly lastError?: string;
    readonly startedAt?: string;
    readonly completedAt?: string;
    readonly updatedAt: string;
}

export type OnboardingRoute =
    | { readonly scope: "profile"; readonly step: "profile" }
    | { readonly scope: "server"; readonly step: ServerSetupStep }
    | { readonly scope: "waiting"; readonly step: "server_setup" }
    | { readonly scope: "user"; readonly step: UserOnboardingStep }
    | { readonly scope: "complete" };

export interface CombinedOnboardingStatus {
    readonly server: {
        readonly schemaVersion: number;
        readonly complete: boolean;
        readonly canManage: boolean;
        readonly registration: RegistrationAvailability;
        readonly steps: Readonly<Record<ServerSetupStep, SetupStepStatus<ServerSetupStepState>>>;
    };
    readonly user: {
        readonly profile: "pending" | "complete";
        readonly complete: boolean;
        readonly steps: Readonly<
            Record<UserOnboardingStep, SetupStepStatus<UserOnboardingStepState>>
        >;
    };
    readonly route: OnboardingRoute;
    readonly complete: boolean;
}

export type PublicServerSetupPhase = "bootstrap_required" | "configuration_required" | "complete";

export interface PublicServerSetupStatus {
    readonly schemaVersion: number;
    readonly phase: PublicServerSetupPhase;
    readonly registration: RegistrationAvailability;
}

export type SandboxProviderHealth = "healthy" | "unhealthy" | "unavailable" | "timed_out";

export interface SandboxProviderStatus {
    readonly id: string;
    readonly displayName: string;
    readonly health: SandboxProviderHealth;
    readonly detail: string;
    readonly remediation?: string;
    readonly version?: string;
}

export interface SandboxProviderDiscovery {
    readonly executionNotice: string;
    readonly providers: readonly SandboxProviderStatus[];
    readonly recommendedProviderId?: string;
    readonly selectedProviderId?: string;
}

export type SetupBaseImageBuildMode = "build" | "download_and_build";
export type SetupBaseImageSource = "builtin" | "custom";

export interface SetupBaseImagePresentation {
    readonly buildLabel: "Build" | "Download and build";
    readonly buildMode: SetupBaseImageBuildMode;
    readonly source: SetupBaseImageSource;
}

export type SetupBaseImageSummary = AgentImageSummary & SetupBaseImagePresentation;
export type SetupBaseImageDetails = AgentImageDetails & SetupBaseImagePresentation;

export interface SetupBaseImagesView {
    readonly defaultImageId?: string;
    readonly images: readonly SetupBaseImageSummary[];
    readonly selectedImage?: SetupBaseImageDetails;
    readonly selectedImageId?: string;
}

export type SetupBaseImageSelection =
    | { readonly builtinKey: "daycare-full" | "daycare-minimal" }
    | { readonly custom: { readonly name: string; readonly dockerfile: string } };

/** Rig-owned secret metadata. Values are intentionally absent from every client snapshot. */
export interface AgentSecretSummary {
    readonly id: string;
    readonly description: string;
    readonly environmentVariables: readonly string[];
    readonly agentUserIds: readonly string[];
    readonly channelIds: readonly string[];
}

export interface IntegrationSummary {
    readonly id: string;
    readonly kind: IntegrationKind;
    readonly name: string;
    readonly description?: string;
    readonly botId?: string;
    readonly scopes: readonly IntegrationScope[];
    readonly active: boolean;
    readonly createdAt: string;
    readonly updatedAt: string;
}

export interface ApiCredentialSummary {
    readonly id: string;
    readonly integrationId: string;
    readonly name: string;
    readonly tokenPrefix: string;
    readonly scopes: readonly IntegrationScope[];
    readonly expiresAt?: string;
    readonly lastUsedAt?: string;
    readonly revokedAt?: string;
    readonly createdAt: string;
}

export interface WebhookSubscriptionSummary {
    readonly id: string;
    readonly integrationId: string;
    readonly direction: "incoming" | "outgoing";
    readonly chatId?: string;
    readonly url?: string;
    readonly eventTypes: readonly string[];
    readonly active: boolean;
    readonly createdAt: string;
    readonly updatedAt: string;
}

export interface SlashCommandSummary {
    readonly id: string;
    readonly integrationId: string;
    readonly command: string;
    readonly description?: string;
    readonly usageHint?: string;
    readonly active: boolean;
    readonly createdAt: string;
    readonly updatedAt: string;
}

export interface WebhookDeliverySummary {
    readonly id: string;
    readonly subscriptionId: string;
    readonly eventId: string;
    readonly eventType: string;
    readonly status: "pending" | "delivering" | "delivered" | "failed" | "cancelled";
    readonly attempts: number;
    readonly nextAttemptAt: string;
    readonly createdAt: string;
}

export interface AuditLogEntry {
    readonly id: string;
    readonly actorUserId?: string;
    readonly actorIntegrationId?: string;
    readonly action: string;
    readonly targetType: string;
    readonly targetId?: string;
    readonly chatId?: string;
    readonly before?: unknown;
    readonly after?: unknown;
    readonly metadata?: unknown;
    readonly clientIp?: string;
    readonly device?: string;
    readonly appVersion?: string;
    readonly userAgent?: string;
    readonly createdAt: string;
}

export interface AccountBan {
    readonly id: string;
    readonly accountId: string;
    readonly userId?: string;
    readonly username?: string;
    readonly bannedByUserId?: string;
    readonly reason?: string;
    readonly bannedAt: string;
    readonly expiresAt?: string;
    readonly revokedAt?: string;
    readonly revokedByUserId?: string;
    readonly revokeReason?: string;
    readonly status: "active" | "expired" | "revoked";
}

export interface ModerationReport {
    readonly id: string;
    readonly reportedByUserId?: string;
    readonly targetUserId?: string;
    readonly chatId?: string;
    readonly messageId?: string;
    readonly fileId?: string;
    readonly reason: string;
    readonly details?: string;
    readonly status: "open" | "reviewing" | "resolved" | "dismissed";
    readonly assignedToUserId?: string;
    readonly resolution?: string;
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly resolvedAt?: string;
}

export interface ModerationAction {
    readonly id: string;
    readonly reportId?: string;
    readonly actorUserId?: string;
    readonly targetUserId?: string;
    readonly chatId?: string;
    readonly messageId?: string;
    readonly fileId?: string;
    readonly action:
        | "warn"
        | "restrict"
        | "remove_message"
        | "remove_file"
        | "ban"
        | "unban"
        | "delete_user";
    readonly reason?: string;
    readonly metadata?: unknown;
    readonly expiresAt?: string;
    readonly revokedAt?: string;
    readonly createdAt: string;
}

export interface DataExportJob {
    readonly id: string;
    readonly requestedByUserId?: string;
    readonly kind: "user_data" | "server_data" | "audit_log" | "chat_history";
    readonly targetId?: string;
    readonly status: "pending" | "running" | "complete" | "failed" | "cancelled" | "expired";
    readonly outputFileId?: string;
    readonly options?: unknown;
    readonly lastError?: string;
    readonly expiresAt?: string;
    readonly createdAt: string;
    readonly startedAt?: string;
    readonly completedAt?: string;
}

export interface BackupRecord {
    readonly id: string;
    readonly storageProvider: string;
    readonly storageKey: string;
    readonly checksumSha256?: string;
    readonly size?: number;
    readonly status: "pending" | "running" | "complete" | "failed" | "deleted";
    readonly createdByUserId?: string;
    readonly metadata?: unknown;
    readonly lastError?: string;
    readonly createdAt: string;
    readonly completedAt?: string;
    readonly retentionUntil?: string;
}

export interface RetentionRun {
    readonly id: string;
    readonly scope: "messages" | "files" | "sync" | "idempotency" | "audit" | "backups";
    readonly status: "running" | "complete" | "failed";
    readonly itemsExamined: number;
    readonly itemsDeleted: number;
    readonly details?: unknown;
    readonly lastError?: string;
    readonly startedAt: string;
    readonly completedAt?: string;
}

export interface UserAccessTelemetry {
    readonly userId: string;
    readonly username: string;
    readonly email: string;
    readonly role: "member" | "admin";
    readonly lastAccessAt?: string;
    readonly lastSessionAccessAt?: string;
    readonly activeSessionCount: number;
    readonly bannedAt?: string;
    readonly banExpiresAt?: string;
    readonly deletedAt?: string;
    readonly lastClientIp?: string;
    readonly lastDevice?: string;
    readonly lastAppVersion?: string;
    readonly lastUserAgent?: string;
}

export interface ResumableUploadSummary {
    readonly id: string;
    readonly filename?: string;
    readonly contentType?: string;
    readonly offset: number;
    readonly size: number;
    readonly createdAt: string;
    readonly updatedAt: string;
}

export interface UploadedFile {
    readonly id: string;
    readonly kind: "file" | "photo" | "video" | "gif";
    readonly isPublic: boolean;
    readonly originalName?: string;
    readonly contentType: string;
    readonly size: number;
    readonly width?: number;
    readonly height?: number;
    readonly durationMs?: number;
    readonly thumbhash?: string;
    readonly previewUrl?: string;
    readonly thumbnailUrl?: string;
}

export interface MessageRevision {
    readonly revision: number;
    readonly text: string;
    readonly editedByUserId?: string;
    readonly editReason?: string;
    readonly createdAt: string;
}

export interface ForwardedMessagesResult {
    readonly messages: readonly MessageSummary[];
}
