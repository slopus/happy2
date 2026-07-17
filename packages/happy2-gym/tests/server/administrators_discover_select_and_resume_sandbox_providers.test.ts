import { describe, expect, it } from "vitest";
import { createMockRigDaemon, MockSandboxProvider, type MockRigDaemon } from "happy2-gym/rig";
import { createGymServer, type GymRequestClient, type GymServer } from "../../sources/index.js";

const PASSWORD = "correct horse battery staple";

describe("administrators discover, select, and resume sandbox providers", () => {
    it("authenticates administrators before probing or exposing provider details", async () => {
        const docker = healthyProvider("docker", "Docker");
        const podman = healthyProvider("podman", "Podman");
        await using server = await createGymServer({ sandboxProviders: [docker, podman] });
        await server.createUser({ username: "provider_admin" });
        const member = await server.createUser({ username: "provider_member" });
        const probeCount = docker.probeCount + podman.probeCount;

        for (const response of [
            await server.get("/v0/setup/sandboxProviders"),
            await server.post("/v0/setup/selectSandboxProvider", { providerId: "docker" }),
        ]) {
            expect(response.statusCode).toBe(401);
            expect(response.json()).toEqual({ error: "unauthorized" });
        }
        for (const response of [
            await server.as(member).get("/v0/setup/sandboxProviders"),
            await server
                .as(member)
                .post("/v0/setup/selectSandboxProvider", { providerId: "docker" }),
        ]) {
            expect(response.statusCode).toBe(403);
            expect(response.json()).toEqual({
                error: "forbidden",
                message: "Server administrator permission is required",
            });
        }
        expect(docker.probeCount + podman.probeCount).toBe(probeCount);
    });

    it.each([
        { selectedId: "docker", unavailableId: "podman", selectedName: "Docker" },
        { selectedId: "podman", unavailableId: "docker", selectedName: "Podman" },
    ])("recommends and persists the sole healthy $selectedName provider", async (scenario) => {
        await withPasswordPepper(async () => {
            const selected = healthyProvider(scenario.selectedId, scenario.selectedName);
            const unavailable = unavailableProvider(scenario.unavailableId);
            await using server = await createGymServer({
                databaseMode: "file",
                sandboxProviders: [selected, unavailable],
                configure(config) {
                    config.auth.password.enabled = true;
                },
            });
            const admin = await bootstrapAdministrator(server, `only-${scenario.selectedId}`);

            const discoveryResponse = await admin.client.get("/v0/setup/sandboxProviders");
            expect(discoveryResponse.statusCode).toBe(200);
            expect(discoveryResponse.json()).toMatchObject({
                executionNotice: expect.stringContaining("agent code inside"),
                recommendedProviderId: scenario.selectedId,
                providers: expect.arrayContaining([
                    expect.objectContaining({ id: scenario.selectedId, health: "healthy" }),
                    expect.objectContaining({ id: scenario.unavailableId, health: "unavailable" }),
                ]),
            });

            const chosen = await admin.client.post("/v0/setup/selectSandboxProvider", {
                providerId: scenario.selectedId,
            });
            expect(chosen.statusCode).toBe(200);
            expect(chosen.json()).toMatchObject({
                provider: { id: scenario.selectedId, health: "healthy" },
                sync: { areas: ["setup"] },
                onboarding: {
                    route: { scope: "server", step: "base_image_selected" },
                    server: {
                        steps: {
                            sandbox_provider_selected: {
                                state: "complete",
                                metadata: { providerId: scenario.selectedId },
                            },
                            sandbox_provider_validated: {
                                state: "complete",
                                metadata: {
                                    providerId: scenario.selectedId,
                                    version: `${scenario.selectedName} gym 1.0`,
                                },
                            },
                        },
                    },
                },
            });
            const idempotent = await admin.client.post("/v0/setup/selectSandboxProvider", {
                providerId: scenario.selectedId,
            });
            expect(idempotent.statusCode).toBe(200);
            expect(idempotent.json()).not.toHaveProperty("sync");

            await server.restart();
            expect((await admin.client.get("/v0/setup/sandboxProviders")).json()).toMatchObject({
                selectedProviderId: scenario.selectedId,
            });
            expect((await admin.client.get("/v0/setup")).json()).toMatchObject({
                route: { scope: "server", step: "base_image_selected" },
                server: {
                    steps: {
                        sandbox_provider_selected: {
                            state: "complete",
                            metadata: { providerId: scenario.selectedId },
                        },
                    },
                },
            });
        });
    });

    it("requires an explicit choice when both providers are healthy", async () => {
        await withPasswordPepper(async () => {
            const docker = healthyProvider("docker", "Docker");
            const podman = healthyProvider("podman", "Podman");
            await using server = await createGymServer({
                sandboxProviders: [docker, podman],
                configure(config) {
                    config.auth.password.enabled = true;
                },
            });
            const admin = await bootstrapAdministrator(server, "both-providers");
            const discovery = (await admin.client.get("/v0/setup/sandboxProviders")).json();
            expect(discovery).not.toHaveProperty("recommendedProviderId");
            expect(discovery.providers).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ id: "docker", health: "healthy" }),
                    expect.objectContaining({ id: "podman", health: "healthy" }),
                ]),
            );
            expect((await admin.client.get("/v0/setup")).json()).toMatchObject({
                route: { scope: "server", step: "sandbox_provider_selected" },
            });
            expect(
                (await admin.client.post("/v0/setup/selectSandboxProvider", {})).statusCode,
            ).toBe(400);
            expect(
                (
                    await admin.client.post("/v0/setup/selectSandboxProvider", {
                        providerId: "podman",
                    })
                ).statusCode,
            ).toBe(200);
            const replacement = await admin.client.post("/v0/setup/selectSandboxProvider", {
                providerId: "docker",
            });
            expect(replacement.statusCode).toBe(409);
            expect(replacement.json()).toMatchObject({
                error: "conflict",
                message: "A sandbox provider was already selected",
            });
        });
    });

    it("returns actionable unavailable, unhealthy, and timeout states without persisting a choice", async () => {
        await withPasswordPepper(async () => {
            const docker = new MockSandboxProvider("docker", "Docker", {
                health: "unhealthy",
                detail: "Docker is installed, but its daemon is stopped.",
                remediation: "Start Docker Desktop, then try again.",
                version: "Docker gym 1.0",
            });
            const podman = unavailableProvider("podman");
            await using server = await createGymServer({
                sandboxProviders: [docker, podman],
                configure(config) {
                    config.auth.password.enabled = true;
                },
            });
            const admin = await bootstrapAdministrator(server, "broken-providers");
            const discovery = (await admin.client.get("/v0/setup/sandboxProviders")).json();
            expect(discovery).not.toHaveProperty("recommendedProviderId");
            expect(discovery.providers).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        id: "docker",
                        health: "unhealthy",
                        remediation: expect.stringContaining("Start Docker"),
                    }),
                    expect.objectContaining({ id: "podman", health: "unavailable" }),
                ]),
            );
            const rejected = await admin.client.post("/v0/setup/selectSandboxProvider", {
                providerId: "docker",
            });
            expect(rejected.statusCode).toBe(409);
            expect(rejected.json()).toMatchObject({
                error: "sandbox_provider_unavailable",
                provider: { id: "docker", health: "unhealthy" },
            });
            expect((await admin.client.get("/v0/setup")).json()).toMatchObject({
                route: { scope: "server", step: "sandbox_provider_selected" },
                server: { steps: { sandbox_provider_selected: { state: "pending" } } },
            });

            docker.setStatus({
                health: "timed_out",
                detail: "Docker version probe exceeded its time limit.",
                remediation: "Restart Docker Desktop, then try again.",
            });
            expect((await admin.client.get("/v0/setup/sandboxProviders")).json()).toMatchObject({
                providers: expect.arrayContaining([
                    expect.objectContaining({ id: "docker", health: "timed_out" }),
                ]),
            });
        });
    });

    it("lists installation remediation when neither local provider exists", async () => {
        await withPasswordPepper(async () => {
            const docker = unavailableProvider("docker");
            const podman = unavailableProvider("podman");
            await using server = await createGymServer({
                sandboxProviders: [docker, podman],
                configure(config) {
                    config.auth.password.enabled = true;
                },
            });
            const admin = await bootstrapAdministrator(server, "no-providers");
            const discovery = (await admin.client.get("/v0/setup/sandboxProviders")).json();
            expect(discovery).not.toHaveProperty("recommendedProviderId");
            expect(discovery.providers).toEqual([
                expect.objectContaining({
                    id: "docker",
                    health: "unavailable",
                    remediation: expect.stringContaining("Install Docker"),
                }),
                expect.objectContaining({
                    id: "podman",
                    health: "unavailable",
                    remediation: expect.stringContaining("Install Podman"),
                }),
            ]);
        });
    });

    it("routes image builds and sandbox creation through the durable selected provider", async () => {
        await withPasswordPepper(async () => {
            await using rig = await createMockRigDaemon();
            const docker = healthyProvider("docker", "Docker");
            const podman = healthyProvider("podman", "Podman");
            await using server = await providerAgentServer(rig, [docker, podman]);
            const admin = await bootstrapAdministrator(server, "selected-runtime");
            expect(
                (
                    await admin.client.post("/v0/setup/selectSandboxProvider", {
                        providerId: "podman",
                    })
                ).statusCode,
            ).toBe(200);

            const images = (await admin.client.get("/v0/admin/agentImages")).json()
                .images as Array<{
                builtinKey?: string;
                id: string;
                status: string;
            }>;
            const minimal = images.find(({ builtinKey }) => builtinKey === "daycare-minimal")!;
            expect(
                (await admin.client.post(`/v0/admin/agentImages/${minimal.id}/buildImage`, {}))
                    .statusCode,
            ).toBe(202);
            await waitFor(
                () => podman.buildRequests.length === 1,
                "selected Podman provider to receive the image build",
            );
            await waitFor(async () => {
                const current = (
                    (await admin.client.get("/v0/admin/agentImages")).json().images as Array<{
                        id: string;
                        status: string;
                    }>
                ).find(({ id }) => id === minimal.id);
                return current?.status === "ready";
            }, "selected provider image build to finish");
            expect(docker.buildRequests).toEqual([]);
            expect(
                (await admin.client.post(`/v0/admin/agentImages/${minimal.id}/setDefaultImage`, {}))
                    .statusCode,
            ).toBe(200);
            expect(
                (
                    await admin.client.post("/v0/chats/createAgent", {
                        name: "Podman Agent",
                        username: "podman_agent",
                    })
                ).statusCode,
            ).toBe(201);
            expect(podman.createdContainers).toHaveLength(1);
            expect(docker.createdContainers).toEqual([]);

            await server.restart();
            expect((await admin.client.get("/v0/setup/sandboxProviders")).json()).toMatchObject({
                selectedProviderId: "podman",
            });
        });
    });
});

