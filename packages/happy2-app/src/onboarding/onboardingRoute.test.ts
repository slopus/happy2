import { describe, expect, it } from "vitest";
import type { CombinedOnboardingStatus, OnboardingRoute } from "happy2-state";
import { onboardingStepForStatus, preAuthOnboardingStep } from "./onboardingRoute";

function status(route: OnboardingRoute): CombinedOnboardingStatus {
    return {
        server: {
            schemaVersion: 1,
            complete: route.scope === "complete",
            canManage: route.scope !== "waiting",
            registration: "bootstrap",
            steps: {} as CombinedOnboardingStatus["server"]["steps"],
        },
        user: {
            profile: route.scope === "profile" ? "pending" : "complete",
            complete: route.scope === "complete",
            steps: {} as CombinedOnboardingStatus["user"]["steps"],
        },
        route,
        complete: route.scope === "complete",
    };
}

describe("onboardingRoute", () => {
    it("routes the public phase and registration availability to creation or sign-in", () => {
        // A fresh server still open for bootstrap creation routes to account creation.
        expect(preAuthOnboardingStep("bootstrap_required", "bootstrap")).toBe("bootstrap-account");
        expect(preAuthOnboardingStep("bootstrap_required", "open")).toBe("bootstrap-account");
        // Provisional account created but no profile yet: phase stays bootstrap_required
        // while registration closes, so the existing account must sign in to resume.
        expect(preAuthOnboardingStep("bootstrap_required", "closed")).toBe("sign-in");
        // A configured or complete server always signs in.
        expect(preAuthOnboardingStep("configuration_required", "closed")).toBe("sign-in");
        expect(preAuthOnboardingStep("complete", "open")).toBe("sign-in");
    });

    it("maps every durable server step to its exact centered screen", () => {
        const cases: [OnboardingRoute, string][] = [
            [{ scope: "profile", step: "profile" }, "profile"],
            [{ scope: "server", step: "bootstrap_administrator" }, "profile"],
            [{ scope: "server", step: "sandbox_provider_selected" }, "sandbox-provider"],
            [{ scope: "server", step: "sandbox_provider_validated" }, "sandbox-provider"],
            [{ scope: "server", step: "base_image_selected" }, "base-image"],
            [{ scope: "server", step: "base_image_build_requested" }, "build-progress"],
            [{ scope: "server", step: "base_image_ready" }, "build-progress"],
            [{ scope: "server", step: "registration_policy_selected" }, "completion"],
            [{ scope: "waiting", step: "server_setup" }, "waiting"],
        ];
        for (const [route, step] of cases) {
            const resolution = onboardingStepForStatus(status(route));
            expect(resolution, JSON.stringify(route)).toEqual({ kind: "step", step });
        }
    });

    it("hands off to the application once server setup is complete or per-user work remains", () => {
        expect(onboardingStepForStatus(status({ scope: "complete" }))).toEqual({ kind: "app" });
        expect(onboardingStepForStatus(status({ scope: "user", step: "avatar" }))).toEqual({
            kind: "app",
        });
    });
});
