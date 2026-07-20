import { happyStateCreate } from "happy2-state";
import { describe, expect, it } from "vitest";
import { createGymServer } from "../../sources/index.js";
import { createGymStateTransport } from "../../sources/state/index.js";

describe("collaborative documents across the real server boundary", () => {
    it("converges two live sessions' Y.Docs, presence, and list titles through SSE hints", async () => {
        await using server = await createGymServer();
        const owner = await server.createUser({ username: "live_doc_owner" });
        const partner = await server.createUser({ username: "live_doc_partner" });
        const ownerTransport = await createGymStateTransport(server, owner);
        const partnerTransport = await createGymStateTransport(server, partner);
        await using ownerState = happyStateCreate({
            transport: ownerTransport,
            sleep: async () => undefined,
        });
        await using partnerState = happyStateCreate({
            transport: partnerTransport,
            sleep: async () => undefined,
        });
        await ownerState.syncStart();
        await ownerTransport.whenConnected();
        await partnerState.syncStart();
        await partnerTransport.whenConnected();

        await ownerState.channelCreate({
            kind: "private_channel",
            name: "Live documents",
            slug: "live-documents",
        });
        const chatId = ownerState
            .sidebar()
            .getState()
            .chats.find((entry) => entry.chat.slug === "live-documents")!.chat.id;
        const asOwner = server.as(owner);
        await asOwner.post(`/v0/chats/${chatId}/addMember`, { userId: partner.id });

        const created = await ownerState.documentCreate(chatId, { title: "Live page" });
        expect(created).toMatchObject({ chatId, title: "Live page", format: "blocknote" });

        using ownerSession = ownerState.documentOpen(created.id);
        await ownerState.whenIdle();
        expect(ownerSession.getState().document).toMatchObject({ type: "ready" });
        using partnerSession = partnerState.documentOpen(created.id);
        await partnerState.whenIdle();
        expect(partnerSession.getState().document).toMatchObject({ type: "ready" });

        // Owner types; the batch flushes on cadence and reaches the partner as a
        // document.updated hint that reconciles through getDifference.
        ownerSession.getState().ydoc.getText("content").insert(0, "Hello from the owner.");
        await waitFor(
            () =>
                partnerSession.getState().ydoc.getText("content").toString() ===
                "Hello from the owner.",
            "partner receives the owner's edit",
        );

        // Partner replies; both Y.Docs converge to the same content.
        const partnerText = partnerSession.getState().ydoc.getText("content");
        partnerText.insert(partnerText.length, " And the partner.");
        const converged = "Hello from the owner. And the partner.";
        await waitFor(
            () => ownerSession.getState().ydoc.getText("content").toString() === converged,
            "owner receives the partner's edit",
        );
        expect(partnerSession.getState().ydoc.getText("content").toString()).toBe(converged);
        await waitFor(
            () => ownerSession.getState().saveState === "idle",
            "owner outbox drains to idle",
        );

        // Presence announced by the owner reaches the partner's roster with its payload.
        ownerSession.getState().documentPresenceUpdate({ anchor: 3, name: "Owner" }, true);
        await waitFor(
            () => partnerSession.getState().presence.length === 1,
            "partner sees the owner's presence",
        );
        expect(partnerSession.getState().presence[0]).toMatchObject({
            userId: owner.id,
            active: true,
            state: { anchor: 3, name: "Owner" },
        });
        expect(ownerSession.getState().presence).toEqual([]);

        // A rename reconciles the partner's list surface through the documents area.
        using partnerList = partnerState.documentListOpen(chatId);
        await waitFor(() => {
            const documents = partnerList.getState().documents;
            return documents.type === "ready" && documents.value.length === 1;
        }, "partner list loads");
        await ownerState.documentRename(created.id, "Live page v2");
        await waitFor(() => {
            const documents = partnerList.getState().documents;
            return (
                documents.type === "ready" && documents.value[0]?.title === "Live page v2"
            );
        }, "partner list shows the renamed title");
    });
});

async function waitFor(condition: () => boolean, label: string): Promise<void> {
    const deadline = Date.now() + 5_000;
    for (;;) {
        if (condition()) return;
        if (Date.now() > deadline) throw new Error(`Timed out waiting until ${label}`);
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
}
