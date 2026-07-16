import { describe, expect, it } from "vitest";
import { createMockRigDaemon, MockAgentDockerRuntime, type MockRigDaemon } from "happy2-gym/rig";
import type { AgentContainerInput } from "happy2-server";
import { createGymServer, type GymRequestClient, type GymServer } from "../../sources/index.js";

interface AgentImage {
    builtinKey?: "daycare-full" | "daycare-minimal";
    dockerTag: string;
    id: string;
    status: "pending" | "building" | "ready" | "failed";
}

describe("administrator agent image changes", () => {
    it("replaces every idle environment, preserves workspaces, and blocks active changes", async () => {
        await using rig = await createMockRigDaemon();
        const docker = new MockAgentDockerRuntime();
        await using server = await agentServer(rig, docker);
        const admin = await server.createUser({ username: "image_change_admin" });
        const owner = await server.createUser({ username: "image_change_owner" });
        const asAdmin = server.as(admin);
        const asOwner = server.as(owner);
        const { full, minimal } = await readyBuiltinImages(asAdmin);
        expect(
            (await asAdmin.post(`/v0/admin/agentImages/${minimal.id}/setDefaultImage`, {}))
                .statusCode,
        ).toBe(200);

        const created = await asOwner.post("/v0/chats/createAgent", {
            name: "Switchable",
            username: "switchable_agent",
        });
        expect(created.statusCode).toBe(201);
        const ownerChatId = created.json().chat.id as string;
        const agent = (
            (await asOwner.get("/v0/contacts")).json().users as Array<{
                agentImageId?: string;
                id: string;
                username: string;
            }>
        ).find(({ username }) => username === "switchable_agent");
        if (!agent) throw new Error("Created agent was not listed");
        expect(agent.agentImageId).toBe(minimal.id);

        const adminDirect = await asAdmin.post("/v0/chats/createDirectMessage", {
            userId: agent.id,
        });
        expect(adminDirect.statusCode).toBe(201);
        const adminChatId = adminDirect.json().chat.id as string;
        expect(
            (
                await asAdmin.post(`/v0/chats/${adminChatId}/sendMessage`, {
                    text: "Initialize my private environment",
                    clientMutationId: "initialize-admin-environment",
                })
            ).statusCode,
        ).toBe(201);
        await waitForMessages(asAdmin, adminChatId, 2);
        expect(docker.createdContainers).toHaveLength(2);
        expect(rig.createdSessions).toHaveLength(2);

        const memberAttempt = await asOwner.post(`/v0/admin/agents/${agent.id}/changeImage`, {
            imageId: full.id,
        });
        expect(memberAttempt.statusCode).toBe(403);
        docker.pauseBuilds();
        const notReady = (
            await asAdmin.post("/v0/admin/agentImages/createImage", {
                name: "Paused image",
                dockerfile: "FROM ubuntu:24.04\nRUN echo paused\n",
            })
        ).json().image as AgentImage;
        const blockedImage = await asAdmin.post(`/v0/admin/agents/${agent.id}/changeImage`, {
            imageId: notReady.id,
        });
        expect(blockedImage.statusCode).toBe(409);
        expect(blockedImage.json().message).toContain("not ready");
        docker.resumeBuilds();
        await waitForImage(asAdmin, notReady.id, "ready");

        const noOp = await asAdmin.post(`/v0/admin/agents/${agent.id}/changeImage`, {
            imageId: minimal.id,
        });
        expect(noOp.statusCode).toBe(200);
        expect(noOp.json()).toEqual({
            user: expect.objectContaining({ agentImageId: minimal.id }),
        });
        expect(docker.createdContainers).toHaveLength(2);
        expect(docker.removedContainers).toEqual([]);

        const baseUrl = await server.listen();
        const abort = new AbortController();
        const response = await fetch(`${baseUrl}/v0/sync/events`, {
            headers: { authorization: `Bearer ${admin.token}` },
            signal: abort.signal,
        });
        const events = new SseFrames(response.body!.getReader());
        expect((await events.next()).name).toBe("ready");

        const oldContainers = docker.createdContainers.map(({ containerName }) => containerName);
        const oldWorkspaces = docker.createdContainers.map(
            ({ workspaceDirectory }) => workspaceDirectory,
        );
        const changed = await asAdmin.post(`/v0/admin/agents/${agent.id}/changeImage`, {
            imageId: full.id,
        });
        expect(changed.statusCode).toBe(200);
        expect(changed.json()).toMatchObject({
            user: { id: agent.id, agentImageId: full.id },
            sync: { areas: ["users"], chats: [] },
        });
        const hint = await events.until(
            (frame) =>
                frame.name === "sync" &&
                (frame.data as { areas?: string[] }).areas?.includes("users") === true,
        );
        expect(hint.data).toMatchObject({ areas: ["users"] });
        abort.abort();
        await events.cancel();

        const replacements = docker.createdContainers.slice(2);
        expect(replacements).toHaveLength(2);
        expect(replacements.map(({ imageId }) => imageId)).toEqual([full.id, full.id]);
        expect(replacements.map(({ imageTag }) => imageTag)).toEqual([
            full.dockerTag,
            full.dockerTag,
        ]);
        expect(replacements.map(({ workspaceDirectory }) => workspaceDirectory).sort()).toEqual(
            [...oldWorkspaces].sort(),
        );
        expect(replacements.map(({ homeDirectory }) => homeDirectory).sort()).toEqual(
            oldWorkspaces.map((workspace) => workspace.replace(/\/workspace$/u, "/home")).sort(),
        );
        expect([...docker.removedContainers].sort()).toEqual([...oldContainers].sort());
        expect(
            rig.createdSessions
                .slice(2)
                .map(({ cwd }) => cwd)
                .sort(),
        ).toEqual([...oldWorkspaces].sort());
        expect(
            (
                (await asAdmin.get("/v0/contacts")).json().users as Array<{
                    agentImageId?: string;
                    id: string;
                }>
            ).find(({ id }) => id === agent.id)?.agentImageId,
        ).toBe(full.id);

        expect(
            (
                await asOwner.post(`/v0/chats/${ownerChatId}/sendMessage`, {
                    text: "Use the replacement environment",
                    clientMutationId: "replacement-turn",
                })
            ).statusCode,
        ).toBe(201);
        await waitForMessages(asOwner, ownerChatId, 2);
        expect(rig.submittedRuns.at(-1)?.sessionId).not.toBe("session-1");

        const changedBack = await asAdmin.post(`/v0/admin/agents/${agent.id}/changeImage`, {
            imageId: minimal.id,
        });
        expect(changedBack.statusCode).toBe(200);
        expect(changedBack.json().user.agentImageId).toBe(minimal.id);
        expect(docker.createdContainers).toHaveLength(6);

        rig.setAutomaticReply(undefined);
        expect(
            (
                await asOwner.post(`/v0/chats/${ownerChatId}/sendMessage`, {
                    text: "Keep this turn active",
                    clientMutationId: "active-turn",
                })
            ).statusCode,
        ).toBe(201);
        await waitFor(
            () => rig.submittedTexts.includes("Keep this turn active"),
            "active Rig turn",
        );
        const containersBeforeConflict = docker.createdContainers.length;
        const removalsBeforeConflict = docker.removedContainers.length;
        const activeChange = await asAdmin.post(`/v0/admin/agents/${agent.id}/changeImage`, {
            imageId: full.id,
        });
        expect(activeChange.statusCode).toBe(409);
        expect(activeChange.json().message).toContain("unfinished work");
        expect(docker.createdContainers).toHaveLength(containersBeforeConflict);
        expect(docker.removedContainers).toHaveLength(removalsBeforeConflict);
    }, 20_000);

    it("preserves a commit conflict when replacement cleanup also fails", async () => {
        await using rig = await createMockRigDaemon();
        rig.setAutomaticReply(undefined);
        const docker = new CleanupFailingDockerRuntime();
        await using server = await agentServer(rig, docker);
        const admin = await server.createUser({ username: "cleanup_failure_admin" });
        const asAdmin = server.as(admin);
        const { full, minimal } = await readyBuiltinImages(asAdmin);
        expect(
            (await asAdmin.post(`/v0/admin/agentImages/${minimal.id}/setDefaultImage`, {}))
                .statusCode,
        ).toBe(200);
        const created = await asAdmin.post("/v0/chats/createAgent", {
            name: "Cleanup conflict",
            username: "cleanup_conflict_agent",
        });
        expect(created.statusCode).toBe(201);
        const chatId = created.json().chat.id as string;
        const agent = (
            (await asAdmin.get("/v0/contacts")).json().users as Array<{
                id: string;
                username: string;
            }>
        ).find(({ username }) => username === "cleanup_conflict_agent");
        if (!agent) throw new Error("Created agent was not listed");

        docker.beforeNextContainer = async () => {
            expect(
                (
                    await asAdmin.post(`/v0/chats/${chatId}/sendMessage`, {
                        text: "Race the image commit",
                        clientMutationId: "cleanup-conflict-turn",
                    })
                ).statusCode,
            ).toBe(201);
        };
        docker.failNextRemoval = true;
        const changed = await asAdmin.post(`/v0/admin/agents/${agent.id}/changeImage`, {
            imageId: full.id,
        });
        expect(changed.statusCode).toBe(409);
        expect(changed.json()).toMatchObject({
            error: "conflict",
            message: "Agent image cannot be changed while the agent has unfinished work",
        });
    });
});

