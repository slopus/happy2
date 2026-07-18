import { happyStateCreate, type SetupSnapshot } from "happy2-state";
import { describe, expect, it } from "vitest";
import { createMockRigDaemon, MockSandboxProvider } from "happy2-gym/rig";
import { createGymServer, type GymServer, type GymUser } from "../../sources/index.js";
import { createGymStateTransport } from "../../sources/state/index.js";

const PASSWORD = "correct horse battery staple";

describe("setup onboarding across happy2-state and the real server", () => {
    it("selects a sandbox and custom image, reconciles live build progress, and completes setup", async () => {
        await withPasswordPepper(async () => {
            await using rig = await createMockRigDaemon();
            const provider = new MockSandboxProvider("docker", "Docker", {
                health: "healthy",
                detail: "Docker is ready in Gym.",
                version: "Docker gym 1.0",
            });
            provider.pauseBuilds();
            await using server = await createGymServer({
                databaseMode: "file",
                sandboxProviders: [provider],
                configure(config) {
                    config.auth.password.enabled = true;
                    config.agents.enabled = true;
                    config.agents.socketPath = rig.socketPath;
                    config.agents.tokenPath = rig.tokenPath;
                    config.agents.defaultCwd = rig.workspaceRoot;
                },
            });
            const admin = await bootstrapAdministrator(server);
            const transport = await createGymStateTransport(server, admin);
            await using state = happyStateCreate({ transport, sleep: async () => undefined });
            await state.syncStart();
            await transport.whenConnected();

            const setup = state.setup();
            await state.whenIdle();
            expect(readyStatus(setup.get())).toMatchObject({
                route: { scope: "server", step: "sandbox_provider_selected" },
            });

            state.setupProvidersReload();
            await state.whenIdle();
            expect(setup.get().providers).toMatchObject({
                type: "ready",
                value: {
                    recommendedProviderId: "docker",
                    providers: [
                        expect.objectContaining({
                            id: "docker",
                            health: "healthy",
                            version: "Docker gym 1.0",
                        }),
                    ],
                },
            });

            setup.sandboxProviderSelect("docker");
            await state.whenIdle();
            expect(readyStatus(setup.get())).toMatchObject({
                route: { scope: "server", step: "base_image_selected" },
            });

            state.setupBaseImagesReload();
            await state.whenIdle();
            expect(readyBaseImages(setup.get()).images).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ builtinKey: "daycare-minimal" }),
                    expect.objectContaining({ builtinKey: "daycare-full" }),
                ]),
            );

            const dockerfile = "FROM ubuntu:24.04\nRUN echo state-onboarding\n";
            setup.baseImageSelect({ custom: { name: "State onboarding", dockerfile } });
            await state.whenIdle();
            expect(provider.buildRequests).toEqual([expect.objectContaining({ dockerfile })]);
            expect(readyBaseImages(setup.get()).selectedImage).toMatchObject({
                name: "State onboarding",
                source: "custom",
                status: "building",
            });

            provider.emitBuildUpdate({ logChunk: "#2 installing tools\n", progress: 54 });
            await expect
                .poll(() => readyBaseImages(setup.get()).selectedImage, { timeout: 3_000 })
                .toMatchObject({
                    status: "building",
                    buildProgress: 54,
                    buildLog: expect.stringContaining("installing tools"),
                });

            provider.resumeBuilds();
            await expect
                .poll(() => readyBaseImages(setup.get()).selectedImage, { timeout: 3_000 })
                .toMatchObject({ status: "ready", buildProgress: 100 });
            await expect
                .poll(() => readyStatus(setup.get()).route, { timeout: 3_000 })
                .toEqual({ scope: "server", step: "registration_policy_selected" });

            setup.registrationPolicyChoose(false);
            await state.whenIdle();
            expect(readyStatus(setup.get())).toMatchObject({
                server: { complete: true, registration: "closed" },
                route: { scope: "user", step: "avatar" },
            });
        });
    });
});

async function bootstrapAdministrator(server: GymServer): Promise<GymUser> {
    const registration = await server.post("/v0/auth/password/register", {
        email: "state-setup@example.com",
        password: PASSWORD,
    });
    expect(registration.statusCode).toBe(201);
    const token = registration.json().token as string;
    const profile = await server.post(
        "/v0/me/createProfile",
        {
            firstName: "State",
            username: "state_setup_admin",
            email: "state-setup@example.com",
        },
        { headers: { authorization: `Bearer ${token}` } },
    );
    expect(profile.statusCode).toBe(201);
    expect(profile.json().user.role).toBe("admin");
    return { ...profile.json().user, accountId: "bootstrap-account", token } as GymUser;
}

function readyStatus(snapshot: SetupSnapshot) {
    if (snapshot.status.type !== "ready")
        throw new Error(`Expected ready setup status, received ${snapshot.status.type}`);
    return snapshot.status.value;
}

function readyBaseImages(snapshot: SetupSnapshot) {
    if (snapshot.baseImages.type !== "ready")
        throw new Error(`Expected ready base images, received ${snapshot.baseImages.type}`);
    return snapshot.baseImages.value;
}

async function withPasswordPepper(run: () => Promise<void>): Promise<void> {
    const previous = process.env.HAPPY2_PASSWORD_PEPPER;
    process.env.HAPPY2_PASSWORD_PEPPER = "gym-state-setup-password-pepper";
    try {
        await run();
    } finally {
        if (previous === undefined) delete process.env.HAPPY2_PASSWORD_PEPPER;
        else process.env.HAPPY2_PASSWORD_PEPPER = previous;
    }
}
