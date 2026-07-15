import { afterEach, describe, expect, it, vi } from "vitest";
import { createServerClient } from "./server";

describe("Happy (2) server client", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("discovers the server method and sends bearer credentials", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({ role: "all", method: "password", signupEnabled: true }),
                    { status: 200 },
                ),
            )
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({ user: { id: "user", firstName: "Ada", username: "ada" } }),
                    { status: 200 },
                ),
            );
        vi.stubGlobal("fetch", fetchMock);
        const client = createServerClient("http://127.0.0.1:3000/");
        expect(await client.methods()).toMatchObject({ method: "password", signupEnabled: true });
        expect((await client.me("session-token")).user.username).toBe("ada");
        expect(fetchMock.mock.calls[1]?.[0]).toBe("http://127.0.0.1:3000/v0/me");
        expect(fetchMock.mock.calls[1]?.[1].headers.authorization).toBe("Bearer session-token");
    });

    it("surfaces server response failures as typed errors", async () => {
        vi.stubGlobal(
            "fetch",
            vi
                .fn()
                .mockResolvedValue(
                    new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }),
                ),
        );
        await expect(createServerClient("http://server").me("bad")).rejects.toMatchObject({
            status: 401,
            code: "unauthorized",
        });
    });
});
