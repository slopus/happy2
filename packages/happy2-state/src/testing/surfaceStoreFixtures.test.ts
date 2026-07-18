import { describe, expect, it, vi } from "vitest";
import { UserError } from "../types.js";
import { chatStoreFixtureCreate, filesStoreFixtureCreate } from "./surfaceStoreFixtures.js";

describe("surface store fixtures", () => {
    it("drives authoritative state only through a test-owned closed input union", () => {
        using fixture = filesStoreFixtureCreate();
        fixture.input({ type: "filesLoading" });
        expect(fixture.store.getState().status.type).toBe("loading");
        fixture.input({ type: "filesFailed", error: new UserError("offline") });
        expect(fixture.store.getState().status).toMatchObject({ type: "error" });
    });

    it("preserves public store actions and their typed output listener", () => {
        const output = vi.fn();
        using fixture = chatStoreFixtureCreate("chat-1", output);
        fixture.store.getState().membersRetain();
        expect(fixture.store.getState().members.type).toBe("loading");
        expect(output).toHaveBeenCalledWith({ type: "membersRetained", chatId: "chat-1" });
    });
});
