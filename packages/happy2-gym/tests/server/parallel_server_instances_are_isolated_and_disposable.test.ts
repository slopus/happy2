import { describe, expect, it } from "vitest";
import { createGymServer, withGymServer } from "../../sources/index.js";

describe("parallel server instances", () => {
    it("keeps state isolated and supports idempotent disposal", async () => {
        const first = await createGymServer();
        const second = await createGymServer();
        try {
            const firstUser = await first.createUser({ username: "same_user" });
            const secondUser = await second.createUser({ username: "same_user" });
            expect(firstUser.role).toBe("admin");
            expect(secondUser.role).toBe("admin");

            await first.as(firstUser).post("/v0/chats/createChannel", {
                kind: "public_channel",
                name: "Only in first",
                slug: "only-in-first",
            });
            await Promise.all(
                ["one", "two", "three"].map((slug) =>
                    first.as(firstUser).post("/v0/chats/createChannel", {
                        kind: "public_channel",
                        name: slug,
                        slug,
                    }),
                ),
            );
            expect((await first.as(firstUser).get("/v0/chats")).json().chats).toHaveLength(4);
            expect((await second.as(secondUser).get("/v0/chats")).json().chats).toHaveLength(0);
        } finally {
            await first.close();
            await first.close();
            await second.close();
        }
        expect(() => first.get("/v0/health")).toThrow("Gym server is closed");
    });

    it("closes a callback server when its scenario fails", async () => {
        let captured: Awaited<ReturnType<typeof createGymServer>> | undefined;
        await expect(
            withGymServer(async (server) => {
                captured = server;
                throw new Error("test failure");
            }),
        ).rejects.toThrow("test failure");
        expect(() => captured!.get("/v0/health")).toThrow("Gym server is closed");
    });
});
