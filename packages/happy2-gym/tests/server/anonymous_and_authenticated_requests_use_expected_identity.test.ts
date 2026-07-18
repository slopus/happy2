import { describe, expect, it } from "vitest";
import { createGymServer } from "../../sources/index.js";

describe("anonymous and authenticated requests", () => {
    it("uses the expected identity", async () => {
        await using server = await createGymServer();

        const health = await server.get("/v0/health");
        expect(health.statusCode).toBe(200);
        expect(health.json()).toEqual({ status: "ok" });

        const anonymous = await server.get("/v0/me");
        expect(anonymous.statusCode).toBe(401);

        const user = await server.createUser({ firstName: "Ada", username: "ada" });
        const current = await server.as(user).get("/v0/me");
        expect(current.statusCode).toBe(200);
        expect(current.json().user).toMatchObject({ id: user.id, firstName: "Ada" });
    });

    it("rejects a session token issued by a separately scoped Gym server", async () => {
        await using issuingServer = await createGymServer();
        await using receivingServer = await createGymServer();
        const user = await issuingServer.createUser({ username: "ada" });

        const response = await receivingServer.get("/v0/me", {
            headers: { authorization: `Bearer ${user.token}` },
        });

        // Gym servers share test signing keys for startup performance; the
        // authenticated route must still reject a token without its session row.
        expect(response.statusCode).toBe(401);
    });
});
