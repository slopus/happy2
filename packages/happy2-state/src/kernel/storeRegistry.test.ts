import { describe, expect, it } from "vitest";
import { StoreRegistry } from "./storeRegistry.js";

describe("StoreRegistry", () => {
    it("removes a detached value by default", () => {
        const registry = new StoreRegistry<string, object>();
        const value = registry.getOrCreate("chat-1", () => ({}));

        expect(registry.isAttached("chat-1")).toBe(true);
        expect(registry.release("chat-1")).toBe(true);
        expect(registry.get("chat-1")).toBeUndefined();
        expect(registry.isAttached("chat-1")).toBe(false);
        expect(value).toBeDefined();
    });

    it("retains a detached value and reattaches the same identity", () => {
        const registry = new StoreRegistry<string, object>({ maxDetachedEntries: 2 });
        const value = registry.getOrCreate("chat-1", () => ({}));
        registry.getOrCreate("chat-1", () => {
            throw new Error("must reuse the attached value");
        });

        expect(registry.release("chat-1")).toBe(false);
        expect(registry.isAttached("chat-1")).toBe(true);
        expect(registry.release("chat-1")).toBe(true);
        expect(registry.release("chat-1")).toBe(false);
        expect(registry.isAttached("chat-1")).toBe(false);
        expect(registry.get("chat-1")).toBe(value);
        expect(
            registry.getOrCreate("chat-1", () => {
                throw new Error("must reuse the cached value");
            }),
        ).toBe(value);
        expect([...registry.attachedValues()]).toEqual([["chat-1", value]]);
    });

    it("evicts only the least-recently-used detached values", () => {
        const registry = new StoreRegistry<string, object>({ maxDetachedEntries: 2 });
        const attached = registry.getOrCreate("attached", () => ({}));
        registry.getOrCreate("first", () => ({}));
        registry.release("first");
        const second = registry.getOrCreate("second", () => ({}));
        registry.release("second");
        const third = registry.getOrCreate("third", () => ({}));
        registry.release("third");

        expect(registry.get("attached")).toBe(attached);
        expect(registry.get("first")).toBeUndefined();
        expect(registry.get("second")).toBe(second);
        expect(registry.get("third")).toBe(third);
        expect([...registry.attachedValues()]).toEqual([["attached", attached]]);
    });
});
