import { createClient } from "@libsql/client";
import { describe, expect, it } from "vitest";
import { createMockRigDaemon, MockSandboxProvider, type MockRigDaemon } from "happy2-gym/rig";
import { createGymServer, type GymRequestClient, type GymServer } from "../../sources/index.js";

const PASSWORD = "correct horse battery staple";

interface BaseImage {
    id: string;
    builtinKey?: "daycare-full" | "daycare-minimal";
    buildLabel: "Build" | "Download and build";
    buildMode: "build" | "download_and_build";
    source: "builtin" | "custom";
    status: "pending" | "building" | "ready" | "failed";
    buildAttempt: number;
    buildProgress: number;
    lastBuildLogLine?: string;
    lastError?: string;
}

interface BaseImageDetails extends BaseImage {
    buildLog: string;
    buildLogTruncated: boolean;
    dockerImageId?: string;
}

interface BaseImageStatus {
    defaultImageId?: string;
    images: BaseImage[];
    selectedImage?: BaseImageDetails;
    selectedImageId?: string;
}

describe("administrators select, build, retry, and resume onboarding base images", () => {
    it("resumes one durable progress screen after restart and promotes the ready default exactly once", async () => {
        await withPasswordPepper(async () => {
            await using rig = await createMockRigDaemon();
            const provider = healthyProvider();
            provider.pauseBuilds();
            await using server = await providerAgentServer(rig, provider);
            const admin = await bootstrapAdministrator(server, "resume");
            await selectProvider(admin);

            expect((await server.get("/v0/setup/baseImages")).statusCode).toBe(401);
            const initial = await baseImages(admin);
            expect(initial.selectedImageId).toBeUndefined();
            expect(initial.images).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        builtinKey: "daycare-minimal",
                        source: "builtin",
                        buildMode: "download_and_build",
                        buildLabel: "Download and build",
                    }),
                    expect.objectContaining({ builtinKey: "daycare-full" }),
                ]),
            );

            const selected = await admin.post("/v0/setup/selectBaseImage", {
                builtinKey: "daycare-minimal",
            });
            expect(selected.statusCode).toBe(202);
            expect(selected.json()).toMatchObject({
                sync: { areas: ["setup", "agent-images"] },
                onboarding: { route: { scope: "server", step: "base_image_ready" } },
                baseImages: {
                    selectedImage: {
                        builtinKey: "daycare-minimal",
                        buildMode: "download_and_build",
                    },
                },
            });
            await waitFor(() => provider.buildRequests.length === 1, "the first image build");
            provider.emitBuildUpdate({
                logChunk: "#1 downloading pinned Daycare context\n",
                progress: 42,
            });
            await waitFor(async () => {
                const current = (await baseImages(admin)).selectedImage;
                return current?.buildProgress === 42 && current.buildLog.includes("downloading");
            }, "persisted image progress and logs");

            const crashLease = createClient({ url: server.config.database.url });
            try {
                await server.restart({
                    beforeStart: async () => {
                        await crashLease.execute({
                            sql: `UPDATE agent_images
                                SET worker_id = 'crashed-worker', lease_expires_at = ?
                                WHERE id = ? AND status = 'building'`,
                            args: [
                                new Date(Date.now() + 750).toISOString(),
                                selected.json().baseImages.selectedImage.id as string,
                            ],
                        });
                    },
                });
            } finally {
                crashLease.close();
            }
            await new Promise((resolve) => setTimeout(resolve, 50));
            expect(provider.buildRequests).toHaveLength(1);
            await waitFor(
                () => provider.buildRequests.length === 2,
                "the crash-interrupted build lease to expire and be reclaimed",
            );
            const resumed = await baseImages(admin);
            expect(resumed.selectedImageId).toBe(resumed.selectedImage?.id);
            expect(resumed.selectedImage).toMatchObject({
                status: "building",
                buildProgress: 42,
                buildLog: expect.stringContaining("downloading pinned Daycare context"),
            });
            expect((await admin.get("/v0/setup")).json()).toMatchObject({
                route: { scope: "server", step: "base_image_ready" },
            });

            const baseUrl = await server.listen();
            const realtimeAbort = new AbortController();
            const realtimeResponse = await fetch(`${baseUrl}/v0/sync/events`, {
                headers: { authorization: `Bearer ${admin.token}` },
                signal: realtimeAbort.signal,
            });
            const realtime = new SseFrames(realtimeResponse.body!.getReader());
            expect((await realtime.next()).name).toBe("ready");
            provider.resumeBuilds();
            const completion = await realtime.until(
                (frame) =>
                    frame.name === "sync" &&
                    (frame.data as { areas?: string[] }).areas?.includes("setup") === true &&
                    (frame.data as { areas?: string[] }).areas?.includes("agent-images") === true,
            );
            expect(completion.data).toMatchObject({ areas: ["setup", "agent-images"] });
            realtimeAbort.abort();
            await realtime.cancel();

            const ready = await waitForSelectedStatus(admin, "ready");
            expect(ready.buildProgress).toBe(100);
            expect(ready.buildLog).toContain("#2 DONE");
            const completedOnboarding = (await admin.get("/v0/setup")).json();
            expect(completedOnboarding).toMatchObject({
                route: { scope: "server", step: "registration_policy_selected" },
                server: {
                    steps: {
                        base_image_selected: { state: "complete" },
                        base_image_build_requested: { state: "complete" },
                        base_image_ready: {
                            state: "complete",
                            metadata: { imageId: ready.id, reused: false },
                        },
                    },
                },
            });
            expect((await baseImages(admin)).defaultImageId).toBe(ready.id);
            const completedAt = completedOnboarding.server.steps.base_image_ready.completedAt;

            const repeated = await admin.post("/v0/setup/selectBaseImage", {
                builtinKey: "daycare-minimal",
            });
            expect(repeated.statusCode).toBe(200);
            expect(repeated.json()).not.toHaveProperty("sync");
            expect(provider.buildRequests).toHaveLength(2);
            expect(
                (await admin.get("/v0/setup")).json().server.steps.base_image_ready.completedAt,
            ).toBe(completedAt);
            expect(
                (
                    await admin.post("/v0/setup/chooseRegistrationPolicy", {
                        enabled: true,
                    })
                ).statusCode,
            ).toBe(200);

            const invariantProbe = createClient({ url: server.config.database.url });
            try {
                await invariantProbe.execute(
                    "UPDATE agent_image_settings SET default_image_id = NULL WHERE id = 1",
                );
                const idempotent = await admin.post("/v0/setup/chooseRegistrationPolicy", {
                    enabled: true,
                });
                expect(idempotent.statusCode, idempotent.body).toBe(200);
                expect(idempotent.json()).not.toHaveProperty("sync");
                await invariantProbe.execute({
                    sql: "UPDATE agent_image_settings SET default_image_id = ? WHERE id = 1",
                    args: [ready.id],
                });
            } finally {
                invariantProbe.close();
            }
            const member = await registerActiveMember(server);
            const memberCatalog = await member.get("/v0/setup/baseImages");
            expect(memberCatalog.statusCode, memberCatalog.body).toBe(403);
            expect(
                (
                    await member.post("/v0/setup/selectBaseImage", {
                        builtinKey: "daycare-minimal",
                    })
                ).statusCode,
            ).toBe(403);
            expect((await member.post("/v0/setup/retryBaseImageBuild", {})).statusCode).toBe(403);
        });
    });

    it("reuses a cached immutable custom definition without starting another build", async () => {
        await withPasswordPepper(async () => {
            await using rig = await createMockRigDaemon();
            const provider = healthyProvider();
            await using server = await providerAgentServer(rig, provider);
            const admin = await bootstrapAdministrator(server, "custom");
            await selectProvider(admin);
            const dockerfile = "FROM ubuntu:24.04\nRUN echo cached-onboarding-image\n";
            const created = await admin.post("/v0/admin/agentImages/createImage", {
                name: "Cached tools",
                dockerfile,
            });
            expect(created.statusCode).toBe(202);
            const cachedId = created.json().image.id as string;
            await waitFor(async () => {
                const image = (await baseImages(admin)).images.find(({ id }) => id === cachedId);
                return image?.status === "ready";
            }, "the cached custom image build");
            expect(provider.buildRequests).toHaveLength(1);

            const selected = await admin.post("/v0/setup/selectBaseImage", {
                custom: { name: "Same immutable tools", dockerfile },
            });
            expect(selected.statusCode).toBe(200);
            expect(selected.json()).toMatchObject({
                baseImages: {
                    defaultImageId: cachedId,
                    selectedImageId: cachedId,
                    selectedImage: {
                        id: cachedId,
                        source: "custom",
                        buildMode: "build",
                        buildLabel: "Build",
                        status: "ready",
                    },
                },
                onboarding: {
                    route: { scope: "server", step: "registration_policy_selected" },
                    server: {
                        steps: { base_image_ready: { metadata: { reused: true } } },
                    },
                },
            });
            expect(provider.buildRequests).toHaveLength(1);
            expect(
                (
                    await admin.post("/v0/setup/selectBaseImage", {
                        builtinKey: "daycare-full",
                    })
                ).statusCode,
            ).toBe(409);
        });
    });

    it("creates, builds, and promotes a fresh custom definition through setup", async () => {
        await withPasswordPepper(async () => {
            await using rig = await createMockRigDaemon();
            const provider = healthyProvider();
            await using server = await providerAgentServer(rig, provider);
            const admin = await bootstrapAdministrator(server, "fresh_custom");
            await selectProvider(admin);
            const dockerfile = "FROM ubuntu:24.04\nRUN echo fresh-onboarding-image\n";

            const selected = await admin.post("/v0/setup/selectBaseImage", {
                custom: { name: "Fresh tools", dockerfile },
            });
            expect(selected.statusCode).toBe(202);
            expect(selected.json()).toMatchObject({
                baseImages: {
                    selectedImage: {
                        source: "custom",
                        buildMode: "build",
                        buildLabel: "Build",
                    },
                },
                onboarding: { route: { scope: "server", step: "base_image_ready" } },
            });
            const selectedId = selected.json().baseImages.selectedImage.id as string;
            const ready = await waitForSelectedStatus(admin, "ready");
            expect(ready.id).toBe(selectedId);
            expect(provider.buildRequests).toEqual([expect.objectContaining({ dockerfile })]);
            expect((await baseImages(admin)).defaultImageId).toBe(selectedId);
        });
    });

    it("rejects ambiguous, unsupported, unexpected, and oversized base image selections", async () => {
        await withPasswordPepper(async () => {
            await using rig = await createMockRigDaemon();
            const provider = healthyProvider();
            await using server = await providerAgentServer(rig, provider);
            const admin = await bootstrapAdministrator(server, "validation");
            await selectProvider(admin);

            const invalidSelections = [
                {},
                {
                    builtinKey: "daycare-minimal",
                    custom: { name: "Both", dockerfile: "FROM scratch" },
                },
                { builtinKey: "unsupported" },
                {
                    custom: {
                        name: "Unexpected",
                        dockerfile: "FROM scratch",
                        extra: true,
                    },
                },
                {
                    custom: {
                        name: "Too large",
                        dockerfile: `FROM scratch\n# ${"x".repeat(256 * 1024)}`,
                    },
                },
            ];
            for (const selection of invalidSelections) {
                const response = await admin.post("/v0/setup/selectBaseImage", selection);
                expect(response.statusCode, response.body).toBe(400);
            }
            expect(provider.buildRequests).toEqual([]);
            expect((await baseImages(admin)).selectedImageId).toBeUndefined();
        });
    });

    it("keeps setup gated on build failure and retries the same selected image", async () => {
        await withPasswordPepper(async () => {
            await using rig = await createMockRigDaemon();
            const provider = healthyProvider();
            provider.failNextBuildWith({
                cause: null,
                message: "Daycare package download failed",
            });
            await using server = await providerAgentServer(rig, provider);
            const admin = await bootstrapAdministrator(server, "retry");
            await selectProvider(admin);
            expect(
                (
                    await admin.post("/v0/setup/selectBaseImage", {
                        builtinKey: "daycare-full",
                    })
                ).statusCode,
            ).toBe(202);

            const failed = await waitForSelectedStatus(admin, "failed");
            expect(failed.lastError).toContain("Daycare package download failed");
            expect(failed.buildLog).toContain("Daycare package download failed");
            expect((await baseImages(admin)).defaultImageId).toBeUndefined();
            expect((await admin.get("/v0/setup")).json()).toMatchObject({
                route: { scope: "server", step: "base_image_ready" },
                server: {
                    steps: {
                        base_image_ready: {
                            state: "failed",
                            lastError: expect.stringContaining("Daycare package download failed"),
                        },
                    },
                },
            });
            expect(
                (
                    await admin.post("/v0/setup/chooseRegistrationPolicy", {
                        enabled: true,
                    })
                ).statusCode,
            ).toBe(409);

            const retried = await admin.post("/v0/setup/retryBaseImageBuild", {});
            expect(retried.statusCode).toBe(202);
            expect(retried.json()).toMatchObject({
                sync: { areas: ["setup", "agent-images"] },
                baseImages: { selectedImage: { id: failed.id } },
            });
            expect(["pending", "building"]).toContain(
                retried.json().baseImages.selectedImage.status,
            );
            const ready = await waitForSelectedStatus(admin, "ready");
            expect(ready.id).toBe(failed.id);
            expect(ready.buildAttempt).toBe(2);
            expect((await baseImages(admin)).defaultImageId).toBe(failed.id);
            expect((await admin.post("/v0/setup/retryBaseImageBuild", {})).statusCode).toBe(409);
        });
    });

    it("rolls back default promotion failures before exposing a retryable setup failure", async () => {
        await withPasswordPepper(async () => {
            await using rig = await createMockRigDaemon();
            const provider = healthyProvider();
            provider.pauseBuilds();
            await using server = await providerAgentServer(rig, provider);
            const admin = await bootstrapAdministrator(server, "rollback");
            await selectProvider(admin);
            expect(
                (
                    await admin.post("/v0/setup/selectBaseImage", {
                        builtinKey: "daycare-minimal",
                    })
                ).statusCode,
            ).toBe(202);
            await waitFor(() => provider.buildRequests.length === 1, "the promotion test build");

            const client = createClient({ url: server.config.database.url });
            try {
                await client.execute(`
                    CREATE TRIGGER reject_onboarding_default_promotion
                    BEFORE UPDATE ON agent_image_settings
                    BEGIN
                        SELECT RAISE(ABORT, 'promotion deliberately blocked');
                    END
                `);
                provider.resumeBuilds();
                const failed = await waitForSelectedStatus(admin, "failed");
                expect(failed.lastError).toContain("promotion deliberately blocked");
                expect(failed.dockerImageId).toBeUndefined();
                expect((await baseImages(admin)).defaultImageId).toBeUndefined();
                expect((await admin.get("/v0/setup")).json()).toMatchObject({
                    route: { scope: "server", step: "base_image_ready" },
                    server: { steps: { base_image_ready: { state: "failed" } } },
                });
                await client.execute("DROP TRIGGER reject_onboarding_default_promotion");
                expect((await admin.post("/v0/setup/retryBaseImageBuild", {})).statusCode).toBe(
                    202,
                );
                const ready = await waitForSelectedStatus(admin, "ready");
                expect((await baseImages(admin)).defaultImageId).toBe(ready.id);
            } finally {
                await client.close();
            }
        });
    });
});

