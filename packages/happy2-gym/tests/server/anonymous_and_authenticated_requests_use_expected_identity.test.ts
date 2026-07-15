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
});
