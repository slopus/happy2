import { happyStateCreate } from "happy2-state";
import { describe, expect, it } from "vitest";
import { createGymServer } from "../../sources/index.js";
import { createGymStateTransport } from "../../sources/state/index.js";

describe("HappyState surface stores across the real server boundary", () => {
    it("routes channel creation and optimistic messaging into retained sidebar and chat stores", async () => {
        await using server = await createGymServer();
        const owner = await server.createUser({ username: "surface_state_owner" });
        const transport = await createGymStateTransport(server, owner);
        await using state = happyStateCreate({ transport, sleep: async () => undefined });
        await state.syncStart();
        await transport.whenConnected();

        await state.channelCreate({
            kind: "private_channel",
            name: "Surface state laboratory",
            slug: "surface-state-laboratory",
        });
        const created = state
            .sidebar()
            .get()
            .chats.find((chat) => chat.chat.slug === "surface-state-laboratory");
        expect(created).toMatchObject({
            displayName: "Surface state laboratory",
            chat: { membershipRole: "owner" },
        });

        using chat = state.chatOpen(created!.chat.id);
        await state.whenIdle();
        expect(chat.get()).toMatchObject({ status: { type: "ready" }, messages: [] });

        state.messageSend(created!.chat.id, { text: "one retained surface message" });
        expect(chat.get().messages).toEqual([
            expect.objectContaining({
                delivery: "sending",
                message: expect.objectContaining({ text: "one retained surface message" }),
            }),
        ]);
        await state.whenIdle();
        expect(chat.get().messages).toEqual([
            expect.objectContaining({
                delivery: "sent",
                message: expect.objectContaining({ text: "one retained surface message" }),
            }),
        ]);
    });
});