class CleanupFailingDockerRuntime extends MockAgentDockerRuntime {
    beforeNextContainer?: () => Promise<void>;
    failNextRemoval = false;

    override async createContainer(
        input: AgentContainerInput,
        signal?: AbortSignal,
    ): Promise<void> {
        await super.createContainer(input, signal);
        const callback = this.beforeNextContainer;
        this.beforeNextContainer = undefined;
        await callback?.();
    }

    override async removeContainer(containerName: string): Promise<void> {
        if (this.failNextRemoval) {
            this.failNextRemoval = false;
            throw new Error("Docker cleanup deliberately failed");
        }
        await super.removeContainer(containerName);
    }
}

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

async function readyBuiltinImages(client: GymRequestClient): Promise<{
    full: AgentImage;
    minimal: AgentImage;
}> {
    const catalog = (await client.get("/v0/admin/agentImages")).json() as {
        images: AgentImage[];
    };
    const full = catalog.images.find(({ builtinKey }) => builtinKey === "daycare-full");
    const minimal = catalog.images.find(({ builtinKey }) => builtinKey === "daycare-minimal");
    if (!full || !minimal) throw new Error("Built-in images were not seeded");
    for (const image of [minimal, full]) {
        expect(
            (await client.post(`/v0/admin/agentImages/${image.id}/buildImage`, {})).statusCode,
        ).toBe(202);
        await waitForImage(client, image.id, "ready");
    }
    return { full, minimal };
}

async function waitForImage(
    client: GymRequestClient,
    imageId: string,
    status: AgentImage["status"],
): Promise<void> {
    await waitFor(async () => {
        const catalog = (await client.get("/v0/admin/agentImages")).json() as {
            images: AgentImage[];
        };
        return catalog.images.find(({ id }) => id === imageId)?.status === status;
    }, `agent image ${imageId} to become ${status}`);
}

async function waitForMessages(
    client: GymRequestClient,
    chatId: string,
    count: number,
): Promise<Array<{ text: string }>> {
    let messages: Array<{ text: string }> = [];
    await waitFor(async () => {
        const response = await client.get(`/v0/chats/${chatId}/messages`);
        messages = response.json().messages as Array<{ text: string }>;
        return messages.length === count;
    }, `${count} messages in ${chatId}`);
    return messages;
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
            const result = await this.reader.read();
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
