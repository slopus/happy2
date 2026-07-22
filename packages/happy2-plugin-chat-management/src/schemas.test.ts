import { describe, expect, it } from "vitest";
import { childCreateSchema } from "./schemas.js";

describe("child channel creation schema", () => {
    it.each(["agents", "people"] as const)("accepts an optional %s initial message", (audience) => {
        expect(
            childCreateSchema.parse({
                name: "Parallel work",
                initialMessage: { audience, text: "Investigate the failing test." },
            }),
        ).toEqual({
            name: "Parallel work",
            initialMessage: { audience, text: "Investigate the failing test." },
        });
    });

    it("keeps initial messages closed, bounded, and optional", () => {
        expect(childCreateSchema.parse({ name: "Context only" })).toEqual({
            name: "Context only",
        });
        expect(() =>
            childCreateSchema.parse({
                name: "Invalid audience",
                initialMessage: { audience: "everyone", text: "Hello" },
            }),
        ).toThrow();
        expect(() =>
            childCreateSchema.parse({
                name: "Empty message",
                initialMessage: { audience: "people", text: "" },
            }),
        ).toThrow();
        expect(() =>
            childCreateSchema.parse({
                name: "Unexpected field",
                initialMessage: { audience: "people", text: "Hello", extra: true },
            }),
        ).toThrow();
    });
});
