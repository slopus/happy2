import { describe, expect, it } from "vitest";
import type { AgentSandboxState } from "happy2-server";
import { createGymServer } from "happy2-gym";
import { createMockRigDaemon, MockAgentSandboxRuntime, type MockRigDaemon } from "happy2-gym/rig";

describe("stale agent container reprovisioning", () => {
    it("repairs every stale durable binding during server startup", async () => {
        await using rig = await createMockRigDaemon();
        const sandbox = new MockAgentSandboxRuntime();
        await using server = await agentServer(rig, sandbox);
        const owner = await server.createUser({ username: "startup_container_owner" });
        const created = await server.as(owner).post("/v0/chats/createAgent", {
            name: "Startup repair",
            username: "startup_repair_agent",
        });
        expect(created.statusCode).toBe(201);
        const staleContainerName = sandbox.createdContainers.at(-1)?.containerName;
        if (!staleContainerName) throw new Error("Agent container was not created");
        const staleConfigurationHash = sandbox.createdContainers.at(-1)?.configurationHash;
        expect(staleConfigurationHash).toMatch(/^[a-f0-9]{64}$/u);
        sandbox.setSandboxConfigurationHash(staleContainerName, undefined);

        const containersBeforeRestart = sandbox.createdContainers.length;
        const sessionsBeforeRestart = rig.createdSessions.length;
        await server.restart();

        expect(sandbox.createdContainers).toHaveLength(containersBeforeRestart + 1);
        expect(rig.createdSessions).toHaveLength(sessionsBeforeRestart + 1);
        expect(sandbox.removedContainers).toContain(staleContainerName);
        expect(sandbox.createdContainers.at(-1)).toMatchObject({
            configurationHash: staleConfigurationHash,
            homeDirectory: sandbox.createdContainers.at(-2)?.homeDirectory,
            imageId: sandbox.createdContainers.at(-2)?.imageId,
            imageTag: sandbox.createdContainers.at(-2)?.imageTag,
            workspaceDirectory: sandbox.createdContainers.at(-2)?.workspaceDirectory,
        });
        await server.restart();
        expect(sandbox.createdContainers).toHaveLength(containersBeforeRestart + 1);
        expect(rig.createdSessions).toHaveLength(sessionsBeforeRestart + 1);
    });

    it("uses one process-level repair when concurrent first requests find stale configuration", async () => {
        await using rig = await createMockRigDaemon();
        const sandbox = new PausedInspectionSandbox();
        await using server = await agentServer(rig, sandbox);
        const owner = await server.createUser({ username: "concurrent_container_owner" });
        const asOwner = server.as(owner);
        const created = await asOwner.post("/v0/chats/createAgent", {
            name: "Concurrent repair",
            username: "concurrent_repair_agent",
        });
        expect(created.statusCode).toBe(201);
        const chatId = created.json().chat.id as string;
        const staleContainerName = sandbox.createdContainers.at(-1)?.containerName;
        if (!staleContainerName) throw new Error("Agent container was not created");
        sandbox.setSandboxConfigurationHash(staleContainerName, "obsolete-configuration");
        sandbox.pauseInspections();
        const containersBeforeRequests = sandbox.createdContainers.length;
        const sessionsBeforeRequests = rig.createdSessions.length;

        const first = asOwner.post(`/v0/chats/${chatId}/sendMessage`, {
            text: "First request after the configuration change",
            clientMutationId: "stale-container-first-request",
        });
        const second = asOwner.post(`/v0/chats/${chatId}/sendMessage`, {
            text: "Concurrent request after the configuration change",
            clientMutationId: "stale-container-concurrent-request",
        });
        await sandbox.waitForInspection();
        await new Promise<void>((resolve) => setImmediate(resolve));
        sandbox.resumeInspections();
        const responses = await Promise.all([first, second]);

        expect(responses.map(({ statusCode }) => statusCode)).toEqual([201, 201]);
        expect(sandbox.inspectionCount).toBe(1);
        expect(sandbox.createdContainers).toHaveLength(containersBeforeRequests + 1);
        expect(rig.createdSessions).toHaveLength(sessionsBeforeRequests + 1);
        expect(sandbox.removedContainers).toContain(staleContainerName);
    });
});

class PausedInspectionSandbox extends MockAgentSandboxRuntime {
    inspectionCount = 0;
    private inspectionPaused = false;
    private inspectionStarted?: () => void;
    private inspectionStartedPromise?: Promise<void>;
    private resumeInspection?: () => void;
    private resumeInspectionPromise?: Promise<void>;

    pauseInspections(): void {
        this.inspectionPaused = true;
        this.inspectionStartedPromise = new Promise((resolve) => {
            this.inspectionStarted = resolve;
        });
        this.resumeInspectionPromise = new Promise((resolve) => {
            this.resumeInspection = resolve;
        });
    }

    waitForInspection(): Promise<void> {
        if (!this.inspectionStartedPromise) throw new Error("Inspections are not paused");
        return this.inspectionStartedPromise;
    }

    resumeInspections(): void {
        this.inspectionPaused = false;
        this.resumeInspection?.();
    }

    override async inspectAgentSandbox(
        containerName: string,
        signal?: AbortSignal,
    ): Promise<AgentSandboxState | undefined> {
        this.inspectionCount += 1;
        if (this.inspectionPaused) {
            this.inspectionStarted?.();
            await this.resumeInspectionPromise;
        }
        return super.inspectAgentSandbox(containerName, signal);
    }
}

function agentServer(
    rig: MockRigDaemon,
    agentSandbox: MockAgentSandboxRuntime,
): ReturnType<typeof createGymServer> {
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
