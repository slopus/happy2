import { stat } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createMockRigDaemon, MockAgentSandboxRuntime, type MockRigDaemon } from "happy2-gym/rig";
import { createGymServer, type GymRequestClient, type GymServer } from "../../sources/index.js";

interface AgentImage {
    id: string;
    name: string;
    definitionHash: string;
    dockerTag: string;
    builtinKey?: "daycare-full" | "daycare-minimal";
    status: "pending" | "building" | "ready" | "failed";
    buildAttempt: number;
    buildProgress: number;
    lastBuildLogLine?: string;
    dockerImageId?: string;
    lastError?: string;
}

interface AgentImageDetails extends AgentImage {
    dockerfile: string;
    buildLog: string;
    buildLogTruncated: boolean;
}

describe("administrator-managed immutable agent images", () => {
    it("gates agents, survives interrupted builds, and starts hardened Docker Rig sessions", async () => {
        await using rig = await createMockRigDaemon();
        const docker = new MockAgentSandboxRuntime();
        await using server = await agentServer(rig, docker);
        const admin = await server.createUser({ username: "image_admin" });
        const member = await server.createUser({ username: "image_member" });
        const asAdmin = server.as(admin);

        expect((await server.as(member).get("/v0/admin/agentImages")).statusCode).toBe(403);
        let catalog = await agentImageCatalog(asAdmin);
        expect(catalog.defaultImageId).toBeUndefined();
        expect(catalog.images.map(({ builtinKey }) => builtinKey).sort()).toEqual([
            "daycare-full",
            "daycare-minimal",
        ]);
        const minimal = imageByBuiltin(catalog.images, "daycare-minimal");
        const full = imageByBuiltin(catalog.images, "daycare-full");
        const minimalDetails = await agentImageDetails(asAdmin, minimal.id);
        const fullDetails = await agentImageDetails(asAdmin, full.id);
        expect(minimalDetails.dockerfile).toContain("FROM ubuntu:24.04");
        expect(minimalDetails.dockerfile).not.toContain("### PYTHON ###");
        expect(fullDetails.dockerfile).toContain("### PYTHON ###");
        expect(fullDetails.dockerfile).toContain("### RUST ###");
        expect(fullDetails.dockerfile).toContain("### GO ###");

        const blocked = await asAdmin.post("/v0/chats/createAgent", {
            name: "Blocked",
            username: "blocked_agent",
        });
        expect(blocked.statusCode).toBe(409);
        expect(blocked.json().message).toContain("ready default agent image");
        expect(docker.createdContainers).toEqual([]);
        expect(rig.createdSessions).toEqual([]);
        expect(
            (await asAdmin.post(`/v0/admin/agentImages/${minimal.id}/setDefaultImage`, {}))
                .statusCode,
        ).toBe(409);

        docker.pauseBuilds();
        const baseUrl = await server.listen();
        const realtimeAbort = new AbortController();
        const realtimeResponse = await fetch(`${baseUrl}/v0/sync/events`, {
            headers: { authorization: `Bearer ${admin.token}` },
            signal: realtimeAbort.signal,
        });
        const realtime = new SseFrames(realtimeResponse.body!.getReader());
        expect((await realtime.next()).name).toBe("ready");
        expect(
            (await asAdmin.post(`/v0/admin/agentImages/${minimal.id}/buildImage`, {})).statusCode,
        ).toBe(202);
        const imageHint = await realtime.until(
            (frame) =>
                frame.name === "sync" &&
                (frame.data as { areas?: string[] }).areas?.includes("agent-images") === true,
        );
        expect(imageHint.data).toMatchObject({ areas: ["agent-images"] });
        realtimeAbort.abort();
        await realtime.cancel();
        await waitForImageStatus(asAdmin, minimal.id, "building");
        expect(docker.buildRequests[0]).toEqual({
            buildContext:
                "https://github.com/ex3ndr/daycare.git#7c3c466c1b35d16a4347e352577f2fd2cf6680de:packages/daycare-runtime",
            dockerfile: minimalDetails.dockerfile,
            tag: minimal.dockerTag,
        });

        await server.restart();
        await waitFor(() => docker.buildRequests.length === 2, "the interrupted build to resume");
        docker.resumeBuilds();
        await waitForImageStatus(asAdmin, minimal.id, "ready");
        expect(
            (await asAdmin.post(`/v0/admin/agentImages/${minimal.id}/setDefaultImage`, {}))
                .statusCode,
        ).toBe(200);

        await server.restart();
        catalog = await agentImageCatalog(asAdmin);
        expect(catalog.defaultImageId).toBe(minimal.id);
        expect(catalog.images.find(({ id }) => id === minimal.id)?.status).toBe("ready");

        const created = await asAdmin.post("/v0/chats/createAgent", {
            name: "Docker Fixer",
            username: "docker_fixer",
        });
        expect(created.statusCode).toBe(201);
        const agent = (
            (await asAdmin.get("/v0/contacts")).json().users as Array<{
                agentImageId?: string;
                id: string;
                username: string;
            }>
        ).find(({ username }) => username === "docker_fixer");
        expect(agent?.agentImageId).toBe(minimal.id);
        const container = docker.createdContainers.at(-1)!;
        expect(container).toMatchObject({
            agentUserId: agent!.id,
            imageId: minimal.id,
            imageTag: minimal.dockerTag,
            security: {
                init: true,
                readonlyRootFilesystem: true,
                sharedMemoryBytes: 1024 * 1024 * 1024,
                tmpfs: [
                    { target: "/tmp", mode: 0o1777 },
                    { target: "/run", mode: 0o755 },
                    { target: "/var/tmp", mode: 0o1777 },
                    { target: "/var/run", mode: 0o755 },
                ],
            },
        });
        expect(container.homeDirectory).toBe(
            `${rig.workspaceRoot}/agents/${agent!.id}/users/${admin.id}/home`,
        );
        expect(container.workspaceDirectory).toBe(
            `${rig.workspaceRoot}/agents/${agent!.id}/users/${admin.id}/workspace`,
        );
        await expect(stat(container.homeDirectory)).resolves.toBeDefined();
        await expect(stat(container.workspaceDirectory)).resolves.toBeDefined();
        expect(rig.createdSessions.at(-1)).toEqual({
            cwd: container.workspaceDirectory,
            docker: {
                container: container.containerName,
                workingDirectory: "/workspace",
            },
            permissionMode: "workspace_write",
        });

        const customDockerfile = "FROM ubuntu:24.04\nRUN echo custom-image\n";
        const customCreated = await asAdmin.post("/v0/admin/agentImages/createImage", {
            name: "Custom tools",
            dockerfile: customDockerfile,
        });
        expect(customCreated.statusCode).toBe(202);
        const custom = customCreated.json().image as AgentImage;
        await waitForImageStatus(asAdmin, custom.id, "ready");
        expect(docker.buildRequests.at(-1)).toEqual({
            dockerfile: customDockerfile,
            tag: custom.dockerTag,
        });
        expect((await agentImageDetails(asAdmin, custom.id)).dockerfile).toBe(customDockerfile);
        expect(
            (
                await asAdmin.post("/v0/admin/agentImages/createImage", {
                    name: "Duplicate definition",
                    dockerfile: customDockerfile,
                })
            ).statusCode,
        ).toBe(409);

        docker.failNextBuild("Dockerfile deliberately failed");
        const failing = (
            await asAdmin.post("/v0/admin/agentImages/createImage", {
                name: "Retryable image",
                dockerfile: "FROM ubuntu:24.04\nRUN false\n",
            })
        ).json().image as AgentImage;
        const failed = await waitForImageStatus(asAdmin, failing.id, "failed");
        expect(failed.lastError).toContain("deliberately failed");
        expect(
            (await asAdmin.post(`/v0/admin/agentImages/${failing.id}/setDefaultImage`, {}))
                .statusCode,
        ).toBe(409);
        expect(
            (await asAdmin.post(`/v0/admin/agentImages/${failing.id}/buildImage`, {})).statusCode,
        ).toBe(202);
        await waitForImageStatus(asAdmin, failing.id, "ready");
    }, 20_000);

    it("runs only one administrator-requested Docker build at a time", async () => {
        await using rig = await createMockRigDaemon();
        const docker = new MockAgentSandboxRuntime();
        docker.pauseBuilds();
        await using server = await agentServer(rig, docker);
        const admin = await server.createUser({ username: "serial_image_admin" });
        const asAdmin = server.as(admin);

        const first = (
            await asAdmin.post("/v0/admin/agentImages/createImage", {
                name: "Serial one",
                dockerfile: "FROM ubuntu:24.04\nRUN echo one\n",
            })
        ).json().image as AgentImage;
        const second = (
            await asAdmin.post("/v0/admin/agentImages/createImage", {
                name: "Serial two",
                dockerfile: "FROM ubuntu:24.04\nRUN echo two\n",
            })
        ).json().image as AgentImage;

        await waitFor(() => docker.buildRequests.length === 1, "the first Docker build to start");
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(docker.buildRequests).toHaveLength(1);
        const catalog = await agentImageCatalog(asAdmin);
        expect(catalog.images.find(({ id }) => id === first.id)?.status).toBe("building");
        expect(catalog.images.find(({ id }) => id === second.id)?.status).toBe("pending");

        docker.resumeBuilds();
        await waitForImageStatus(asAdmin, first.id, "ready");
        await waitForImageStatus(asAdmin, second.id, "ready");
        expect(docker.buildRequests).toHaveLength(2);
    });
});

