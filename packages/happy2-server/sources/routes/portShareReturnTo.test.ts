import { describe, expect, it } from "vitest";
import { portShareReturnTo } from "./portShareReturnTo.js";

describe("port-share browser return paths", () => {
    it("accepts only origin-relative preview paths", () => {
        expect(portShareReturnTo("/preview?copied=1#result")).toBe("/preview?copied=1#result");

        for (const invalid of [
            undefined,
            "",
            "preview",
            "https://evil.example/preview",
            "//evil.example/preview",
            "/safe\\evil",
            "/safe\nevil",
            `/safe${String.fromCodePoint(0x7f)}evil`,
            `/${"a".repeat(4_096)}`,
        ]) {
            expect(() => portShareReturnTo(invalid)).toThrow(
                "returnTo must be an origin-relative preview path",
            );
        }
    });
});
