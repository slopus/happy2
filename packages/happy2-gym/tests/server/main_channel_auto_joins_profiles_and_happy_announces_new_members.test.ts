import type { InjectOptions } from "fastify";
import { describe, expect, it } from "vitest";
import { createGymServer, type GymRequestClient, type GymServer } from "../../sources/index.js";

describe("main channel onboarding and service messages", () => {
    it("keeps everyone in one durable main channel and announces additions as Happy", async () => {
        await withPasswordPepper(async () => {
            await using server = await createGymServer({
                configure(config) {
                    config.auth.password.enabled = true;
                },
            });

            const ada = await signUp(server, "ada@example.com", "ada", "Ada");
            await server.completeSetup({ actorUserId: ada.id, registrationEnabled: true });
            const welcome = chatBySlug(await chats(ada.client), "welcome");
            expect(welcome).toMatchObject({
                kind: "public_channel",
                slug: "welcome",
                name: "Welcome",
                isMain: true,
                autoJoin: true,
                membershipRole: "member",
            });
            const welcomeMembers = await members(ada.client, welcome.id);
            expect(welcomeMembers).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ id: ada.id, username: "ada", kind: "human" }),
                    expect.objectContaining({
                        username: "happy",
                        kind: "agent",
                        agentRole: "default",
                    }),
                ]),
            );
            const happy = welcomeMembers.find((user) => user.username === "happy");
            expect(happy).toBeDefined();
            const welcomeMemberships = (
                await ada.client.get(`/v0/chats/${welcome.id}/members`)
            ).json().memberships as Array<{ role: string; user: { id: string } }>;
            expect(
                welcomeMemberships.find((membership) => membership.user.id === happy!.id)?.role,
            ).toBe("admin");
            expect(welcome.defaultAgentUserId).toBe(happy!.id);
            expect(welcomeMembers.filter((user) => user.kind === "agent")).toEqual([happy]);
            expect(await serviceMessageFor(ada.client, welcome.id, ada.id)).toMatchObject({
                kind: "automated",
                sender: {
                    id: happy!.id,
                    username: "happy",
                    agentRole: "default",
                },
                service: { type: "user_added", userId: ada.id },
                text: "@ada joined #welcome",
            });
            expect(
                await serviceMessageFor(ada.client, welcome.id, ada.id, "user_joined"),
            ).toMatchObject({
                kind: "automated",
                sender: {
                    id: happy!.id,
                    username: "happy",
                    agentRole: "default",
                },
                service: { type: "user_joined", userId: ada.id },
                text: "@ada joined the server",
            });

            const renamed = await ada.client.post(`/v0/chats/${welcome.id}/updateChannel`, {
                name: "Lobby",
                slug: "lobby",
                topic: "The permanent main channel",
            });
            expect(renamed.statusCode).toBe(200);
            expect(renamed.json().chat).toMatchObject({
                id: welcome.id,
                name: "Lobby",
                slug: "lobby",
                topic: "The permanent main channel",
                isMain: true,
                autoJoin: true,
            });

            const team = await ada.client.post("/v0/chats/createChannel", {
                kind: "public_channel",
                name: "Company",
                slug: "company",
            });
            expect(team.statusCode).toBe(201);
            const teamId = team.json().chat.id as string;
            expect(await members(ada.client, teamId)).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ id: ada.id }),
                    expect.objectContaining({ id: happy!.id, username: "happy" }),
                ]),
            );

            const bob = await signUp(server, "bob@example.com", "bob", "Bob");
            expect(chatById(await chats(bob.client), welcome.id)).toMatchObject({
                membershipRole: "member",
                isMain: true,
                slug: "lobby",
            });
            expect(chatById(await chats(bob.client), teamId).membershipRole).toBeUndefined();
            expect(
                await serviceMessageFor(bob.client, welcome.id, bob.id, "user_joined"),
            ).toMatchObject({
                sender: { id: happy!.id, username: "happy" },
                service: { type: "user_joined", userId: bob.id },
                text: "@bob joined the server",
            });
            expect(
                (
                    await bob.client.post("/v0/chats/createChannel", {
                        kind: "public_channel",
                        name: "Unauthorized auto-join",
                        slug: "unauthorized-auto-join",
                        autoJoin: true,
                    })
                ).statusCode,
            ).toBe(403);

            const autoJoin = await ada.client.post("/v0/chats/createChannel", {
                kind: "private_channel",
                name: "Announcements",
                slug: "announcements",
                autoJoin: true,
            });
            expect(autoJoin.statusCode).toBe(201);
            const autoJoinId = autoJoin.json().chat.id as string;
            expect(autoJoin.json().chat).toMatchObject({ autoJoin: true, isMain: false });
            expect(
                (await chats(bob.client)).find((chat) => chat.id === autoJoinId),
            ).toBeUndefined();

            const caro = await signUp(server, "caro@example.com", "caro", "Caro");
            expect(chatById(await chats(caro.client), autoJoinId).membershipRole).toBe("member");
            expect(chatById(await chats(caro.client), teamId).membershipRole).toBeUndefined();
            expect(await serviceMessageFor(caro.client, autoJoinId, caro.id)).toMatchObject({
                sender: { id: happy!.id, username: "happy" },
                service: { type: "user_added", userId: caro.id },
            });

            const manuallyAdded = await ada.client.post(`/v0/chats/${teamId}/addMember`, {
                userId: bob.id,
            });
            expect(manuallyAdded.statusCode).toBe(200);
            expect(await serviceMessageFor(bob.client, teamId, bob.id)).toMatchObject({
                sender: { id: happy!.id, username: "happy" },
                service: { type: "user_added", userId: bob.id },
            });

            const enabledAutoJoin = await ada.client.post(`/v0/chats/${teamId}/updateChannel`, {
                autoJoin: true,
            });
            expect(enabledAutoJoin.statusCode).toBe(200);
            expect(enabledAutoJoin.json().chat).toMatchObject({ autoJoin: true, isMain: false });
            expect(chatById(await chats(caro.client), teamId).membershipRole).toBeUndefined();

            const dana = await signUp(server, "dana@example.com", "dana", "Dana");
            for (const channelId of [welcome.id, autoJoinId, teamId])
                expect(chatById(await chats(dana.client), channelId).membershipRole).toBe("member");
            expect(await serviceMessageFor(dana.client, teamId, dana.id)).toMatchObject({
                sender: { id: happy!.id, username: "happy" },
                service: { type: "user_added", userId: dana.id },
            });
            expect(
                await serviceMessageFor(dana.client, welcome.id, dana.id, "user_joined"),
            ).toMatchObject({
                sender: { id: happy!.id, username: "happy" },
                service: { type: "user_joined", userId: dana.id },
                text: "@dana joined the server",
            });

            expect((await ada.client.post(`/v0/chats/${teamId}/setAsMain`)).statusCode).toBe(404);
            expect(chatById(await chats(ada.client), welcome.id).isMain).toBe(true);
            expect((await bob.client.post(`/v0/chats/${welcome.id}/leave`)).statusCode).toBe(200);
            expect(
                (await chats(bob.client)).find((chat) => chat.id === welcome.id),
            ).toBeUndefined();
            expect(
                (
                    await ada.client.post(`/v0/chats/${welcome.id}/updateChannel`, {
                        autoJoin: false,
                    })
                ).statusCode,
            ).toBe(400);
            expect(
                (
                    await ada.client.post(`/v0/chats/${welcome.id}/removeMember`, {
                        userId: bob.id,
                    })
                ).statusCode,
            ).toBe(400);
            expect(
                (await ada.client.post(`/v0/chats/${welcome.id}/archiveChannel`)).statusCode,
            ).toBe(400);
            expect(
                (await ada.client.post(`/v0/chats/${welcome.id}/deleteChannel`, {})).statusCode,
            ).toBe(400);
            expect(
                (
                    await ada.client.post(`/v0/chats/${autoJoinId}/removeMember`, {
                        userId: happy!.id,
                    })
                ).statusCode,
            ).toBe(400);
            expect((await caro.client.post(`/v0/chats/${autoJoinId}/leave`)).statusCode).toBe(200);

            await server.restart();
            expect(chatById(await chats(ada.client), welcome.id)).toMatchObject({
                name: "Lobby",
                slug: "lobby",
                isMain: true,
                autoJoin: true,
            });
            expect(chatById(await chats(ada.client), teamId)).toMatchObject({
                isMain: false,
                autoJoin: true,
            });
            expect(
                (await chats(caro.client)).find((chat) => chat.id === autoJoinId),
            ).toBeUndefined();
            expect(
                await serviceMessageFor(ada.client, welcome.id, dana.id, "user_joined"),
            ).toMatchObject({
                sender: { id: happy!.id, username: "happy" },
                service: { type: "user_joined", userId: dana.id },
            });
        });
    });
});

