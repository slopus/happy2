import { happyStateCreate } from "happy2-state";
import { describe, expect, it } from "vitest";
import { createGymServer } from "../../sources/index.js";
import { createGymStateTransport } from "../../sources/state/index.js";

describe("the document collection across the real server boundary", () => {
    it("lists every visible document and reconciles when attachments change", async () => {
        await using server = await createGymServer();
        const owner = await server.createUser({ username: "collection_owner" });
        const teammate = await server.createUser({ username: "collection_teammate" });
        const ownerTransport = await createGymStateTransport(server, owner);
        const teammateTransport = await createGymStateTransport(server, teammate);
        await using ownerState = happyStateCreate({
            transport: ownerTransport,
            sleep: async () => undefined,
        });
        await using teammateState = happyStateCreate({
            transport: teammateTransport,
            sleep: async () => undefined,
        });
        await ownerState.syncStart();
        await ownerTransport.whenConnected();
        await teammateState.syncStart();
        await teammateTransport.whenConnected();

        await ownerState.channelCreate({
            kind: "private_channel",
            name: "Planning",
            slug: "planning",
        });
        await ownerState.channelCreate({
            kind: "private_channel",
            name: "Research",
            slug: "research",
        });
        const chatIdOf = (slug: string) =>
            ownerState
                .sidebar()
                .getState()
                .chats.find((entry) => entry.chat.slug === slug)!.chat.id;
        const planningId = chatIdOf("planning");
        const researchId = chatIdOf("research");

        const planningDoc = await ownerState.documentCreate(planningId, { title: "Roadmap" });
        const researchDoc = await ownerState.documentCreate(researchId, { title: "Interviews" });

        // The owner's collection spans both channels regardless of which one is open.
        const ownerCollection = ownerState.documentCollection();
        await waitFor(
            () => readyTitles(ownerCollection).length === 2,
            "owner collection loads both documents",
        );
        expect(readyTitles(ownerCollection)).toEqual(["Interviews", "Roadmap"]);

        // A non-member sees nothing: the collection is a visibility projection,
        // not a listing of everything on the server.
        const teammateCollection = teammateState.documentCollection();
        await teammateState.whenIdle();
        expect(readyTitles(teammateCollection)).toEqual([]);

        // Joining one channel reveals exactly that channel's document.
        const asOwner = server.as(owner);
        await asOwner.post(`/v0/chats/${planningId}/addMember`, { userId: teammate.id });
        await waitFor(
            () => readyTitles(teammateCollection).length === 1,
            "teammate sees the planning document after joining",
        );
        expect(readyTitles(teammateCollection)).toEqual(["Roadmap"]);
        expect(
            readyDocuments(teammateCollection)[0]!.channelAttachments.map((one) => one.chatId),
        ).toEqual([planningId]);

        // Attaching the research document to planning reconciles the teammate's
        // collection live, without them joining the research channel.
        await asOwner.post(`/v0/documents/${researchDoc.id}/attach`, { chatId: planningId });
        await waitFor(
            () => readyTitles(teammateCollection).length === 2,
            "teammate sees the newly attached document",
        );
        expect(readyTitles(teammateCollection)).toEqual(["Interviews", "Roadmap"]);
        // The teammate only sees the attachment they can actually reach.
        expect(
            readyDocuments(teammateCollection)
                .find((one) => one.title === "Interviews")!
                .channelAttachments.map((one) => one.chatId),
        ).toEqual([planningId]);

        // Detaching removes it from their collection while the document itself
        // survives for its owner.
        await asOwner.post(`/v0/documents/${researchDoc.id}/detach`, { chatId: planningId });
        await waitFor(
            () => readyTitles(teammateCollection).length === 1,
            "teammate loses the detached document",
        );
        expect(readyTitles(teammateCollection)).toEqual(["Roadmap"]);
        expect(readyTitles(ownerCollection)).toEqual(["Interviews", "Roadmap"]);
        expect(planningDoc.id).not.toBe(researchDoc.id);
    }, 30_000);
});

function readyDocuments(
    store: ReturnType<ReturnType<typeof happyStateCreate>["documentCollection"]>,
) {
    const documents = store.getState().documents;
    return documents.type === "ready" ? documents.value : [];
}

function readyTitles(
    store: ReturnType<ReturnType<typeof happyStateCreate>["documentCollection"]>,
): string[] {
    return readyDocuments(store)
        .map((one) => one.title)
        .sort();
}

async function waitFor(condition: () => boolean, label: string): Promise<void> {
    const deadline = Date.now() + 5_000;
    for (;;) {
        if (condition()) return;
        if (Date.now() > deadline) throw new Error(`Timed out waiting until ${label}`);
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
}
