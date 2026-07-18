import type {
    CombinedOnboardingStatus,
    PublicServerSetupPhase,
    RegistrationAvailability,
    ServerSetupStep,
} from "happy2-state";
import type { DesktopOnboardingStep } from "../navigation/desktopRouteTypes";

/**
 * The canonical onboarding step for the pre-authentication phase. It is chosen
 * from both the public setup phase and the durable registration availability,
 * never the phase alone: bootstrap account creation is only reachable while
 * registration actually permits it (`bootstrap` or `open`).
 *
 * The decisive case is resume. Creating the single provisional bootstrap account
 * leaves the phase at `bootstrap_required` (no profile yet) while registration
 * flips to `closed`, so a reload that lost the local token must route the
 * existing account to sign-in to resume profile creation. Routing to account
 * creation there would render a create form whose registration is closed, which
 * only returns 403 and traps the account.
 */
export function preAuthOnboardingStep(
    phase: PublicServerSetupPhase,
    registration: RegistrationAvailability,
): Extract<DesktopOnboardingStep, "bootstrap-account" | "sign-in"> {
    return phase === "bootstrap_required" && registration !== "closed"
        ? "bootstrap-account"
        : "sign-in";
}

export type OnboardingResolution =
    | { readonly kind: "step"; readonly step: DesktopOnboardingStep }
    | { readonly kind: "app" };

/**
 * The canonical post-authentication step derived from the durable combined
 * status. This is the single routing authority: it maps the server-computed
 * `route` to the exact centered screen, so a fresh mount after reload or restart
 * resumes precisely where setup left off and a manually entered later URL is
 * redirected back to the first incomplete prerequisite.
 *
 * `kind: "app"` means server setup is complete and the profile exists, so the
 * main application may take over. Per-user onboarding (`scope: "user"`) is a
 * separate durable track owned by a later task; until it exists here, a
 * completed server hands off to the app rather than trapping the client.
 */
export function onboardingStepForStatus(status: CombinedOnboardingStatus): OnboardingResolution {
    const route = status.route;
    switch (route.scope) {
        case "profile":
            return { kind: "step", step: "profile" };
        case "waiting":
            return { kind: "step", step: "waiting" };
        case "server":
            return { kind: "step", step: serverStep(route.step) };
        case "user":
        case "complete":
            return { kind: "app" };
    }
}

function serverStep(step: ServerSetupStep): DesktopOnboardingStep {
    switch (step) {
        case "bootstrap_administrator":
            return "profile";
        case "sandbox_provider_selected":
        case "sandbox_provider_validated":
            return "sandbox-provider";
        case "base_image_selected":
            return "base-image";
        case "base_image_build_requested":
        case "base_image_ready":
            return "build-progress";
        case "registration_policy_selected":
            return "completion";
        case "server_setup_complete":
            // The route only reports this transiently before it flips to
            // complete/user; route to completion so the screen stays coherent.
            return "completion";
    }
}
