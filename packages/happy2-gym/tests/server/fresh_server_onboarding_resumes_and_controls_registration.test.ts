import { createClient } from "@libsql/client";
import { createDatabase, setupRecordOperationalStep } from "happy2-server";
import { describe, expect, it } from "vitest";
import { createGymServer, type GymRequestClient, type GymServer } from "../../sources/index.js";

const PASSWORD = "correct horse battery staple";

describe("fresh server onboarding resumes and controls registration", () => {
    it("persists every route decision, rejects out-of-order completion, and finishes closed", async () => {
        await withPasswordPepper(async () => {
            await using server = await createGymServer({
                databaseMode: "file",
                configure(config) {
                    config.auth.password.enabled = true;
                },
            });

            expect((await server.get("/v0/setup/status")).json()).toEqual({
                schemaVersion: 1,
                phase: "bootstrap_required",
                registration: "bootstrap",
            });
            expect((await server.get("/v0/setup")).statusCode).toBe(401);
            expect((await server.get("/v0/auth/methods")).json()).toMatchObject({
                signupEnabled: true,
                registration: "bootstrap",
            });

            const bootstrap = await register(server, "bootstrap@example.com");
            expect(bootstrap.response.statusCode).toBe(201);
            expect((await server.get("/v0/setup/status")).json()).toMatchObject({
                phase: "bootstrap_required",
                registration: "closed",
            });
            expect(
                (await register(server, "blocked-before-setup@example.com")).response.statusCode,
            ).toBe(403);

            const provisional = tokenClient(server, bootstrap.token);
            expect((await provisional.get("/v0/setup")).json()).toMatchObject({
                server: { complete: false, canManage: true, registration: "closed" },
                user: { profile: "pending", complete: false },
                route: { scope: "profile", step: "profile" },
                complete: false,
            });
            const profile = await provisional.post("/v0/me/createProfile", {
                firstName: "Bootstrap",
                lastName: "Administrator",
                username: "bootstrap_admin",
                email: "bootstrap@example.com",
            });
            expect(profile.statusCode).toBe(201);
            expect(profile.json().user).toMatchObject({
                username: "bootstrap_admin",
                role: "admin",
            });
            const adminId = profile.json().user.id as string;
            const baseline = (await provisional.get("/v0/sync/state")).json().state;
            expect((await provisional.get("/v0/setup")).json()).toMatchObject({
                server: {
                    complete: false,
                    canManage: true,
                    steps: { bootstrap_administrator: { state: "complete" } },
                },
                route: { scope: "server", step: "sandbox_provider_selected" },
            });

            await server.restart();
            expect((await provisional.get("/v0/setup")).json()).toMatchObject({
                route: { scope: "server", step: "sandbox_provider_selected" },
                server: { registration: "closed" },
            });
            const premature = await provisional.post("/v0/setup/chooseRegistrationPolicy", {
                enabled: false,
            });
            expect(premature.statusCode).toBe(409);
            expect(premature.json()).toMatchObject({
                error: "conflict",
                message: expect.stringContaining("base_image_ready"),
            });

            await failProviderSelection(server, adminId);
            expect((await provisional.get("/v0/setup")).json()).toMatchObject({
                server: {
                    steps: {
                        sandbox_provider_selected: {
                            state: "failed",
                            metadata: { provider: "docker" },
                            lastError: "Docker daemon is unavailable",
                        },
                    },
                },
                route: { scope: "server", step: "sandbox_provider_selected" },
            });
            await server.restart();
            expect((await provisional.get("/v0/setup")).json()).toMatchObject({
                server: {
                    steps: {
                        sandbox_provider_selected: {
                            state: "failed",
                            lastError: "Docker daemon is unavailable",
                        },
                    },
                },
            });
            await completeServerPrerequisites(server, adminId);
            const selected = await provisional.post("/v0/setup/chooseRegistrationPolicy", {
                enabled: false,
            });
            expect(selected.statusCode).toBe(200);
            expect(selected.json()).toMatchObject({
                sync: { areas: ["setup"] },
                onboarding: {
                    server: { complete: true, registration: "closed" },
                    route: { scope: "user", step: "avatar" },
                },
            });
            expect((await server.get("/v0/setup/status")).json()).toEqual({
                schemaVersion: 1,
                phase: "complete",
                registration: "closed",
            });
            expect(
                (await register(server, "blocked-after-setup@example.com")).response.statusCode,
            ).toBe(403);

            const avatarWithoutFile = await provisional.post("/v0/me/updateOnboardingStep", {
                step: "avatar",
                state: "complete",
            });
            expect(avatarWithoutFile.statusCode).toBe(409);
            const skippedAvatar = await provisional.post("/v0/me/updateOnboardingStep", {
                step: "avatar",
                state: "skipped",
            });
            expect(skippedAvatar.statusCode).toBe(200);
            expect(skippedAvatar.json().sync).toMatchObject({ areas: ["user-onboarding"] });
            expect(
                (
                    await provisional.post("/v0/me/updateOnboardingStep", {
                        step: "desktop_notifications",
                        state: "skipped",
                    })
                ).statusCode,
            ).toBe(200);
            expect(
                (
                    await provisional.post("/v0/me/updateOnboardingStep", {
                        step: "desktop_notifications",
                        state: "complete",
                    })
                ).statusCode,
            ).toBe(200);
            expect((await provisional.get("/v0/setup")).json()).toMatchObject({
                server: { complete: true, registration: "closed" },
                user: {
                    complete: true,
                    steps: {
                        avatar: { state: "skipped" },
                        desktop_notifications: { state: "complete" },
                    },
                },
                route: { scope: "complete" },
                complete: true,
            });

            const difference = await provisional.post("/v0/sync/getDifference", {
                state: baseline,
                limit: 100,
            });
            expect(difference.statusCode).toBe(200);
            expect(difference.json().areas).toEqual(
                expect.arrayContaining(["setup", "user-onboarding"]),
            );

            await server.restart();
            expect((await provisional.get("/v0/setup")).json()).toMatchObject({
                route: { scope: "complete" },
                complete: true,
                server: { registration: "closed" },
            });
        });
    });

    it("opens registration only after the administrator's final choice", async () => {
        await withPasswordPepper(async () => {
            await using server = await createGymServer({
                databaseMode: "file",
                configure(config) {
                    config.auth.password.enabled = true;
                },
            });
            const bootstrap = await register(server, "open-admin@example.com");
            const admin = tokenClient(server, bootstrap.token);
            const profile = await admin.post("/v0/me/createProfile", {
                firstName: "Open",
                username: "open_admin",
                email: "open-admin@example.com",
            });
            const adminId = profile.json().user.id as string;
            await completeServerPrerequisites(server, adminId);
            expect(
                (
                    await admin.post("/v0/setup/chooseRegistrationPolicy", {
                        enabled: true,
                    })
                ).statusCode,
            ).toBe(200);
            expect((await server.get("/v0/auth/methods")).json()).toMatchObject({
                signupEnabled: true,
                registration: "open",
            });

            const memberRegistration = await register(server, "member@example.com");
            expect(memberRegistration.response.statusCode).toBe(201);
            const member = tokenClient(server, memberRegistration.token);
            const memberProfile = await member.post("/v0/me/createProfile", {
                firstName: "Member",
                username: "onboarding_member",
                email: "member@example.com",
            });
            expect(memberProfile.statusCode).toBe(201);
            expect(memberProfile.json().user.role).toBe("member");
            expect((await member.get("/v0/setup")).json()).toMatchObject({
                server: { complete: true, canManage: false, registration: "open" },
                route: { scope: "user", step: "avatar" },
            });
            expect(
                (
                    await member.post("/v0/setup/chooseRegistrationPolicy", {
                        enabled: true,
                    })
                ).statusCode,
            ).toBe(403);
            expect(
                (
                    await admin.post("/v0/setup/chooseRegistrationPolicy", {
                        enabled: false,
                    })
                ).statusCode,
            ).toBe(409);
        });
    });
});

