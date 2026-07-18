import { describe, expect, it } from "vitest";
import { createFakeServer, jsonResponse } from "../../testing/index.js";
import type {
    CombinedOnboardingStatus,
    SandboxProviderDiscovery,
    SetupBaseImagesView,
} from "../../resources.js";
import { StateRuntime } from "../runtime/stateRuntime.js";
import { setupStoreCreateBinding, type SetupStoreBinding } from "./setupStore.js";
import {
    setupOutputRoute,
    setupReconcile,
    setupSandboxProvidersLoad,
    setupStatusLoad,
} from "./setupRoute.js";

function statusAt(step: CombinedOnboardingStatus["route"]): CombinedOnboardingStatus {
    return {
        server: {
            schemaVersion: 1,
            complete: step.scope === "complete",
            canManage: true,
            registration: "bootstrap",
            steps: {} as CombinedOnboardingStatus["server"]["steps"],
        },
        user: {
            profile: "complete",
            complete: step.scope === "complete",
            steps: {} as CombinedOnboardingStatus["user"]["steps"],
        },
        route: step,
        complete: step.scope === "complete",
    };
}

const discovery: SandboxProviderDiscovery = {
    executionNotice: "Agent code runs inside the sandbox.",
    providers: [
        { id: "docker", displayName: "Docker", health: "healthy", detail: "Docker 25 ready" },
        {
            id: "podman",
            displayName: "Podman",
            health: "unavailable",
            detail: "Podman is not installed",
            remediation: "Install Podman and retry.",
        },
    ],
    recommendedProviderId: "docker",
};

const baseImages: SetupBaseImagesView = {
    images: [
        {
            id: "img_min",
            name: "Daycare Minimal",
            definitionHash: "hash",
            dockerTag: "tag",
            builtinKey: "daycare-minimal",
            status: "pending",
            buildAttempt: 0,
            buildProgress: 0,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            buildLabel: "Download and build",
            buildMode: "download_and_build",
            source: "builtin",
        },
    ],
};

function runtimeFor(server: ReturnType<typeof createFakeServer>): StateRuntime {
    return new StateRuntime({ transport: server.transport, retry: { attempts: 1 } });
}

describe("setup module", () => {
    it("loads the durable combined status that drives the route guard", async () => {
        const server = createFakeServer();
        server.respond(
            "GET",
            "/v0/setup",
            jsonResponse(200, statusAt({ scope: "server", step: "sandbox_provider_selected" })),
        );
        const runtime = runtimeFor(server);
        const setup = setupStoreCreateBinding();
        await setupStatusLoad({ runtime, setup });
        const snapshot = setup.store.get();
        expect(snapshot.status).toMatchObject({
            type: "ready",
            value: { route: { scope: "server", step: "sandbox_provider_selected" } },
        });
        runtime.stop();
        setup.dispose();
    });

    it("selecting a provider commits its status and marks the selection on the discovery", async () => {
        const server = createFakeServer();
        server.respond("GET", "/v0/setup/sandboxProviders", jsonResponse(200, discovery));
        server.respond(
            "POST",
            "/v0/setup/selectSandboxProvider",
            jsonResponse(200, {
                provider: discovery.providers[0],
                onboarding: statusAt({ scope: "server", step: "base_image_selected" }),
            }),
        );
        const runtime = runtimeFor(server);
        const outputs: unknown[] = [];
        const setup: SetupStoreBinding = setupStoreCreateBinding((event) => {
            outputs.push(event);
            void setupOutputRoute({ runtime, setup }, event);
        });
        await setupSandboxProvidersLoad({ runtime, setup });
        setup.store.sandboxProviderSelect("docker");
        expect(setup.store.get().pending.selectingProviderId).toBe("docker");
        for (let i = 0; i < 8; i++) await Promise.resolve();
        const snapshot = setup.store.get();
        expect(snapshot.pending.selectingProviderId).toBeUndefined();
        expect(snapshot.status).toMatchObject({
            value: { route: { scope: "server", step: "base_image_selected" } },
        });
        expect(snapshot.providers).toMatchObject({ value: { selectedProviderId: "docker" } });
        runtime.stop();
        setup.dispose();
    });

    it("keeps the provider list fresh and surfaces the error when selection conflicts", async () => {
        const server = createFakeServer();
        server.respond("GET", "/v0/setup/sandboxProviders", jsonResponse(200, discovery));
        server.respond(
            "POST",
            "/v0/setup/selectSandboxProvider",
            jsonResponse(409, {
                error: "sandbox_provider_unavailable",
                message: "Podman is not ready for agent code execution",
                provider: discovery.providers[1],
            }),
        );
        const runtime = runtimeFor(server);
        const setup: SetupStoreBinding = setupStoreCreateBinding((event) => {
            void setupOutputRoute({ runtime, setup }, event);
        });
        await setupSandboxProvidersLoad({ runtime, setup });
        setup.store.sandboxProviderSelect("podman");
        for (let i = 0; i < 6; i++) await Promise.resolve();
        const snapshot = setup.store.get();
        expect(snapshot.pending.selectingProviderId).toBeUndefined();
        expect(snapshot.actionErrorFor).toBe("sandboxProvider");
        expect(snapshot.actionError?.message).toContain("not ready");
        expect(snapshot.providers.type).toBe("ready");
        runtime.stop();
        setup.dispose();
    });

    it("reconcile reloads status always and materialized sub-resources", async () => {
        const server = createFakeServer();
        server.respond(
            "GET",
            "/v0/setup",
            jsonResponse(200, statusAt({ scope: "server", step: "base_image_ready" })),
            jsonResponse(200, statusAt({ scope: "complete" })),
        );
        server.respond("GET", "/v0/setup/baseImages", jsonResponse(200, baseImages));
        const runtime = runtimeFor(server);
        const setup = setupStoreCreateBinding();
        await setupStatusLoad({ runtime, setup });
        // baseImages is unloaded, so the first reconcile must not fetch it.
        await setupReconcile({ runtime, setup });
        expect(setup.store.get().baseImages.type).toBe("unloaded");
        expect(setup.store.get().status).toMatchObject({ value: { route: { scope: "complete" } } });
        runtime.stop();
        setup.dispose();
    });
});