async function signUp(
    server: GymServer,
    email: string,
    username: string,
    firstName: string,
): Promise<{ id: string; client: GymRequestClient }> {
    const registered = await server.post("/v0/auth/password/register", {
        email,
        password: "correct horse battery staple",
    });
    expect(registered.statusCode).toBe(201);
    const client = tokenClient(server, registered.json().token as string);
    const profile = await client.post("/v0/me/createProfile", { email, firstName, username });
    expect(profile.statusCode).toBe(201);
    return { id: profile.json().user.id as string, client };
}

function tokenClient(server: GymServer, token: string): GymRequestClient {
    const options = (extra: Omit<InjectOptions, "method" | "url" | "payload"> = {}) => ({
        ...extra,
        headers: { ...extra.headers, authorization: `Bearer ${token}` },
    });
    return {
        request(request) {
            return server.request({
                ...request,
                headers: { ...request.headers, authorization: `Bearer ${token}` },
            });
        },
        get(url, extra) {
            return server.get(url, options(extra));
        },
        post(url, payload, extra) {
            return server.post(url, payload, options(extra));
        },
    };
}

async function chats(client: GymRequestClient): Promise<Array<Record<string, unknown>>> {
    const response = await client.get("/v0/chats");
    expect(response.statusCode).toBe(200);
    return response.json().chats as Array<Record<string, unknown>>;
}