function agentServer(
    rig: MockRigDaemon,
    agentSandbox: MockAgentSandboxRuntime,
): Promise<GymServer> {
    return createGymServer({
        agentSandbox,
        databaseMode: "file",
        configure(config) {
            config.agents.enabled = true;
            config.agents.socketPath = rig.socketPath;
            config.agents.tokenPath = rig.tokenPath;
            config.agents.defaultCwd = rig.workspaceRoot;
        },
    });
}

async function agentImageCatalog(client: GymRequestClient): Promise<{
    defaultImageId?: string;
    images: AgentImage[];
}> {
    const response = await client.get("/v0/admin/agentImages");
    expect(response.statusCode).toBe(200);
    return response.json();
}

async function agentImageDetails(
    client: GymRequestClient,
    imageId: string,
): Promise<AgentImageDetails> {
    const response = await client.get(`/v0/admin/agentImages/${imageId}`);
    expect(response.statusCode).toBe(200);
    return response.json().image as AgentImageDetails;
}

function imageByBuiltin(
    images: AgentImage[],
    builtinKey: NonNullable<AgentImage["builtinKey"]>,
): AgentImage {
    const image = images.find((candidate) => candidate.builtinKey === builtinKey);
    if (!image) throw new Error(`${builtinKey} was not seeded`);
    return image;
}

async function waitForImageStatus(
    client: GymRequestClient,
    imageId: string,
    status: AgentImage["status"],
): Promise<AgentImage> {
    let selected: AgentImage | undefined;
    await waitFor(async () => {
        selected = (await agentImageCatalog(client)).images.find(({ id }) => id === imageId);
        return selected?.status === status;
    }, `agent image ${imageId} to become ${status}`);
    return selected!;
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
                    () => reject(new Error("Timed out waiting for an SSE frame")),
                    timeoutMs,
                );
            }),
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}
