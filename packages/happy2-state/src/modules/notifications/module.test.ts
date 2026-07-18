import { describe, expect, it, vi } from "vitest";
import { UserError } from "../../types.js";
import { notificationsStoreCreate } from "./notificationsState.js";

describe("notifications module", () => {
    it("emits exact read targets and preserves ready rows across append/read failures", () => {
        const output = vi.fn();
        const binding = notificationsStoreCreate(output);
        binding.getState().notificationsInput({
            type: "notificationsLoaded",
            notifications: [{ id: "n-1", kind: "system", createdAt: "now" }],
            nextCursor: "cursor",
        });
        binding.getState().notificationsRead(["n-1"]);
        binding.getState().notificationsReadAll();
        binding.getState().notificationsMore();
        binding.getState().notificationsMore();
        expect(output.mock.calls.map(([event]) => event)).toEqual([
            { type: "notificationsReadSubmitted", notificationIds: ["n-1"] },
            { type: "notificationsReadSubmitted", all: true },
            { type: "notificationsMoreRequested" },
        ]);
        const pageError = new UserError("page");
        binding
            .getState()
            .notificationsInput({ type: "notificationsPageFailed", error: pageError });
        expect(binding.getState()).toMatchObject({
            notifications: { type: "ready", value: [{ id: "n-1" }] },
            pageLoading: false,
            pageError,
        });
        binding.getState().notificationsInput({
            type: "notificationsReadFailed",
            error: new UserError("read"),
        });
        expect(binding.getState().readState.type).toBe("error");
        binding.getState().notificationsInput({ type: "notificationsReadSucceeded" });
        expect(binding.getState().readState.type).toBe("idle");
    });

    it("does not request pagination while a refresh owns the list", () => {
        const output = vi.fn();
        const binding = notificationsStoreCreate(output);
        binding.getState().notificationsInput({
            type: "notificationsLoaded",
            notifications: [],
            nextCursor: "cursor",
        });
        binding.getState().notificationsInput({ type: "notificationsLoading" });
        binding.getState().notificationsMore();
        expect(output).not.toHaveBeenCalled();
    });
});