function healthyProvider(): MockSandboxProvider {
    return new MockSandboxProvider("docker", "Docker", {
        health: "healthy",
        detail: "Docker is ready.",
        version: "Docker gym 1.0",
    });
}

async function bootstrapAdministrator(
    server: GymServer,
    suffix: string,
): Promise<GymRequestClient & { token: string }> {
    const registration = await server.post("/v0/auth/password/register", {
        email: `${suffix}@example.com`,
        password: PASSWORD,
    });
    expect(registration.statusCode).toBe(201);
    const token = registration.json().token as string;
    const client = tokenClient(server, token);
    const profile = await client.post("/v0/me/createProfile", {
        firstName: "Image",
        username: `image_${suffix}`,
        email: `${suffix}@example.com`,
    });
    expect(profile.statusCode).toBe(201);
    expect(profile.json().user.role).toBe("admin");
    return { ...client, token };
}

async function selectProvider(client: GymRequestClient): Promise<void> {
    expect(
        (
            await client.post("/v0/setup/selectSandboxProvider", {
                providerId: "docker",
            })
        ).statusCode,
    ).toBe(200);
}

async function registerActiveMember(server: GymServer): Promise<GymRequestClient> {
    const registration = await server.post("/v0/auth/password/register", {
        email: "base-image-member@example.com",
        password: PASSWORD,
    });
    expect(registration.statusCode).toBe(201);
    const member = tokenClient(server, registration.json().token as string);
    expect(
        (
            await member.post("/v0/me/createProfile", {
                firstName: "Member",
                username: "base_image_member",
                email: "base-image-member@example.com",
            })
        ).statusCode,
    ).toBe(201);
    return member;
}

