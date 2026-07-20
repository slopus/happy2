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

/** One user's durable last-write-wins composer text for a chat. */
export interface DraftSummary {
    readonly chatId: string;
    readonly text: string;
    readonly revision: string;
    readonly updatedAt: string;
}

export interface AdminUserSummary extends UserSummary {
    readonly lastAccessAt?: string;
}

export type Permission =
    | "manageSecrets"
    | "assignSecrets"
    | "manageImages"
    | "assignImagesToChats"
    | "managePlugins"
    | "viewAllMembers"
    | "manageAdminRoles"
    | "resetPasswords";

export interface EffectivePermissions {
    readonly allowed: readonly Permission[];
    readonly owner: boolean;
}

export interface RoleSummary {
    readonly id: string;
    readonly name: string;
    readonly description?: string;
    readonly builtin: "admin" | "member" | null;
    readonly permissions: readonly Permission[];
    readonly userIds: readonly string[];
}

export interface MemberPermissionDetail {
    readonly direct: readonly Permission[];
    readonly roleIds: readonly string[];
    readonly effective: EffectivePermissions;
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

/**
 * Server plugin catalog wire shapes mirrored from `/v0/admin/plugins`. Server
 * URLs are intentionally absent: icon bytes travel through the authenticated
 * transport, and secret variable values never appear in any read.
 */
export type PluginVariableKind = "secret" | "text";

export type PluginSourceKind = "builtin" | "github" | "upload" | "zip_url" | "archive" | "link";

export type PluginInstallationStatus =
    | "preparing"
    | "starting"
    | "ready"
    | "broken_configuration"
    | "failed";

export interface PluginVariableDefinition {
    readonly key: string;
    readonly displayName: string;
    readonly description: string;
    readonly kind: PluginVariableKind;
}

/** The closed set of host API capabilities a plugin may be granted against this server. */
export type PluginHostPermission =
    | "channels:create"
    | "chats:members:add"
    | "chats:members:remove"
    | "chats:update"
    | "chats:archive"
    | "messages:send"
    | "messages:delete"
    | "messages:history"
    | "messages:read"
    | "reactions:add"
    | "reactions:remove"
    | "search:users"
    | "search:messages"
    | "search:chats"
    | "commands:run"
    | "workspace:read"
    | "workspace:write"
    | "environments:read"
    | "environments:manage"
    | "environments:deactivate"
    | "plugins:list"
    | "plugins:install"
    | "plugins:uninstall"
    | "plugins:request-install"
    | "plugins:request-uninstall";

/** One grantable capability inside an API permission section, split by access class on the section. */
export interface PluginApiPermissionDefinition {
    readonly id: PluginHostPermission;
    readonly displayName: string;
    readonly description: string;
}

/**
 * The permissions a package declares, grouped for presentation: `readOnly`
 * capabilities never change durable state, `mutations` do. Only declared
 * capabilities appear, so an empty section list means the package requests none.
 */
export interface PluginApiPermissionSection {
    readonly id:
        | "channels"
        | "chats"
        | "messages"
        | "reactions"
        | "search"
        | "commands"
        | "workspace"
        | "environments"
        | "plugins";
    readonly displayName: string;
    readonly readOnly: readonly PluginApiPermissionDefinition[];
    readonly mutations: readonly PluginApiPermissionDefinition[];
}

export interface PluginSkillSummary {
    readonly name: string;
    readonly description: string;
    readonly directory: string;
}

export interface PluginMcpRequirement {
    readonly type: "remote" | "stdio";
    readonly container: "bundled" | "selection_required" | "none";
}

export interface PluginImageSummary {
    readonly contentType: "image/png";
    readonly size: number;
    readonly width: number;
    readonly height: number;
    readonly thumbhash: string;
    readonly checksumSha256: string;
}

export interface PluginInstallationSummary {
    readonly id: string;
    readonly pluginId: string;
    readonly shortName: string;
    readonly sourceKind?: PluginSourceKind;
    readonly sourceReference?: string;
    readonly sourceVersion: string;
    readonly packageDigest: string;
    /** The host API capabilities currently granted to this installation. */
    readonly grantedPermissions: readonly PluginHostPermission[];
    readonly status: PluginInstallationStatus;
    readonly statusDetail?: string;
    readonly lastError?: string;
    readonly containerImageId?: string;
    readonly installedByUserId?: string;
    readonly installedAt: string;
    readonly updatedAt: string;
    readonly readyAt?: string;
}

export interface SystemPluginSummary {
    readonly id: string;
    readonly displayName: string;
    readonly shortName: string;
    readonly description: string;
    readonly sourceKind: PluginSourceKind;
    /** Normalized source identity: catalog name, GitHub location, ZIP URL, or upload digest. */
    readonly sourceReference: string;
    readonly sourceVersion: string;
    readonly packageDigest: string;
    readonly variables: readonly PluginVariableDefinition[];
    readonly mcp?: PluginMcpRequirement;
    /** The host API capabilities this package declares and an administrator may grant. */
    readonly apiPermissions: readonly PluginApiPermissionSection[];
    readonly image: PluginImageSummary;
    readonly installedByUserId?: string;
    readonly installedAt: string;
    readonly updatedAt: string;
    readonly updateAvailable: boolean;
    readonly installations: readonly PluginInstallationSummary[];
}

export interface PluginCatalogItem {
    readonly displayName: string;
    readonly shortName: string;
    readonly description: string;
    readonly version: string;
    readonly packageDigest: string;
    readonly skills: readonly PluginSkillSummary[];
    readonly mcp?: PluginMcpRequirement;
    readonly variables: readonly PluginVariableDefinition[];
    /** The host API capabilities this package declares and an administrator may grant. */
    readonly apiPermissions: readonly PluginApiPermissionSection[];
    readonly systemPlugin?: SystemPluginSummary;
}

export type PluginManagementRequestAction = "install" | "uninstall";

export type PluginManagementRequestStatus =
    | "pending"
    | "processing"
    | "approved"
    | "denied"
    | "failed";

/**
 * One chat-scoped agent request to install or uninstall a plugin. The staged
 * package image travels through the authenticated transport while the request
 * is pending or processing; terminal requests keep only durable metadata.
 */
export interface PluginManagementRequestSummary {
    readonly id: string;
    readonly action: PluginManagementRequestAction;
    readonly status: PluginManagementRequestStatus;
    readonly chatId: string;
    readonly agentUserId?: string;
    readonly requesterInstallationId?: string;
    readonly displayName: string;
    readonly shortName: string;
    readonly description: string;
    readonly reason?: string;
    readonly sourceKind?: PluginSourceKind;
    readonly sourceReference?: string;
    readonly targetInstallationId?: string;
    readonly createdAt: string;
    readonly resolvedAt?: string;
    readonly resolvedByUserId?: string;
    readonly installationId?: string;
    readonly lastError?: string;
}

/** One live progress frame from a plugin preparation or update-check stream. */
export interface PluginPrepareProgress {
    readonly stage: string;
    readonly detail: string;
    readonly receivedBytes?: number;
    readonly totalBytes?: number;
}

/**
 * One verified, installable package candidate produced by external plugin
 * preparation. The prepared token is administrator-bound, single-use, and
 * expires server-side at `expiresAt`.
 */
export interface PreparedPluginSummary {
    readonly preparedToken: string;
    readonly expiresAt: string;
    readonly sourceKind: PluginSourceKind;
    readonly sourceReference: string;
    readonly packageDigest: string;
    readonly version: string;
    readonly displayName: string;
    readonly shortName: string;
    readonly description: string;
    readonly skills: readonly { readonly name: string; readonly description: string }[];
    readonly variables: readonly PluginVariableDefinition[];
    readonly mcp?: PluginMcpRequirement;
    readonly apiPermissions: readonly PluginApiPermissionSection[];
    readonly image: PluginImageSummary;
}

/** The read-only result of one remote update check for an installed system plugin. */
export interface PluginUpdateCheck {
    readonly pluginId: string;
    readonly checkedAt: string;
    readonly updateAvailable: boolean;
    readonly installed: { readonly version: string; readonly packageDigest: string };
    readonly remote: { readonly version: string; readonly packageDigest: string };
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

/** One-time development credential bound to the authenticated session that issued it. */
export interface DevelopmentTokenCredential {
    readonly token: string;
    readonly sessionId: string;
    readonly expiresAt: string;
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

/**
 * One member-visible port share: the durable, publicly reachable preview of a
 * chat agent's container port. `url` is the ready-to-open wildcard host; the
 * scoped access token that authorizes it is never part of this projection.
 */
export interface PortShareSummary {
    readonly id: string;
    readonly chatId: string;
    readonly agentUserId: string;
    readonly containerPort: number;
    readonly name: string;
    readonly subdomain: string;
    readonly createdByUserId: string;
    readonly createdAt: string;
    readonly disabledAt?: string;
    readonly disabledByUserId?: string;
    readonly url: string;
}
