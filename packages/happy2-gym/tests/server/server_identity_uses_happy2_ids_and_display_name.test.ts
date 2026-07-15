import { describe, expect, it } from "vitest";
import { createGymServer } from "../../sources/index.js";

describe("happy2 server identity", () => {
    it("uses the happy2 service ID and Happy (2) display name", async () => {
        await using server = await createGymServer();

        const status = await server.get("/");
        expect(status.statusCode).toBe(200);
        expect(status.json()).toEqual({ service: "happy2", status: "ok" });

        const admin = await server.createUser({ username: "identity_admin" });
        const profile = await server.as(admin).get("/v0/server");
        expect(profile.statusCode).toBe(200);
        expect(profile.json().server).toMatchObject({ name: "Happy (2)" });
    });
});
