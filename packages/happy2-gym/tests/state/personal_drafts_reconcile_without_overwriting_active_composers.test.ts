import { happyStateCreate } from "happy2-state";
import { describe, expect, it } from "vitest";
import { createGymServer } from "../../sources/index.js";
import { createGymStateTransport } from "../../sources/state/index.js";

describe("personal drafts across happy2-state and the real server", () => {
    it("syncs text and deletion while an active composer rejects and overwrites arrivals", async () => {
        await using server = await createGymServer();
        const owner = await server.createUser({ username: "state_draft_owner" });
        const client = server.as(owner);
        const created = await client.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "State draft sync",
            slug: "state-draft-sync",
        });
        const chatId = created.json().chat.id as string;

        const transportA = await createGymStateTransport(server, owner);
        const transportB = await createGymStateTransport(server, owner);
        const errorsA: string[] = [];
        const errorsB: string[] = [];
        await using stateA = happyStateCreate({
            transport: transportA,
            backgroundError: (error) => errorsA.push(error.message),
        });
        await using stateB = happyStateCreate({
            transport: transportB,
            backgroundError: (error) => errorsB.push(error.message),
        });
        await Promise.all([stateA.syncStart(), stateB.syncStart()]);
        await Promise.all([transportA.whenConnected(), transportB.whenConnected()]);
        const composerA = stateA.composer(chatId);
        const composerB = stateB.composer(chatId);

        composerA.getState().textUpdate("from node A");
        await stateA.whenIdle();
        await expect.poll(() => composerB.getState().text, { timeout: 5_000 }).toBe("from node A");

        composerB.getState().focusUpdate(true);
        composerB.getState().textUpdate("active on node B");
        await stateB.whenIdle();
        composerA.getState().textUpdate("arrival must lose");
        await stateA.whenIdle();

        await expect
            .poll(async () => (await client.get("/v0/drafts")).json().drafts[0]?.text, {
                timeout: 5_000,
            })
            .toBe("active on node B");
        expect(composerB.getState().text).toBe("active on node B");

        composerB.getState().focusUpdate(false);
        composerB.getState().textUpdate("");
        await stateB.whenIdle();
        await expect.poll(() => composerA.getState().text, { timeout: 5_000 }).toBe("");
        expect((await client.get("/v0/drafts")).json().drafts).toMatchObject([
            { chatId, text: "", updatedAt: expect.any(String) },
        ]);
        expect(errorsA).toEqual([]);
        expect(errorsB).toEqual([]);
    }, 15_000);
});
