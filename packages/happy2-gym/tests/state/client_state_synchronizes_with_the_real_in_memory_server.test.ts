import { createClientState } from "happy2-state";
import { describe, expect, it } from "vitest";
import { createGymServer } from "../../sources/index.js";
import { createGymStateTransport } from "../../sources/state/index.js";

describe("happy2-state with the real in-memory server", () => {
    it("uses the named facade across collaboration, files, automation, integrations, and operations", async () => {
        await using server = await createGymServer();
        const admin = await server.createUser({ username: "state_facade_admin" });
        const transport = await createGymStateTransport(server, admin);
        await using state = createClientState(transport, { sleep: async () => undefined });
        await state.start();
        await transport.whenConnected();

        await expect(state.execute("getMe")).resolves.toMatchObject({
            user: { id: admin.id, username: "state_facade_admin" },
        });
        await expect(
            state.execute("createChannel", {
                kind: "private_channel",
                name: "Facade channel",
                slug: "facade-channel",
            }),
        ).resolves.toMatchObject({ chat: { slug: "facade-channel" } });
        await expect(state.execute("getFiles", { limit: 10 })).resolves.toMatchObject({
            files: [],
        });
        await expect(state.execute("getScheduledMessages")).resolves.toEqual({ messages: [] });
        await expect(state.execute("getBots")).resolves.toEqual({ bots: [] });
        await expect(state.execute("getIntegrations")).resolves.toEqual({ integrations: [] });
        await expect(state.execute("getBackups", { limit: 10 })).resolves.toMatchObject({
            backups: [],
        });
        await expect(state.execute("getAuditLogs", { limit: 10 })).resolves.toEqual(
            expect.objectContaining({ auditLogs: expect.any(Array) }),
        );
        expect(state.result("getMe")?.user.id).toBe(admin.id);
        expect(state.get().chats).toContainEqual(
            expect.objectContaining({ slug: "facade-channel" }),
        );
    });

    it("loads authenticated state and reconciles messages emitted by another client", async () => {
        await using server = await createGymServer();
        const owner = await server.createUser({ username: "state_owner" });
        const member = await server.createUser({ username: "state_member" });
        const asOwner = server.as(owner);
        const channel = await asOwner.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Real state gym",
            slug: "real-state-gym",
        });
        const chatId = channel.json().chat.id as string;
        expect(
            (await asOwner.post(`/v0/chats/${chatId}/addMember`, { userId: member.id })).statusCode,
        ).toBe(200);

        const transport = await createGymStateTransport(server, member);
        await using state = createClientState(transport, {
            sleep: async () => undefined,
        });
        await state.start();
        await transport.whenConnected();
        await state.loadMessages(chatId);
        expect(state.get().messagesByChat[chatId]?.map(({ message }) => message.text)).toEqual([
            "@state_member joined #real-state-gym",
        ]);

        const sent = await asOwner.post(`/v0/chats/${chatId}/sendMessage`, {
            text: "Delivered through real SSE and durable differences",
        });
        expect(sent.statusCode).toBe(201);
        const messageId = sent.json().message.id as string;

        await expect
            .poll(() => state.get().messagesByChat[chatId]?.map(({ message }) => message.id), {
                timeout: 3_000,
            })
            .toContain(messageId);
        expect(
            state.get().messagesByChat[chatId]?.find(({ message }) => message.id === messageId),
        ).toMatchObject({
            delivery: "sent",
            message: {
                id: messageId,
                text: "Delivered through real SSE and durable differences",
            },
        });
    });
});