async function completeServerPrerequisites(server: GymServer, actorUserId: string): Promise<void> {
    const client = createClient({ url: server.config.database.url });
    try {
        const executor = createDatabase(client);
        for (const step of [
            "sandbox_provider_selected",
            "sandbox_provider_validated",
            "base_image_selected",
            "base_image_build_requested",
            "base_image_ready",
        ] as const)
            for (const state of ["in_progress", "complete"] as const)
                await setupRecordOperationalStep(executor, { step, state, actorUserId });
    } finally {
        client.close();
    }
}

async function failProviderSelection(server: GymServer, actorUserId: string): Promise<void> {
    const client = createClient({ url: server.config.database.url });
    try {
        const executor = createDatabase(client);
        await setupRecordOperationalStep(executor, {
            step: "sandbox_provider_selected",
            state: "in_progress",
            actorUserId,
            metadata: { provider: "docker", progress: 0 },
        });
        expect(
            await setupRecordOperationalStep(executor, {
                step: "sandbox_provider_selected",
                state: "in_progress",
                actorUserId,
                metadata: { provider: "docker", progress: 25 },
            }),
        ).toMatchObject({ areas: ["setup"] });
        await setupRecordOperationalStep(executor, {
            step: "sandbox_provider_selected",
            state: "failed",
            actorUserId,
            metadata: { provider: "docker" },
            lastError: "Docker daemon is unavailable",
        });
    } finally {
        client.close();
    }
}

async function register(
    server: GymServer,
    email: string,
): Promise<{ response: Awaited<ReturnType<GymServer["post"]>>; token: string }> {
    const response = await server.post("/v0/auth/password/register", {
        email,
        password: PASSWORD,
    });
    return { response, token: response.json().token as string };
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

async function withPasswordPepper(run: () => Promise<void>): Promise<void> {
    const previous = process.env.HAPPY2_PASSWORD_PEPPER;
    process.env.HAPPY2_PASSWORD_PEPPER = "gym-onboarding-password-pepper";
    try {
        await run();
    } finally {
        if (previous === undefined) delete process.env.HAPPY2_PASSWORD_PEPPER;
        else process.env.HAPPY2_PASSWORD_PEPPER = previous;
    }
}
