import { describe, expect, it } from "vitest";
import { createMockRigDaemon, MockAgentDockerRuntime, type MockRigDaemon } from "happy2-gym/rig";
import { createGymServer, type GymRequestClient, type GymServer } from "../../sources/index.js";

interface AgentImageSummary {
    id: string;
    name: string;
    status: "pending" | "building" | "ready" | "failed";
    buildAttempt: number;
    buildProgress: number;
    lastBuildLogLine?: string;
    lastError?: string;
}

interface AgentImageDetails extends AgentImageSummary {
    dockerfile: string;
    buildLog: string;
    buildLogTruncated: boolean;
}

describe("agent image build output", () => {
    it("streams durable progress and exposes list summaries plus inspectable details", async () => {
        await using rig = await createMockRigDaemon();
        const docker = new MockAgentDockerRuntime();
        docker.pauseBuilds();
        await using server = await agentServer(rig, docker);
        const admin = await server.createUser({ username: "build_log_admin" });
        const member = await server.createUser({ username: "build_log_member" });
        const asAdmin = server.as(admin);

        const catalog = await imageCatalog(asAdmin);
        const image = catalog.images.find(({ name }) => name === "Daycare Minimal");
        expect(image).toBeDefined();
        expect(image).not.toHaveProperty("dockerfile");
        expect(image).not.toHaveProperty("buildLog");
        expect(image).toMatchObject({ buildAttempt: 0, buildProgress: 0, status: "pending" });
        expect((await server.as(member).get(`/v0/admin/agentImages/${image!.id}`)).statusCode).toBe(
            403,
        );
        expect((await asAdmin.get("/v0/admin/agentImages/missing-image")).statusCode).toBe(404);

        expect(
            (await asAdmin.post(`/v0/admin/agentImages/${image!.id}/buildImage`, {})).statusCode,
        ).toBe(202);
        await waitForImage(asAdmin, image!.id, ({ status }) => status === "building");

        const baseUrl = await server.listen();
        const realtimeAbort = new AbortController();
        const realtimeResponse = await fetch(`${baseUrl}/v0/sync/events`, {
            headers: { authorization: `Bearer ${admin.token}` },
            signal: realtimeAbort.signal,
        });
        const realtime = new SseFrames(realtimeResponse.body!.getReader());
        expect((await realtime.next()).name).toBe("ready");

        docker.emitBuildUpdate({
            logChunk: "Downloading dependencies 42/100\nInstalling toolchain",
            progress: 42,
        });
        const progressHint = await realtime.until(
            (frame) =>
                frame.name === "sync" &&
                (frame.data as { areas?: string[] }).areas?.includes("agent-images") === true,
        );
        expect(progressHint.data).toMatchObject({ areas: ["agent-images"] });
        const progressing = await waitForImage(
            asAdmin,
            image!.id,
            (candidate) => candidate.buildProgress === 42,
        );
        expect(progressing.lastBuildLogLine).toBe("Installing toolchain");
        expect(progressing).not.toHaveProperty("buildLog");

        const details = await imageDetails(asAdmin, image!.id);
        expect(details).toMatchObject({
            buildAttempt: 1,
            buildLogTruncated: false,
            buildProgress: 42,
            lastBuildLogLine: "Installing toolchain",
        });
        expect(details.dockerfile).toContain("FROM ubuntu:24.04");
        expect(details.buildLog).toContain("Downloading dependencies 42/100");
        expect(details.buildLog).toContain("Installing toolchain");

        docker.emitBuildUpdate({
            logChunk: `${"x".repeat(2_000_100)}\nretained tail line\n`,
            progress: 43,
        });
        await realtime.until(
            (frame) =>
                frame.name === "sync" &&
                (frame.data as { areas?: string[] }).areas?.includes("agent-images") === true,
        );
        const truncated = await imageDetails(asAdmin, image!.id);
        expect(truncated).toMatchObject({
            buildLogTruncated: true,
            buildProgress: 43,
            lastBuildLogLine: "retained tail line",
        });
        expect(truncated.buildLog).toHaveLength(2_000_000);
        expect(truncated.buildLog).toMatch(/retained tail line\n$/);
        realtimeAbort.abort();
        await realtime.cancel();

        await server.restart();
        await waitFor(() => docker.buildRequests.length === 2, "the restarted build to be claimed");
        await waitForImage(asAdmin, image!.id, ({ status }) => status === "building");
        docker.emitBuildUpdate({ logChunk: "Restarted build is running\n", progress: 63 });
        const restarted = await waitForImage(
            asAdmin,
            image!.id,
            (candidate) => candidate.buildProgress === 63,
        );
        expect(restarted).toMatchObject({
            buildAttempt: 2,
            lastBuildLogLine: "Restarted build is running",
        });
        const restartedDetails = await imageDetails(asAdmin, image!.id);
        expect(restartedDetails.buildLog).not.toContain("Downloading dependencies");
        expect(restartedDetails.buildLog).toContain("Restarted build is running");

        docker.resumeBuilds();
        const ready = await waitForImage(asAdmin, image!.id, ({ status }) => status === "ready");
        expect(ready).toMatchObject({ buildAttempt: 2, buildProgress: 100 });
        expect(ready.lastBuildLogLine).toBe("#2 DONE");
        expect((await imageDetails(asAdmin, image!.id)).buildLog).toContain("image assembled");
    }, 20_000);

    it("persists a failed build log and replaces it with the retried attempt", async () => {
        await using rig = await createMockRigDaemon();
        const docker = new MockAgentDockerRuntime();
        docker.failNextBuild("Dockerfile deliberately failed");
        await using server = await agentServer(rig, docker);
        const admin = await server.createUser({ username: "failed_log_admin" });
        const asAdmin = server.as(admin);
        const dockerfile = "FROM ubuntu:24.04\nRUN false\n";

        const created = await asAdmin.post("/v0/admin/agentImages/createImage", {
            name: "Fail then retry",
            dockerfile,
        });
        expect(created.statusCode).toBe(202);
        const imageId = (created.json().image as AgentImageSummary).id;
        const failed = await waitForImage(asAdmin, imageId, ({ status }) => status === "failed");
        expect(failed).toMatchObject({
            buildAttempt: 1,
            lastBuildLogLine: "Dockerfile deliberately failed",
            lastError: "Dockerfile deliberately failed",
        });
        const failedDetails = await imageDetails(asAdmin, imageId);
        expect(failedDetails.dockerfile).toBe(dockerfile);
        expect(failedDetails.buildLog).toContain("Dockerfile deliberately failed");

        expect(
            (await asAdmin.post(`/v0/admin/agentImages/${imageId}/buildImage`, {})).statusCode,
        ).toBe(202);
        const ready = await waitForImage(asAdmin, imageId, ({ status }) => status === "ready");
        expect(ready).toMatchObject({ buildAttempt: 2, buildProgress: 100 });
        const retriedDetails = await imageDetails(asAdmin, imageId);
        expect(retriedDetails.buildLog).not.toContain("deliberately failed");
        expect(retriedDetails.buildLog).toContain("image assembled");
    });
});

