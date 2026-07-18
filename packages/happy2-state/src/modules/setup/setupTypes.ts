import type { ReadonlyStore } from "../../kernel/readonlyStore.js";
import type {
    CombinedOnboardingStatus,
    SandboxProviderDiscovery,
    SandboxProviderStatus,
    SetupBaseImageSelection,
    SetupBaseImagesView,
} from "../../resources.js";
import type { UserError } from "../../types.js";
import type { Loadable } from "../chat/chatTypes.js";

/** Durable onboarding action names, used to attribute an in-flight command and its failure. */
export type SetupAction = "sandboxProvider" | "baseImageSelect" | "baseImageRetry" | "policy";

export interface SetupPending {
    /** The sandbox provider id whose selection probe is in flight, if any. */
    readonly selectingProviderId?: string;
    readonly selectingImage: boolean;
    readonly retryingBuild: boolean;
    /** The registration policy value being committed, if a choice is in flight. */
    readonly choosingPolicy?: boolean;
}

export interface SetupSnapshot {
    readonly status: Loadable<CombinedOnboardingStatus>;
    readonly providers: Loadable<SandboxProviderDiscovery>;
    readonly baseImages: Loadable<SetupBaseImagesView>;
    readonly pending: SetupPending;
    /** The last displayable action failure, cleared when a new action starts. */
    readonly actionError?: UserError;
    /** The action the current `actionError` belongs to, so a surface can place it. */
    readonly actionErrorFor?: SetupAction;
}

export type SetupOutput =
    | { readonly type: "sandboxProviderSelectSubmitted"; readonly providerId: string }
    | { readonly type: "baseImageSelectSubmitted"; readonly selection: SetupBaseImageSelection }
    | { readonly type: "baseImageBuildRetrySubmitted" }
    | { readonly type: "registrationPolicyChooseSubmitted"; readonly enabled: boolean };

export type SetupInput =
    | { readonly type: "statusLoading" }
    | { readonly type: "statusLoaded"; readonly status: CombinedOnboardingStatus }
    | { readonly type: "statusFailed"; readonly error: UserError }
    | { readonly type: "providersLoading" }
    | { readonly type: "providersLoaded"; readonly providers: SandboxProviderDiscovery }
    | { readonly type: "providersFailed"; readonly error: UserError }
    | { readonly type: "baseImagesLoading" }
    | { readonly type: "baseImagesLoaded"; readonly baseImages: SetupBaseImagesView }
    | { readonly type: "baseImagesFailed"; readonly error: UserError }
    | {
          readonly type: "sandboxProviderSelectSucceeded";
          readonly status: CombinedOnboardingStatus;
          readonly provider: SandboxProviderStatus;
      }
    | {
          readonly type: "baseImageSelectSucceeded";
          readonly status: CombinedOnboardingStatus;
          readonly baseImages: SetupBaseImagesView;
      }
    | {
          readonly type: "baseImageBuildRetrySucceeded";
          readonly status: CombinedOnboardingStatus;
          readonly baseImages: SetupBaseImagesView;
      }
    | {
          readonly type: "registrationPolicyChooseSucceeded";
          readonly status: CombinedOnboardingStatus;
      }
    | { readonly type: "actionFailed"; readonly action: SetupAction; readonly error: UserError };

export interface SetupStore extends ReadonlyStore<SetupSnapshot> {
    /** Probe and durably select a sandbox provider; a conflict refreshes provider health. */
    sandboxProviderSelect(providerId: string): void;
    /** Start (or reuse) the durable base-image build for the chosen definition. */
    baseImageSelect(selection: SetupBaseImageSelection): void;
    /** Retry the selected image's failed build without re-selecting it. */
    baseImageBuildRetry(): void;
    /** Commit the final registration policy and complete server setup. */
    registrationPolicyChoose(enabled: boolean): void;
}
