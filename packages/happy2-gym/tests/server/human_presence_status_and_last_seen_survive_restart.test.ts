import { describe, expect, it } from "vitest";
import { createGymServer } from "../../sources/index.js";

describe("human presence status and last seen", () => {
    it("publishes durable presence changes and exposes last seen after restart", async () => {
        await using server = await createGymServer();
        const admin = await server.createUser({ username: "presence_observer" });
        const member = await server.createUser({ username: "presence_member" });
        const idle = await server.createUser({ username: "presence_idle" });
        const asAdmin = server.as(admin);
        const asMember = server.as(member);

        expect((await asMember.get("/v0/me")).statusCode).toBe(200);
        const initial = await asAdmin.get("/v0/sync/state");
        expect(initial.statusCode).toBe(200);
        await new Promise((resolve) => setTimeout(resolve, 1_100));

        const controller = new AbortController();
        const response = await fetch(`${await server.listen()}/v0/sync/events`, {
            headers: { authorization: `Bearer ${member.token}` },
            signal: controller.signal,
        });
        expect(response.status).toBe(200);
        const reader = response.body!.getReader();
        const connectionId = await waitForReady(reader);
        const beforeHeartbeat = await asAdmin.get("/v0/directory/users");
        expect(
            beforeHeartbeat.json().users.find((user: { id: string }) => user.id === member.id),
        ).not.toHaveProperty("lastSeenAt");

        const heartbeat = await asMember.post("/v0/me/updatePresence", { connectionId });
        expect(heartbeat.statusCode).toBe(200);
        expect(heartbeat.json().presence).toMatchObject({
            userId: member.id,
            status: "online",
            connectionCount: 1,
            lastSeenAt: expect.any(Number),
            expiresAt: expect.any(Number),
        });
        expect(heartbeat.json().presence.expiresAt - heartbeat.json().presence.lastSeenAt).toBe(
            60_000,
        );
        const whileOnline = await asAdmin.post("/v0/sync/getDifference", {
            state: initial.json().state,
            limit: 100,
        });
        expect(whileOnline.statusCode).toBe(200);
        expect(whileOnline.json().areas).not.toContain("presence");
        controller.abort();
        await reader.cancel().catch(() => undefined);

        await eventually(
            async () =>
                asAdmin.post("/v0/sync/getDifference", {
                    state: initial.json().state,
                    limit: 100,
                }),
            (offlineDifference) => offlineDifference.json().areas.includes("presence"),
        );

        const beforeRestart = await eventually(
            async () => {
                const directory = await asAdmin.get("/v0/directory/users");
                return directory
                    .json()
                    .users.find((user: { id: string }) => user.id === member.id) as
                    | { lastSeenAt?: string }
                    | undefined;
            },
            (contact) => typeof contact?.lastSeenAt === "string",
        );
        const lastSeenAt = beforeRestart!.lastSeenAt!;

        const updated = await asMember.post("/v0/me/updateStatus", {
            availability: "away",
            customStatusText: "Reviewing presence",
            customStatusEmoji: "🌙",
        });
        expect(updated.statusCode).toBe(200);
        expect(updated.json().status).toMatchObject({
            userId: member.id,
            availability: "away",
            customStatusText: "Reviewing presence",
            customStatusEmoji: "🌙",
        });

        const difference = await asAdmin.post("/v0/sync/getDifference", {
            state: initial.json().state,
            limit: 100,
        });
        expect(difference.statusCode).toBe(200);
        expect(difference.json().areas).toContain("presence");

        const administration = await asAdmin.get("/v0/admin/users");
        const privateMember = administration
            .json()
            .users.find((user: { id: string }) => user.id === member.id) as {
            lastAccessAt?: string;
        };
        expect(privateMember.lastAccessAt).toEqual(expect.any(String));
        expect(lastSeenAt).not.toBe(privateMember.lastAccessAt);

        await server.restart();

        const directory = await asAdmin.get("/v0/directory/users");
        expect(directory.statusCode).toBe(200);
        const users = directory.json().users as Array<{
            id: string;
            kind: "agent" | "human";
            lastSeenAt?: string;
            agentRole?: "default";
        }>;
        const contact = users.find((user) => user.id === member.id);
        expect(contact).toMatchObject({
            id: member.id,
            kind: "human",
            lastSeenAt,
        });
        expect(contact).not.toHaveProperty("lastAccessAt");
        expect(users.find((user) => user.id === idle.id)).not.toHaveProperty("lastSeenAt");
        const happy = users.find((user) => user.agentRole === "default");
        expect(happy).toMatchObject({ kind: "agent" });
        expect(happy).not.toHaveProperty("lastSeenAt");

        const presence = await asAdmin.get("/v0/presence");
        expect(presence.statusCode).toBe(200);
        expect(presence.json().statuses).toContainEqual(
            expect.objectContaining({
                userId: member.id,
                availability: "away",
                customStatusText: "Reviewing presence",
                customStatusEmoji: "🌙",
            }),
        );
        expect(presence.json().presence).toContainEqual(
            expect.objectContaining({ userId: member.id, status: "offline" }),
        );
        expect(presence.json().presence).toContainEqual(
            expect.objectContaining({ userId: happy!.id, status: "offline" }),
        );
    });
});

async function waitForReady(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
    let buffer = "";
    for (;;) {
        const delimiter = buffer.indexOf("\n\n");
        if (delimiter >= 0) {
            const frame = buffer.slice(0, delimiter);
            buffer = buffer.slice(delimiter + 2);
            if (/^event: ready$/m.test(frame)) {
                const data = /^data: (.+)$/m.exec(frame)?.[1];
                if (!data) throw new Error("Presence ready event had no data");
                return (JSON.parse(data) as { connectionId: string }).connectionId;
            }
            continue;
        }
        const result = await reader.read();
        if (result.done) throw new Error("Presence stream ended before ready");
        buffer += new TextDecoder().decode(result.value, { stream: true });
    }
}

async function eventually<T>(read: () => Promise<T>, predicate: (value: T) => boolean): Promise<T> {
    const deadline = Date.now() + 3_000;
    for (;;) {
        const value = await read();
        if (predicate(value)) return value;
        if (Date.now() >= deadline) throw new Error("Timed out waiting for durable last seen");
        await new Promise((resolve) => setTimeout(resolve, 25));
    }
}
