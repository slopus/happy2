export const SERVER_SETUP_SCHEMA_VERSION = 1;

export const SERVER_SETUP_STEPS = [
    "bootstrap_administrator",
    "sandbox_provider_selected",
    "sandbox_provider_validated",
    "base_image_selected",
    "base_image_build_requested",
    "base_image_ready",
    "registration_policy_selected",
    "server_setup_complete",
] as const;

export type ServerSetupStep = (typeof SERVER_SETUP_STEPS)[number];
export type ServerSetupStepState = "pending" | "in_progress" | "complete" | "failed";

export const OPERATIONAL_SERVER_SETUP_STEPS = [
    "sandbox_provider_selected",
    "sandbox_provider_validated",
    "base_image_selected",
    "base_image_build_requested",
    "base_image_ready",
] as const;

export type OperationalServerSetupStep = (typeof OPERATIONAL_SERVER_SETUP_STEPS)[number];

export const USER_ONBOARDING_STEPS = ["avatar", "desktop_notifications"] as const;
export type UserOnboardingStep = (typeof USER_ONBOARDING_STEPS)[number];
export type UserOnboardingStepState = "pending" | "complete" | "skipped";

export type SafeSetupMetadataValue = string | number | boolean | null;
export type SafeSetupMetadata = Readonly<Record<string, SafeSetupMetadataValue>>;

export type SetupBaseImageBuildMode = "build" | "download_and_build";
export type SetupBaseImageSource = "builtin" | "custom";

export interface SetupStepStatus<State extends string> {
    state: State;
    metadata?: SafeSetupMetadata;
    lastError?: string;
    startedAt?: string;
    completedAt?: string;
    updatedAt: string;
}

export type RegistrationAvailability = "bootstrap" | "open" | "closed";
export type PublicServerSetupPhase = "bootstrap_required" | "configuration_required" | "complete";

export interface PublicServerSetupStatus {
    schemaVersion: number;
    phase: PublicServerSetupPhase;
    registration: RegistrationAvailability;
}

export type OnboardingRoute =
    | { scope: "profile"; step: "profile" }
    | { scope: "server"; step: ServerSetupStep }
    | { scope: "waiting"; step: "server_setup" }
    | { scope: "user"; step: UserOnboardingStep }
    | { scope: "complete" };

export interface CombinedOnboardingStatus {
    server: {
        schemaVersion: number;
        complete: boolean;
        canManage: boolean;
        registration: RegistrationAvailability;
        steps: Record<ServerSetupStep, SetupStepStatus<ServerSetupStepState>>;
    };
    user: {
        profile: "pending" | "complete";
        complete: boolean;
        steps: Record<UserOnboardingStep, SetupStepStatus<UserOnboardingStepState>>;
    };
    route: OnboardingRoute;
    complete: boolean;
}

export interface SetupSyncHint {
    sequence: string;
    chats: [];
    areas: ["setup"] | ["user-onboarding"];
}

export type SetupErrorCode = "invalid" | "forbidden" | "not_found" | "conflict";

export class SetupError extends Error {
    constructor(
        readonly code: SetupErrorCode,
        message: string,
    ) {
        super(message);
        this.name = "SetupError";
    }
}