function healthyProvider(id: string, name: string): MockSandboxProvider {
    return new MockSandboxProvider(id, name, {
        health: "healthy",
        detail: `${name} is ready.`,
        version: `${name} gym 1.0`,
    });
}

function unavailableProvider(id: string): MockSandboxProvider {
    const name = id === "docker" ? "Docker" : "Podman";
    return new MockSandboxProvider(id, name, {
        health: "unavailable",
        detail: `${name} is not installed.`,
        remediation: `Install ${name}, then try again.`,
    });
}

async function bootstrapAdministrator(
    server: GymServer,
    suffix: string,
): Promise<{ client: GymRequestClient; id: string }> {
    const registration = await server.post("/v0/auth/password/register", {
        email: `${suffix}@example.com`,
        password: PASSWORD,
    });
    expect(registration.statusCode).toBe(201);
    const client = tokenClient(server, registration.json().token as string);
    const profile = await client.post("/v0/me/createProfile", {
        firstName: "Sandbox",
        username: `sandbox_${suffix.replaceAll("-", "_")}`,
        email: `${suffix}@example.com`,
    });
    expect(profile.statusCode).toBe(201);
    expect(profile.json().user.role).toBe("admin");
    return { client, id: profile.json().user.id as string };
}

function tokenClient(server: GymServer, token: string): GymRequestClient {
    return {
        request: (options) =>
            server.request({
                ...options,
                headers: { ...options.headers, authorization: `Bearer ${token}` },
            }),
        get: (url, options = {}) =>
            server.get(url, {
                ...options,
                headers: { ...options.headers, authorization: `Bearer ${token}` },
            }),
        post: (url, payload, options = {}) =>
            server.post(url, payload, {
                ...options,
                headers: { ...options.headers, authorization: `Bearer ${token}` },
            }),
    };
}

function providerAgentServer(
    rig: MockRigDaemon,
    sandboxProviders: readonly MockSandboxProvider[],
): Promise<GymServer> {
    return createGymServer({
        databaseMode: "file",
        sandboxProviders,
        configure(config) {
            config.auth.password.enabled = true;
            config.agents.enabled = true;
            config.agents.socketPath = rig.socketPath;
            config.agents.tokenPath = rig.tokenPath;
            config.agents.defaultCwd = rig.workspaceRoot;
        },
    });
}

async function waitFor(
    check: () => boolean | Promise<boolean>,
    description: string,
    timeoutMs = 5_000,
): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    do {
        if (await check()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    } while (Date.now() < deadline);
    throw new Error(`Timed out waiting for ${description}`);
}

async function withPasswordPepper(run: () => Promise<void>): Promise<void> {
    const previous = process.env.HAPPY2_PASSWORD_PEPPER;
    process.env.HAPPY2_PASSWORD_PEPPER = "gym-sandbox-provider-password-pepper";
    try {
        await run();
    } finally {
        if (previous === undefined) delete process.env.HAPPY2_PASSWORD_PEPPER;
        else process.env.HAPPY2_PASSWORD_PEPPER = previous;
    }
}
