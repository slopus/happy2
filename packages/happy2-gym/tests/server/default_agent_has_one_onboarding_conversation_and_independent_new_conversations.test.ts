import { describe, expect, it } from "vitest";
import { createMockRigDaemon, MockAgentSandboxRuntime } from "happy2-gym/rig";
import { createGymServer, type GymRequestClient } from "../../sources/index.js";

interface Chat {
    defaultAgentUserId?: string;
    id: string;
    isDefaultAgentConversation: boolean;
    kind: string;
}

interface Contact {
    agentImageId?: string;
    agentRole?: "default";
    id: string;
    kind: "agent" | "human";
    username: string;
}

interface Image {
    builtinKey?: "daycare-full" | "daycare-minimal";
    id: string;
    status: string;
}

describe("server-managed default agent", () => {
    it("creates one onboarding conversation, assigns channels, and isolates every new conversation", async () => {
        await using rig = await createMockRigDaemon();
        const sandbox = new MockAgentSandboxRuntime();
        await using server = await createGymServer({
            agentSandbox: sandbox,
            configure(config) {
                config.agents.enabled = true;
                config.agents.socketPath = rig.socketPath;
                config.agents.tokenPath = rig.tokenPath;
                config.agents.defaultCwd = rig.workspaceRoot;
            },
        });
        const admin = await server.createUser({ username: "happy_admin" });
        const member = await server.createUser({ username: "happy_member" });
        const asAdmin = server.as(admin);
        const asMember = server.as(member);

        const initialContacts = await contacts(asAdmin);
        const defaultAgent = initialContacts.find(({ agentRole }) => agentRole === "default");
        expect(defaultAgent).toMatchObject({
            username: "happy",
            agentRole: "default",
            agentImageId: "happy2-gym-setup-ready-image",
        });
        expect(initialContacts.filter(({ kind }) => kind === "agent")).toEqual([defaultAgent]);

        const adminDefaultConversation = defaultAgentConversation(await chats(asAdmin));
        const memberDefaultConversation = defaultAgentConversation(await chats(asMember));
        expect(adminDefaultConversation.id).not.toBe(memberDefaultConversation.id);
        expect(
            (await members(asAdmin, adminDefaultConversation.id)).map(({ id }) => id).sort(),
        ).toEqual([admin.id, defaultAgent!.id].sort());
        const minimal = await readyBuiltin(asAdmin, "daycare-minimal");
        expect(
            (await asAdmin.post(`/v0/admin/agentImages/${minimal.id}/setDefaultImage`, {}))
                .statusCode,
        ).toBe(200);
        expect((await contacts(asAdmin)).find(({ id }) => id === defaultAgent!.id)).toMatchObject({
            agentImageId: "happy2-gym-setup-ready-image",
            agentRole: "default",
        });

        const first = await createConversation(asMember, defaultAgent!.id);
        const second = await createConversation(asMember, defaultAgent!.id);
        expect(first.id).not.toBe(second.id);
        expect(first.isDefaultAgentConversation).toBe(false);
        expect(second.isDefaultAgentConversation).toBe(false);
        for (const [index, chat] of [first, second].entries()) {
            const sent = await asMember.post(`/v0/chats/${chat.id}/sendMessage`, {
                text: `Independent Happy turn ${index + 1}`,
                clientMutationId: `independent-happy-${index + 1}`,
            });
            expect(sent.statusCode).toBe(201);
            await waitForMessages(asMember, chat.id, 2);
        }
        expect(rig.submittedTexts).toEqual([
            "Independent Happy turn 1",
            "Independent Happy turn 2",
        ]);
        expect(rig.createdCwds).toEqual(
            expect.arrayContaining(
                [first, second].map(
                    ({ id }) =>
                        `${rig.workspaceRoot}/agents/${defaultAgent!.id}/users/${member.id}/conversations/${id}/workspace`,
                ),
            ),
        );
        const defaultAgentSessions = rig.createdSessions.filter(({ cwd }) =>
            cwd.includes(`/agents/${defaultAgent!.id}/users/${member.id}/conversations/`),
        );
        expect(defaultAgentSessions).toHaveLength(2);
        expect(new Set(defaultAgentSessions.map(({ cwd }) => cwd)).size).toBe(2);

        const channelResponse = await asAdmin.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Default agent laboratory",
            slug: "default-agent-laboratory",
        });
        expect(channelResponse.statusCode).toBe(201);
        const channel = channelResponse.json().chat as Chat;
        expect(channel.defaultAgentUserId).toBe(defaultAgent!.id);
        expect((await members(asAdmin, channel.id)).filter(({ kind }) => kind === "agent")).toEqual(
            [expect.objectContaining({ id: defaultAgent!.id, agentRole: "default" })],
        );

        expect(
            (
                await asAdmin.post(`/v0/chats/${channel.id}/addMember`, {
                    userId: member.id,
                })
            ).statusCode,
        ).toBe(200);
        expect(
            (
                await asMember.post(`/v0/chats/${channel.id}/updateDefaultAgent`, {
                    agentUserId: defaultAgent!.id,
                })
            ).statusCode,
        ).toBe(403);
        const createdAgent = await asAdmin.post("/v0/chats/createAgent", {
            name: "Alternate",
            username: "alternate_default",
        });
        expect(createdAgent.statusCode).toBe(201);
        const alternate = (await contacts(asAdmin)).find(
            ({ username }) => username === "alternate_default",
        );
        expect(alternate).toBeDefined();
        const changedDefault = await asAdmin.post(`/v0/chats/${channel.id}/updateDefaultAgent`, {
            agentUserId: alternate!.id,
        });
        expect(changedDefault.statusCode).toBe(200);
        expect(changedDefault.json().chat.defaultAgentUserId).toBe(alternate!.id);
        expect(
            (
                await asAdmin.post(`/v0/chats/${channel.id}/removeMember`, {
                    userId: alternate!.id,
                })
            ).statusCode,
        ).toBe(409);
        expect(
            (
                await asAdmin.post(`/v0/chats/${channel.id}/removeMember`, {
                    userId: defaultAgent!.id,
                })
            ).statusCode,
        ).toBe(400);

        expect(
            (await asAdmin.post(`/v0/chats/${adminDefaultConversation.id}/archiveChannel`, {}))
                .statusCode,
        ).toBe(400);
        expect(
            (await asAdmin.post(`/v0/chats/${adminDefaultConversation.id}/deleteChannel`, {}))
                .statusCode,
        ).toBe(400);
        expect(
            (
                await asAdmin.post(`/v0/chats/${adminDefaultConversation.id}/removeMember`, {
                    userId: defaultAgent!.id,
                })
            ).statusCode,
        ).toBe(400);

        const full = await readyBuiltin(asAdmin, "daycare-full");
        expect(
            (
                await asMember.post(`/v0/admin/agents/${defaultAgent!.id}/changeImage`, {
                    imageId: full.id,
                })
            ).statusCode,
        ).toBe(403);
        const changedImage = await asAdmin.post(
            `/v0/admin/agents/${defaultAgent!.id}/changeImage`,
            {
                imageId: full.id,
            },
        );
        expect(changedImage.statusCode).toBe(200);
        expect(changedImage.json().user).toMatchObject({
            id: defaultAgent!.id,
            agentImageId: full.id,
            agentRole: "default",
        });

        await server.restart();
        const restartedDefaultConversations = (await chats(asAdmin)).filter(
            ({ isDefaultAgentConversation }) => isDefaultAgentConversation,
        );
        expect(restartedDefaultConversations).toEqual([
            expect.objectContaining({ id: adminDefaultConversation.id }),
        ]);
        expect((await chats(asMember)).map(({ id }) => id)).toEqual(
            expect.arrayContaining([memberDefaultConversation.id, first.id, second.id]),
        );
    });
});

