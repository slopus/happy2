import { describe, expect, it } from "vitest";
import { createGymServer } from "../../sources/index.js";

describe("personal synced drafts", () => {
    it("replaces, persists, isolates, streams, and clears one user's chat draft", async () => {
        await using server = await createGymServer();
        const owner = await server.createUser({ username: "draft_owner", firstName: "Owner" });
        const collaborator = await server.createUser({
            username: "draft_collaborator",
            firstName: "Collaborator",
        });
        const outsider = await server.createUser({
            username: "draft_outsider",
            firstName: "Outsider",
        });
        const ownerNodeA = server.as(owner);
        const ownerNodeB = server.as(owner);
        const asCollaborator = server.as(collaborator);
        const asOutsider = server.as(outsider);
        const channel = await ownerNodeA.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Draft sync",
            slug: "draft-sync",
        });
        expect(channel.statusCode).toBe(201);
        const chatId = channel.json().chat.id as string;
        expect(
            (
                await ownerNodeA.post(`/v0/chats/${chatId}/addMember`, {
                    userId: collaborator.id,
                })
            ).statusCode,
        ).toBe(200);

        const ownerBaseline = (await ownerNodeB.get("/v0/sync/state")).json().state;
        const collaboratorBaseline = (await asCollaborator.get("/v0/sync/state")).json().state;
        const controller = new AbortController();
        const response = await fetch(`${await server.listen()}/v0/sync/events`, {
            headers: { authorization: `Bearer ${owner.token}` },
            signal: controller.signal,
        });
        expect(response.status).toBe(200);
        const frames = new SseFrames(response.body!.getReader());
        expect((await frames.next()).name).toBe("ready");

        const firstInput = { text: "A draft from node A" };
        const firstOptions = { headers: { "idempotency-key": "draft-node-a-1" } };
        const first = await ownerNodeA.post(
            `/v0/chats/${chatId}/updateDraft`,
            firstInput,
            firstOptions,
        );
        expect(first.statusCode).toBe(200);
        expect(first.json()).toMatchObject({
            draft: {
                chatId,
                text: "A draft from node A",
                revision: first.json().sync.sequence,
                updatedAt: expect.any(String),
            },
            sync: { areas: ["drafts"], chats: [] },
        });
        expect(Number.isNaN(Date.parse(first.json().draft.updatedAt))).toBe(false);
        const retried = await ownerNodeA.post(
            `/v0/chats/${chatId}/updateDraft`,
            firstInput,
            firstOptions,
        );
        expect(retried.json()).toEqual(first.json());
        const liveHint = await frames.until((frame) => frame.name === "sync");
        expect(liveHint.data).toMatchObject({
            sequence: first.json().sync.sequence,
            areas: ["drafts"],
            chats: [],
        });
        controller.abort();
        await frames.cancel();

        const listed = (await ownerNodeB.get("/v0/drafts")).json();
        expect(listed.drafts).toEqual([first.json().draft]);
        expect(Number.isNaN(Date.parse(listed.serverTime))).toBe(false);
        expect((await asCollaborator.get("/v0/drafts")).json().drafts).toEqual([]);
        const ownerDifference = await ownerNodeB.post("/v0/sync/getDifference", {
            state: ownerBaseline,
        });
        expect(ownerDifference.statusCode).toBe(200);
        expect(ownerDifference.json()).toMatchObject({
            kind: "difference",
            areas: ["drafts"],
            changedChats: [],
            removedChatIds: [],
        });
        const collaboratorDifference = await asCollaborator.post("/v0/sync/getDifference", {
            state: collaboratorBaseline,
        });
        expect(collaboratorDifference.statusCode).toBe(200);
        expect(collaboratorDifference.json()).toMatchObject({
            kind: "empty",
            areas: [],
            changedChats: [],
            removedChatIds: [],
        });

        expect(
            (
                await asOutsider.post(`/v0/chats/${chatId}/updateDraft`, {
                    text: "This must stay private",
                })
            ).statusCode,
        ).toBe(404);
        expect(
            (await asOutsider.post(`/v0/chats/${chatId}/updateDraft`, { text: "" })).statusCode,
        ).toBe(404);
        expect(
            (
                await ownerNodeA.post(`/v0/chats/${chatId}/updateDraft`, {
                    text: "x".repeat(40_001),
                })
            ).statusCode,
        ).toBe(400);

        await server.restart();
        expect((await ownerNodeB.get("/v0/drafts")).json().drafts).toEqual([first.json().draft]);
        const second = await ownerNodeB.post(`/v0/chats/${chatId}/updateDraft`, {
            text: "Node B wins without a compatibility branch",
        });
        expect(second.statusCode).toBe(200);
        expect(Number(second.json().draft.revision)).toBeGreaterThan(
            Number(first.json().draft.revision),
        );
        expect((await ownerNodeA.get("/v0/drafts")).json().drafts).toEqual([second.json().draft]);

        const cleared = await ownerNodeA.post(`/v0/chats/${chatId}/updateDraft`, { text: "" });
        expect(cleared.statusCode).toBe(200);
        expect(cleared.json()).toMatchObject({
            draft: { chatId, text: "", revision: cleared.json().sync.sequence },
            sync: { areas: ["drafts"], chats: [] },
        });
        expect((await ownerNodeB.get("/v0/drafts")).json().drafts).toEqual([cleared.json().draft]);
    });
});

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
            const result = await withTimeout(this.reader.read(), 3_000);
            if (result.done) throw new Error("Draft SSE stream ended before the expected frame");
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

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<T>((_, reject) => {
                timer = setTimeout(
                    () => reject(new Error("Timed out waiting for a draft SSE frame")),
                    timeoutMs,
                );
            }),
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}
