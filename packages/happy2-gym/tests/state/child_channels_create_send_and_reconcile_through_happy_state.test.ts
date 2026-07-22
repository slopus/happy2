import { happyStateCreate } from "happy2-state";
import { describe, expect, it } from "vitest";
import { createGymServer } from "../../sources/index.js";
import { createGymStateTransport } from "../../sources/state/index.js";

describe("child channels create, send, and reconcile through happy2-state", () => {
    it("keeps a first-class child channel in the sidebar and reconciles its ordinary unread state", async () => {
        await using server = await createGymServer();
        const owner = await server.createUser({ username: "state_child_owner" });
        const member = await server.createUser({ username: "state_child_member" });
        const ownerClient = server.as(owner);
        const memberClient = server.as(member);

        const parentResponse = await ownerClient.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Child channel parent",
            slug: "state-child-parent",
        });
        expect(parentResponse.statusCode).toBe(201);
        const parentChatId = parentResponse.json().chat.id as string;
        expect(
            (await ownerClient.post(`/v0/chats/${parentChatId}/addMember`, { userId: member.id }))
                .statusCode,
        ).toBe(200);

        const ownerTransport = await createGymStateTransport(server, owner);
        const memberTransport = await createGymStateTransport(server, member);
        const ownerErrors: string[] = [];
        const memberErrors: string[] = [];
        await using ownerState = happyStateCreate({
            transport: ownerTransport,
            sleep: async () => undefined,
            backgroundError: (error) => ownerErrors.push(error.message),
        });
        await using memberState = happyStateCreate({
            transport: memberTransport,
            sleep: async () => undefined,
            backgroundError: (error) => memberErrors.push(error.message),
        });
        await ownerState.syncStart();
        await memberState.syncStart();
        await ownerTransport.whenConnected();
        await memberTransport.whenConnected();
        await ownerState.whenIdle();
        await memberState.whenIdle();

        // The owner creates the child through the state action; there is no reply
        // indirection, only an ordinary first-class channel with a parent.
        await ownerState.channelCreateChild({
            parentChatId,
            name: "Focused work",
            slug: "state-focused-work",
        });
        await ownerState.whenIdle();

        const childProjection = ownerState
            .sidebar()
            .getState()
            .chats.find(({ chat }) => chat.slug === "state-focused-work");
        expect(childProjection).toBeDefined();
        expect(childProjection!.chat).toMatchObject({
            kind: "private_channel",
            name: "Focused work",
            parentChatId,
        });
        const childChatId = childProjection!.id;
        // The parent remains a distinct top-level entry beside its child.
        expect(
            ownerState
                .sidebar()
                .getState()
                .chats.some(({ id }) => id === parentChatId),
        ).toBe(true);

        expect((await memberClient.post(`/v0/chats/${childChatId}/join`)).statusCode).toBe(200);

        // The explicitly joined child reconciles into the member's sidebar over
        // the realtime stream as a first-class channel.
        await expect
            .poll(
                () =>
                    memberState
                        .sidebar()
                        .getState()
                        .chats.find(({ id }) => id === childChatId)?.chat.parentChatId,
                { timeout: 5_000 },
            )
            .toBe(parentChatId);

        using ownerChild = ownerState.chatOpen(childChatId);
        await ownerState.whenIdle();
        ownerState.messageSend(childChatId, { text: "First message in the child channel" });
        await ownerState.whenIdle();
        expect(
            ownerChild
                .getState()
                .messages.filter((item) => !item.message.service)
                .map((item) => ({
                    delivery: item.delivery,
                    chatId: item.message.chatId,
                    text: item.message.text,
                })),
        ).toEqual([
            {
                delivery: "sent",
                chatId: childChatId,
                text: "First message in the child channel",
            },
        ]);

        // The child carries ordinary channel unread state for the joined member
        // who has not opened it yet.
        await expect
            .poll(
                () =>
                    memberState
                        .sidebar()
                        .getState()
                        .chats.find(({ id }) => id === childChatId)?.chat.unreadCount,
                { timeout: 5_000 },
            )
            .toBe(1);

        using memberChild = memberState.chatOpen(childChatId);
        await memberState.whenIdle();
        expect(memberChild.getState().messages.map((item) => item.message.text)).toContain(
            "First message in the child channel",
        );
        await memberState.chatReadMark(childChatId);
        await memberState.whenIdle();
        await expect
            .poll(
                () =>
                    memberState
                        .sidebar()
                        .getState()
                        .chats.find(({ id }) => id === childChatId)?.chat.unreadCount,
                { timeout: 5_000 },
            )
            .toBe(0);

        // A realtime reply from the member reconciles into the owner's open child
        // channel without any reply indirection.
        memberState.messageSend(childChatId, { text: "Realtime reply in the child channel" });
        await memberState.whenIdle();
        await expect
            .poll(
                () =>
                    ownerChild
                        .getState()
                        .messages.find(
                            (item) => item.message.text === "Realtime reply in the child channel",
                        )?.delivery,
                { timeout: 5_000 },
            )
            .toBe("sent");

        expect(ownerErrors).toEqual([]);
        expect(memberErrors).toEqual([]);
    }, 20_000);
});
