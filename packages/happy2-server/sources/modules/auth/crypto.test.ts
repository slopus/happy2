import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./crypto.js";

describe("password hashing", () => {
    it("uses a per-password salt and requires the persisted pepper", async () => {
        const hash = await hashPassword("a-safe-password", "server-pepper");
        expect(await verifyPassword("a-safe-password", hash, "server-pepper")).toBe(true);
        expect(await verifyPassword("a-safe-password", hash, "other-pepper")).toBe(false);
        expect(await verifyPassword("wrong-password", hash, "server-pepper")).toBe(false);
    });
});
