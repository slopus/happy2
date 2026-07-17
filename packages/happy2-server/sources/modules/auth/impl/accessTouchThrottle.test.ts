import { describe, expect, it } from "vitest";
import { accessTouchThrottle } from "./accessTouchThrottle.js";

describe("access telemetry throttle", () => {
    it("allows one touch per identity and interval without becoming authority", () => {
        const shouldTouch = accessTouchThrottle(60_000);

        expect(shouldTouch("session-a", "user-a", 100_000)).toBe(true);
        expect(shouldTouch("session-a", "user-a", 159_999)).toBe(false);
        expect(shouldTouch("session-b", "user-a", 159_999)).toBe(true);
        expect(shouldTouch("session-a", "user-a", 160_000)).toBe(true);
    });

    it("keys external authentication by user and bounds retained entries", () => {
        const shouldTouch = accessTouchThrottle(60_000, 1);

        expect(shouldTouch(undefined, "user-a", 100_000)).toBe(true);
        expect(shouldTouch(undefined, "user-b", 100_000)).toBe(true);
        expect(shouldTouch(undefined, "user-a", 100_001)).toBe(true);
    });
});
