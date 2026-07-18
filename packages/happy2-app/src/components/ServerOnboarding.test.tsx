import { fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { happyStateCreate, type HappyState } from "happy2-state";
import { ServerOnboarding } from "./ServerOnboarding";
import { createAuthenticatedTransport } from "../stateTransport";
import { desktopNavigationCreate } from "../navigation/desktopNavigationCreate";

/* ServerOnboarding drives the durable server-configuration flow against the real
 * /v0/setup contract through a routed fetch mock, so route resumption, provider
 * selection, and completion handoff are observable end to end. */

type Handler = (init: RequestInit) => Response;

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

function serverStatus(step: string, scope: "server" | "complete" = "server") {
    return {
        server: {
            schemaVersion: 1,
            complete: false,
            canManage: true,
            registration: "bootstrap",
            steps: {},
        },
        user: { profile: "complete", complete: false, steps: {} },
        route: scope === "complete" ? { scope: "complete" } : { scope: "server", step },
        complete: false,
    };
}

function statusWithProvider(step: string, providerId: string, version: string) {
    const base = serverStatus(step);
    return {
        ...base,
        server: {
            ...base.server,
            steps: {
                sandbox_provider_selected: {
                    state: "complete",
                    updatedAt: "2026-01-01T00:00:00.000Z",
                    metadata: { providerId },
                },
                sandbox_provider_validated: {
                    state: "complete",
                    updatedAt: "2026-01-01T00:00:00.000Z",
                    metadata: { providerId, version },
                },
            },
        },
    };
}

const discovery = {
    executionNotice: "Agent code runs inside the selected sandbox provider.",
    providers: [
        {
            id: "docker",
            displayName: "Docker",
            health: "healthy",
            detail: "Docker 25 is ready",
            version: "25.0.3",
        },
        {
            id: "podman",
            displayName: "Podman",
            health: "unavailable",
            detail: "Podman is not installed",
            remediation: "Install Podman, then reload.",
        },
    ],
    recommendedProviderId: "docker",
};

const minimalImage = {
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
};

const customBuildingImage = {
    id: "img_custom",
    name: "my-image",
    definitionHash: "customhash",
    dockerTag: "customtag",
    status: "building",
    buildAttempt: 1,
    buildProgress: 20,
    lastBuildLogLine: "Step 1/2 : FROM alpine",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    dockerfile: "FROM alpine\nRUN echo hi",
    buildLog: "Step 1/2 : FROM alpine\n",
    buildLogTruncated: false,
    buildLabel: "Build",
    buildMode: "build",
    source: "custom",
};

function routedFetch(routes: Record<string, Handler>) {
    return vi.fn((input: string, init: RequestInit = {}) => {
        const { pathname } = new URL(input);
        const method = (init.method ?? "GET").toUpperCase();
        const handler = routes[`${method} ${pathname}`];
        return Promise.resolve(handler ? handler(init) : json({}));
    });
}

function mount(state: HappyState, onComplete = vi.fn()) {
    const navigation = desktopNavigationCreate();
    const screen = render(
        <ServerOnboarding navigation={navigation} onComplete={onComplete} state={state} />,
    );
    return { navigation, screen, onComplete };
}

afterEach(() => vi.unstubAllGlobals());

describe("ServerOnboarding", () => {
    it("resumes the durable sandbox step, explains the sandbox, and lists provider health", async () => {
        vi.stubGlobal(
            "fetch",
            routedFetch({
                "GET /v0/setup": () => json(serverStatus("sandbox_provider_selected")),
                "GET /v0/setup/sandboxProviders": () => json(discovery),
            }),
        );
        const state = happyStateCreate({
            transport: createAuthenticatedTransport("http://server", "t"),
        });
        const { navigation, screen } = mount(state);

        expect(await screen.findByText("Choose a sandbox")).toBeTruthy();
        expect(await screen.findByText("Docker")).toBeTruthy();
        expect(screen.getByText("Podman")).toBeTruthy();
        // The remediation for the unhealthy provider is surfaced.
        expect(screen.getByText("Install Podman, then reload.")).toBeTruthy();
        // The durable step is reflected into the URL for resume.
        await waitFor(() =>
            expect(navigation.get().primary).toMatchObject({
                kind: "onboarding",
                step: "sandbox-provider",
            }),
        );
        state[Symbol.dispose]();
    });

    it("selecting a healthy provider advances to base-image selection", async () => {
        vi.stubGlobal(
            "fetch",
            routedFetch({
                "GET /v0/setup": () => json(serverStatus("sandbox_provider_selected")),
                "GET /v0/setup/sandboxProviders": () => json(discovery),
                "POST /v0/setup/selectSandboxProvider": () =>
                    json({
                        provider: discovery.providers[0],
                        onboarding: serverStatus("base_image_selected"),
                    }),
                "GET /v0/setup/baseImages": () => json({ images: [minimalImage] }),
            }),
        );
        const state = happyStateCreate({
            transport: createAuthenticatedTransport("http://server", "t"),
        });
        const { screen } = mount(state);

        fireEvent.click(await screen.findByText("Docker"));
        expect(await screen.findByText("Pick a base image")).toBeTruthy();
        expect(await screen.findByText("Daycare Minimal")).toBeTruthy();
        state[Symbol.dispose]();
    });

    it("hands off to the application once registration policy completes setup", async () => {
        vi.stubGlobal(
            "fetch",
            routedFetch({
                "GET /v0/setup": () => json(serverStatus("registration_policy_selected")),
                "POST /v0/setup/chooseRegistrationPolicy": () =>
                    json({ onboarding: serverStatus("", "complete") }),
            }),
        );
        const state = happyStateCreate({
            transport: createAuthenticatedTransport("http://server", "t"),
        });
        const { onComplete, screen } = mount(state);

        fireEvent.click(await screen.findByText("Open registration"));
        await waitFor(() => expect(onComplete).toHaveBeenCalled());
        state[Symbol.dispose]();
    });

    it("explains the selected sandbox on later steps, resumed from durable metadata", async () => {
        // No discovery route: the note must come from authoritative step metadata
        // so it survives a reload that lands directly on the base-image screen.
        vi.stubGlobal(
            "fetch",
            routedFetch({
                "GET /v0/setup": () =>
                    json(statusWithProvider("base_image_selected", "docker", "25.0.3")),
                "GET /v0/setup/baseImages": () => json({ images: [minimalImage] }),
            }),
        );
        const state = happyStateCreate({
            transport: createAuthenticatedTransport("http://server", "t"),
        });
        const { screen } = mount(state);

        expect(await screen.findByText("Pick a base image")).toBeTruthy();
        expect(
            await screen.findByText("Agent code runs inside the Docker sandbox (version 25.0.3)."),
        ).toBeTruthy();
        state[Symbol.dispose]();
    });

    it("requires a name and Dockerfile before submitting a custom image", async () => {
        let selectCalls = 0;
        vi.stubGlobal(
            "fetch",
            routedFetch({
                "GET /v0/setup": () => json(serverStatus("base_image_selected")),
                "GET /v0/setup/baseImages": () => json({ images: [minimalImage] }),
                "POST /v0/setup/selectBaseImage": () => {
                    selectCalls += 1;
                    return json({});
                },
            }),
        );
        const state = happyStateCreate({
            transport: createAuthenticatedTransport("http://server", "t"),
        });
        const { screen } = mount(state);

        // Reveal the custom Dockerfile form and submit it empty.
        fireEvent.click(await screen.findByText("Custom Dockerfile"));
        const name = screen.container.querySelector<HTMLInputElement>(
            '[name="custom-image-name"]',
        )!;
        fireEvent.submit(name.closest("form")!);

        expect(await screen.findByText("Enter an image name.")).toBeTruthy();
        expect(screen.getByText("Enter the Dockerfile contents.")).toBeTruthy();
        expect(selectCalls).toBe(0);
        state[Symbol.dispose]();
    });

    it("builds a custom Dockerfile image, preserving the form across a transient failure", async () => {
        let selectCalls = 0;
        vi.stubGlobal(
            "fetch",
            routedFetch({
                "GET /v0/setup": () => json(serverStatus("base_image_selected")),
                "GET /v0/setup/baseImages": () => json({ images: [minimalImage] }),
                "POST /v0/setup/selectBaseImage": () => {
                    selectCalls += 1;
                    return selectCalls === 1
                        ? json({ error: "invalid", message: "Dockerfile failed validation" }, 400)
                        : json({
                              baseImages: {
                                  images: [minimalImage, customBuildingImage],
                                  selectedImage: customBuildingImage,
                                  selectedImageId: "img_custom",
                              },
                              onboarding: serverStatus("base_image_build_requested"),
                          });
                },
            }),
        );
        const state = happyStateCreate({
            transport: createAuthenticatedTransport("http://server", "t"),
        });
        const { screen } = mount(state);

        fireEvent.click(await screen.findByText("Custom Dockerfile"));
        const name = screen.container.querySelector<HTMLInputElement>(
            '[name="custom-image-name"]',
        )!;
        const dockerfile = screen.container.querySelector<HTMLTextAreaElement>(
            '[name="custom-image-dockerfile"]',
        )!;
        fireEvent.input(name, { target: { value: "my-image" } });
        fireEvent.input(dockerfile, { target: { value: "FROM alpine\nRUN echo hi" } });
        fireEvent.submit(name.closest("form")!);

        // The transient failure surfaces an error and preserves the typed draft.
        expect(await screen.findByText("Could not start the build")).toBeTruthy();
        expect(name.value).toBe("my-image");
        expect(dockerfile.value).toBe("FROM alpine\nRUN echo hi");

        // Retrying the same draft succeeds and advances to the live build screen.
        fireEvent.submit(name.closest("form")!);
        expect(await screen.findByText("Building your image")).toBeTruthy();
        state[Symbol.dispose]();
    });

    it("re-probes provider health on a bounded poll while visible and stops on unmount", async () => {
        vi.useFakeTimers();
        try {
            const fetchMock = routedFetch({
                "GET /v0/setup": () => json(serverStatus("sandbox_provider_selected")),
                "GET /v0/setup/sandboxProviders": () => json(discovery),
            });
            vi.stubGlobal("fetch", fetchMock);
            const state = happyStateCreate({
                transport: createAuthenticatedTransport("http://server", "t"),
            });
            const navigation = desktopNavigationCreate();
            const { unmount } = render(
                <ServerOnboarding navigation={navigation} onComplete={vi.fn()} state={state} />,
            );
            const probes = () =>
                fetchMock.mock.calls.filter(
                    ([url]) => new URL(url as string).pathname === "/v0/setup/sandboxProviders",
                ).length;

            await vi.advanceTimersByTimeAsync(50);
            const initial = probes();
            expect(initial).toBeGreaterThanOrEqual(1);
            await vi.advanceTimersByTimeAsync(4000);
            expect(probes()).toBeGreaterThan(initial);
            await vi.advanceTimersByTimeAsync(4000);
            const beforeUnmount = probes();
            expect(beforeUnmount).toBeGreaterThan(initial + 1);

            unmount();
            await vi.advanceTimersByTimeAsync(12000);
            expect(probes()).toBe(beforeUnmount);
            state[Symbol.dispose]();
        } finally {
            vi.useRealTimers();
        }
    });
});