async function baseImages(client: GymRequestClient): Promise<BaseImageStatus> {
    const response = await client.get("/v0/setup/baseImages");
    expect(response.statusCode).toBe(200);
    return response.json() as BaseImageStatus;
}

async function waitForSelectedStatus(
    client: GymRequestClient,
    status: BaseImage["status"],
): Promise<BaseImageDetails> {
    let selected: BaseImageDetails | undefined;
    await waitFor(async () => {
        selected = (await baseImages(client)).selectedImage;
        return selected?.status === status;
    }, `the selected base image to become ${status}`);
    return selected!;
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
    provider: MockSandboxProvider,
): Promise<GymServer> {
    return createGymServer({
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

class SseFrames {
    private buffer = "";

    constructor(private readonly reader: ReadableStreamDefaultReader<Uint8Array>) {}

    async next(): Promise<{ name: string; data: unknown }> {
        for (;;) {
            const delimiter = this.buffer.indexOf("\n\n");
            if (delimiter >= 0) {
                const frame = this.buffer.slice(0, delimiter);
                this.buffer = this.buffer.slice(delimiter + 2);
                const name = /^event: ([^\n]+)$/m.exec(frame)?.[1];
                const rawData = /^data: (.*)$/m.exec(frame)?.[1];
                if (name && rawData) return { name, data: JSON.parse(rawData) };
                continue;
            }
            const result = await withTimeout(this.reader.read(), 3_000);
            if (result.done) throw new Error("SSE stream ended before the expected frame");
            this.buffer += new TextDecoder().decode(result.value, { stream: true });
        }
    }

    async until(
        predicate: (frame: { name: string; data: unknown }) => boolean,
    ): Promise<{ name: string; data: unknown }> {
        for (;;) {
            const frame = await this.next();
            if (predicate(frame)) return frame;
        }
    }

    async cancel(): Promise<void> {
        await this.reader.cancel().catch(() => undefined);
    }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<T>((_, reject) => {
                timer = setTimeout(
                    () => reject(new Error("Timed out waiting for SSE frame")),
                    timeoutMs,
                );
            }),
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}

async function withPasswordPepper(run: () => Promise<void>): Promise<void> {
    const previous = process.env.HAPPY2_PASSWORD_PEPPER;
    process.env.HAPPY2_PASSWORD_PEPPER = "gym-base-image-password-pepper";
    try {
        await run();
    } finally {
        if (previous === undefined) delete process.env.HAPPY2_PASSWORD_PEPPER;
        else process.env.HAPPY2_PASSWORD_PEPPER = previous;
    }
}
