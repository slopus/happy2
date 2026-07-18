import { describe, expect, it, vi } from "vitest";
import { composerStoreCreate } from "../composer/composerState.js";
import { draftUpdate } from "./draftState.js";

describe("draft module", () => {
    it("reconciles an existing composer and always reports persistence intent", () => {
        const composer = composerStoreCreate("chat-1");
        const draftUpdated = vi.fn();
        draftUpdate(
            {
                composerGet: (scopeId) => (scopeId === "chat-1" ? composer : undefined),
                draftUpdated,
            },
            "chat-1",
            "restored",
        );
        expect(composer.getState().text).toBe("restored");
        expect(draftUpdated).toHaveBeenCalledWith({ scopeId: "chat-1", text: "restored" });
        draftUpdate({ composerGet: () => undefined, draftUpdated }, "closed", "saved");
        expect(draftUpdated).toHaveBeenLastCalledWith({ scopeId: "closed", text: "saved" });
    });
});