async function members(
    client: GymRequestClient,
    chatId: string,
): Promise<Array<{ id: string; username: string } & Record<string, unknown>>> {
    const response = await client.get(`/v0/chats/${chatId}/members`);
    expect(response.statusCode).toBe(200);
    return response.json().users;
}

async function serviceMessageFor(
    client: GymRequestClient,
    chatId: string,
    userId: string,
    type: "user_added" | "user_joined" = "user_added",
) {
    const response = await client.get(`/v0/chats/${chatId}/messages`);
    expect(response.statusCode).toBe(200);
    const matching = (response.json().messages as Array<Record<string, unknown>>).filter(
        (candidate) =>
            (candidate.service as { type?: string; userId?: string } | undefined)?.type === type &&
            (candidate.service as { userId?: string }).userId === userId,
    );
    expect(matching).toHaveLength(1);
    return matching[0]!;
}

function chatBySlug(chats: Array<Record<string, unknown>>, slug: string) {
    const chat = chats.find((candidate) => candidate.slug === slug);
    expect(chat).toBeDefined();
    return chat! as { id: string } & Record<string, unknown>;
}

function chatById(chats: Array<Record<string, unknown>>, id: string) {
    const chat = chats.find((candidate) => candidate.id === id);
    expect(chat).toBeDefined();
    return chat!;
}

async function withPasswordPepper(run: () => Promise<void>): Promise<void> {
    const previous = process.env.HAPPY2_PASSWORD_PEPPER;
    process.env.HAPPY2_PASSWORD_PEPPER = "gym-main-channel-password-pepper";
    try {
        await run();
    } finally {
        if (previous === undefined) delete process.env.HAPPY2_PASSWORD_PEPPER;
        else process.env.HAPPY2_PASSWORD_PEPPER = previous;
    }
}
