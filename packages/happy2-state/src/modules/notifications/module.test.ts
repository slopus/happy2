import { describe, expect, it, vi } from "vitest";
import { UserError } from "../../types.js";
import { notificationsStoreCreateBinding } from "./notificationsStore.js";

describe("notifications module", () => {
    it("emits exact read targets and preserves ready rows across append/read failures", () => {
        const output = vi.fn();
        const binding = notificationsStoreCreateBinding(output);
        binding.notificationsInput({
            type: "notificationsLoaded",
            notifications: [{ id: "n-1", kind: "system", createdAt: "now" }],
            nextCursor: "cursor",
        });
        binding.store.notificationsRead(["n-1"]);
        binding.store.notificationsReadAll();
        binding.store.notificationsMore();
        expect(output.mock.calls.map(([event]) => event)).toEqual([
            { type: "notificationsReadSubmitted", notificationIds: ["n-1"] },
            { type: "notificationsReadSubmitted", all: true },
            { type: "notificationsMoreRequested" },
        ]);
        const pageError = new UserError("page");
        binding.notificationsInput({ type: "notificationsPageFailed", error: pageError });
        expect(binding.store.get()).toMatchObject({
            notifications: { type: "ready", value: [{ id: "n-1" }] },
            pageError,
        });
        binding.notificationsInput({
            type: "notificationsReadFailed",
            error: new UserError("read"),
        });
        expect(binding.store.get().readState.type).toBe("error");
        binding.notificationsInput({ type: "notificationsReadSucceeded" });
        expect(binding.store.get().readState.type).toBe("idle");
        binding.dispose();
        binding.store.notificationsReadAll();
        expect(output).toHaveBeenCalledTimes(3);
    });

    it("does not request pagination while a refresh owns the list", () => {
        const output = vi.fn();
        const binding = notificationsStoreCreateBinding(output);
        binding.notificationsInput({
            type: "notificationsLoaded",
            notifications: [],
            nextCursor: "cursor",
        });
        binding.notificationsInput({ type: "notificationsLoading" });
        binding.store.notificationsMore();
        expect(output).not.toHaveBeenCalled();
        binding.dispose();
    });
});