function agentServer(rig: MockRigDaemon, agentDocker: MockAgentDockerRuntime): Promise<GymServer> {
    return createGymServer({
        agentDocker,
        databaseMode: "file",
        configure(config) {
            config.agents.enabled = true;
            config.agents.socketPath = rig.socketPath;
            config.agents.tokenPath = rig.tokenPath;
            config.agents.defaultCwd = rig.workspaceRoot;
        },
    });
}

async function imageCatalog(client: GymRequestClient): Promise<{ images: AgentImageSummary[] }> {
    const response = await client.get("/v0/admin/agentImages");
    expect(response.statusCode).toBe(200);
    return response.json();
}

async function imageDetails(client: GymRequestClient, imageId: string): Promise<AgentImageDetails> {
    const response = await client.get(`/v0/admin/agentImages/${imageId}`);
    expect(response.statusCode).toBe(200);
    return response.json().image as AgentImageDetails;
}

async function waitForImage(
    client: GymRequestClient,
    imageId: string,
    predicate: (image: AgentImageSummary) => boolean,
): Promise<AgentImageSummary> {
    let selected: AgentImageSummary | undefined;
    await waitFor(async () => {
        selected = (await imageCatalog(client)).images.find(({ id }) => id === imageId);
        return selected !== undefined && predicate(selected);
    }, `agent image ${imageId} to reach the expected state`);
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
