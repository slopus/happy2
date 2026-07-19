import { fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { happyStateCreate, type HappyState } from "happy2-state";
import { DEFAULT_AGENT_LUCKY_LABEL } from "happy2-ui";
import { ServerOnboarding } from "./ServerOnboarding";
import { createAuthenticatedTransport } from "../stateTransport";
import { desktopNavigationCreate } from "../navigation/desktopNavigationCreate";
import { DEFAULT_AGENT_PRESETS } from "../onboarding/defaultAgentIdentity";

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

const DOCKER_VERSION = "Docker version 27.0.3, build gym";

const discovery = {
    executionNotice: "Agent code runs inside the selected sandbox provider.",
    providers: [
        {
            id: "docker",
            displayName: "Docker",
            health: "healthy",
            detail: "Docker Engine is ready",
            version: DOCKER_VERSION,
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

type MountedScreen = ReturnType<typeof render>;
function nameInput(screen: MountedScreen): HTMLInputElement {
    return screen.container.querySelector<HTMLInputElement>(
        '[data-testid="default-agent-name"] input',
    )!;
}
function usernameInput(screen: MountedScreen): HTMLInputElement {
    return screen.container.querySelector<HTMLInputElement>(
        '[data-testid="default-agent-username"] input',
    )!;
}
function agentForm(screen: MountedScreen): HTMLFormElement {
    return screen.container.querySelector<HTMLFormElement>(
        '[data-happy2-ui="default-agent-form"]',
    )!;
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
        expect(screen.getByText(DOCKER_VERSION)).toBeTruthy();
        expect(screen.queryByText(`Version ${DOCKER_VERSION}`)).toBeNull();
        expect(screen.getByText("Podman")).toBeTruthy();
        expect(
            screen.container
                .querySelector(
                    '[data-testid="server-onboarding"] [data-happy2-ui="onboarding-card"]',
                )
                ?.getAttribute("data-width"),
        ).toBe("large");
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
                    json(statusWithProvider("base_image_selected", "docker", DOCKER_VERSION)),
                "GET /v0/setup/baseImages": () => json({ images: [minimalImage] }),
            }),
        );
        const state = happyStateCreate({
            transport: createAuthenticatedTransport("http://server", "t"),
        });
        const { screen } = mount(state);

        expect(await screen.findByText("Pick a base image")).toBeTruthy();
        expect(
            await screen.findByText(
                `Agent code runs inside the Docker sandbox (${DOCKER_VERSION}).`,
            ),
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

    it("resumes the default-agent form inside the stable five-step wizard", async () => {
        vi.stubGlobal(
            "fetch",
            routedFetch({
                "GET /v0/setup": () =>
                    json(statusWithProvider("default_agent_created", "docker", DOCKER_VERSION)),
            }),
        );
        const state = happyStateCreate({
            transport: createAuthenticatedTransport("http://server", "t"),
        });
        const { navigation, screen } = mount(state);

        await waitFor(() => expect(nameInput(screen).value).toBe("Happy"));
        expect(usernameInput(screen).value).toBe("happy");
        expect(screen.getByText(DEFAULT_AGENT_LUCKY_LABEL)).toBeTruthy();
        // The step description names the sandbox once; the exact provider
        // version already appeared when the sandbox was selected.
        expect(screen.getByText(/It runs inside the Docker sandbox\./)).toBeTruthy();
        expect(screen.container.querySelector('[data-happy2-ui="modal-overlay"]')).toBeNull();
        expect(screen.getByText("Registration")).toBeTruthy();
        expect(screen.getByText("Happy (2)")).toBeTruthy();
        const submit = screen.getByTestId("default-agent-submit") as HTMLButtonElement;
        expect(submit.form).toBe(agentForm(screen));
        await waitFor(() =>
            expect(navigation.get().primary).toMatchObject({
                kind: "onboarding",
                step: "default-agent",
            }),
        );
        state[Symbol.dispose]();
    });

    it("fills a valid preset identity from the 'feeling lucky' button", async () => {
        vi.stubGlobal(
            "fetch",
            routedFetch({
                "GET /v0/setup": () => json(serverStatus("default_agent_created")),
            }),
        );
        const state = happyStateCreate({
            transport: createAuthenticatedTransport("http://server", "t"),
        });
        const { screen } = mount(state);

        await waitFor(() => expect(nameInput(screen).value).toBe("Happy"));
        fireEvent.click(screen.getByText(DEFAULT_AGENT_LUCKY_LABEL));
        await waitFor(() => expect(nameInput(screen).value).not.toBe("Happy"));
        expect(DEFAULT_AGENT_PRESETS).toContainEqual({
            name: nameInput(screen).value,
            username: usernameInput(screen).value,
        });
        state[Symbol.dispose]();
    });

    it("blocks submission and the onboarding handoff until the identity is valid", async () => {
        let createCalls = 0;
        vi.stubGlobal(
            "fetch",
            routedFetch({
                "GET /v0/setup": () => json(serverStatus("default_agent_created")),
                "POST /v0/setup/createDefaultAgent": () => {
                    createCalls += 1;
                    return json({});
                },
            }),
        );
        const state = happyStateCreate({
            transport: createAuthenticatedTransport("http://server", "t"),
        });
        const { screen } = mount(state);

        await waitFor(() => expect(nameInput(screen).value).toBe("Happy"));
        fireEvent.input(nameInput(screen), { target: { value: "" } });
        fireEvent.input(usernameInput(screen), { target: { value: "No" } });
        fireEvent.click(screen.getByTestId("default-agent-submit"));

        expect(await screen.findByText("Enter a display name.")).toBeTruthy();
        expect(
            screen.getByText("Use 3–32 lowercase letters, digits, underscores, or hyphens."),
        ).toBeTruthy();
        expect(createCalls).toBe(0);
        state[Symbol.dispose]();
    });

    it("creates the chosen default agent from the pinned footer and advances", async () => {
        let createBody: { name: string; username: string } | undefined;
        vi.stubGlobal(
            "fetch",
            routedFetch({
                "GET /v0/setup": () => json(serverStatus("default_agent_created")),
                "POST /v0/setup/createDefaultAgent": (init) => {
                    createBody = JSON.parse(String(init.body));
                    return json({
                        agent: { id: "a1", name: "Mochi", username: "mochi_main", imageId: "img" },
                        onboarding: serverStatus("registration_policy_selected"),
                    });
                },
            }),
        );
        const state = happyStateCreate({
            transport: createAuthenticatedTransport("http://server", "t"),
        });
        const { screen } = mount(state);

        await waitFor(() => expect(nameInput(screen).value).toBe("Happy"));
        fireEvent.input(nameInput(screen), { target: { value: "Mochi" } });
        fireEvent.input(usernameInput(screen), { target: { value: "Mochi_Main" } });
        const submit = screen.getByTestId("default-agent-submit") as HTMLButtonElement;
        expect(submit.form).toBe(agentForm(screen));
        fireEvent.click(submit);

        expect(await screen.findByText("Open registration")).toBeTruthy();
        // The username is normalized to lowercase before it is submitted.
        expect(createBody).toEqual({ name: "Mochi", username: "mochi_main" });
        state[Symbol.dispose]();
    });

    it("creates the chosen default agent when Enter submits from a field", async () => {
        let createBody: { name: string; username: string } | undefined;
        vi.stubGlobal(
            "fetch",
            routedFetch({
                "GET /v0/setup": () => json(serverStatus("default_agent_created")),
                "POST /v0/setup/createDefaultAgent": (init) => {
                    createBody = JSON.parse(String(init.body));
                    return json({
                        agent: { id: "a1", name: "Mochi", username: "mochi_main", imageId: "img" },
                        onboarding: serverStatus("registration_policy_selected"),
                    });
                },
            }),
        );
        const state = happyStateCreate({
            transport: createAuthenticatedTransport("http://server", "t"),
        });
        const { screen } = mount(state);

        await waitFor(() => expect(nameInput(screen).value).toBe("Happy"));
        fireEvent.input(nameInput(screen), { target: { value: "Mochi" } });
        const username = usernameInput(screen);
        fireEvent.input(username, { target: { value: "Mochi_Main" } });
        fireEvent.keyDown(username, { key: "Enter", code: "Enter" });
        fireEvent.submit(username.form!);

        expect(await screen.findByText("Open registration")).toBeTruthy();
        expect(createBody).toEqual({ name: "Mochi", username: "mochi_main" });
        state[Symbol.dispose]();
    });

    it("shows setup-load errors and the retry action instead of hiding them behind loading", async () => {
        let statusCalls = 0;
        vi.stubGlobal(
            "fetch",
            routedFetch({
                "GET /v0/setup": () => {
                    statusCalls += 1;
                    return json(
                        { error: "unavailable", message: "Setup storage is unavailable" },
                        503,
                    );
                },
            }),
        );
        const state = happyStateCreate({
            transport: createAuthenticatedTransport("http://server", "t"),
        });
        const { screen } = mount(state);

        expect(await screen.findByText("Could not load setup")).toBeTruthy();
        expect(screen.getByText("Setup storage is unavailable")).toBeTruthy();
        const retry = screen.getByRole("button", { name: "Try again" });
        expect(screen.container.querySelector('[data-happy2-ui="onboarding-loader"]')).toBeNull();
        fireEvent.click(retry);
        await waitFor(() => expect(statusCalls).toBeGreaterThanOrEqual(2));
        state[Symbol.dispose]();
    });

    it("surfaces a username conflict, keeps the typed identity, and stays on the step", async () => {
        vi.stubGlobal(
            "fetch",
            routedFetch({
                "GET /v0/setup": () => json(serverStatus("default_agent_created")),
                "POST /v0/setup/createDefaultAgent": () =>
                    json(
                        {
                            error: "conflict",
                            message: "The default agent username is already taken",
                        },
                        409,
                    ),
            }),
        );
        const state = happyStateCreate({
            transport: createAuthenticatedTransport("http://server", "t"),
        });
        const { screen } = mount(state);

        await waitFor(() => expect(nameInput(screen).value).toBe("Happy"));
        fireEvent.input(nameInput(screen), { target: { value: "Mochi" } });
        fireEvent.input(usernameInput(screen), { target: { value: "mochi_main" } });
        fireEvent.submit(agentForm(screen));

        expect(await screen.findByText("The default agent username is already taken")).toBeTruthy();
        expect(nameInput(screen).value).toBe("Mochi");
        expect(usernameInput(screen).value).toBe("mochi_main");
        expect(screen.queryByText("Open registration")).toBeNull();
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