async function contacts(client: GymRequestClient): Promise<Contact[]> {
    const response = await client.get("/v0/contacts");
    expect(response.statusCode).toBe(200);
    return response.json().users as Contact[];
}

async function chats(client: GymRequestClient): Promise<Chat[]> {
    const response = await client.get("/v0/chats");
    expect(response.statusCode).toBe(200);
    return response.json().chats as Chat[];
}

function defaultAgentConversation(items: Chat[]): Chat {
    const conversations = items.filter(
        ({ isDefaultAgentConversation }) => isDefaultAgentConversation,
    );
    expect(conversations).toHaveLength(1);
    return conversations[0]!;
}

async function members(client: GymRequestClient, chatId: string): Promise<Contact[]> {
    const response = await client.get(`/v0/chats/${chatId}/members`);
    expect(response.statusCode).toBe(200);
    return response.json().users as Contact[];
}

async function createConversation(client: GymRequestClient, agentUserId: string): Promise<Chat> {
    const response = await client.post("/v0/chats/createAgentConversation", { agentUserId });
    expect(response.statusCode).toBe(201);
    return response.json().chat as Chat;
}

async function readyBuiltin(
    client: GymRequestClient,
    builtinKey: "daycare-full" | "daycare-minimal",
): Promise<Image> {
    let catalog = (await client.get("/v0/admin/agentImages")).json() as { images: Image[] };
    const image = catalog.images.find((candidate) => candidate.builtinKey === builtinKey);
    if (!image) throw new Error(`${builtinKey} image was not seeded`);
    if (image.status !== "ready" && image.status !== "building") {
        const requested = await client.post(`/v0/admin/agentImages/${image.id}/buildImage`, {});
        expect(requested.statusCode).toBe(202);
    }
    await waitFor(async () => {
        catalog = (await client.get("/v0/admin/agentImages")).json() as typeof catalog;
        return catalog.images.find(({ id }) => id === image.id)?.status === "ready";
    }, `${builtinKey} image to become ready`);
    return catalog.images.find(({ id }) => id === image.id)!;
}

async function waitForMessages(
    client: GymRequestClient,
    chatId: string,
    count: number,
): Promise<void> {
    await waitFor(async () => {
        const response = await client.get(`/v0/chats/${chatId}/messages`);
        const messages = response.json().messages as Array<Record<string, unknown>>;
        return (
            messages.length >= count &&
            messages.every(
                (message) =>
                    message.kind !== "automated" || message.generationStatus !== "streaming",
            )
        );
    }, `${count} messages in ${chatId}`);
}

async function waitFor(
    check: () => boolean | Promise<boolean>,
    description: string,
    timeoutMs = 4_000,
): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    do {
        if (await check()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    } while (Date.now() < deadline);
    throw new Error(`Timed out waiting for ${description}`);
}
