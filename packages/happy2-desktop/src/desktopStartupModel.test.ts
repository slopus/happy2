import { describe, expect, it } from "vitest";
import { desktopStartRequestFromValues, desktopStartupValues } from "./desktopStartupModel";

describe("desktop startup form model", () => {
    it("derives fresh local defaults when there is no in-flight request", () => {
        expect(desktopStartupValues()).toEqual({ mode: "local", cloudUrl: "" });
        expect(desktopStartupValues({ mode: "local" })).toEqual({ mode: "local", cloudUrl: "" });
    });

    it("round-trips a starting or failed cloud request through its HTTPS origin", () => {
        expect(
            desktopStartupValues({ mode: "cloud", serverUrl: "https://happy.example.test" }),
        ).toEqual({ mode: "cloud", cloudUrl: "https://happy.example.test" });
    });

    it("projects each closed form mode to its start request without rewriting the origin", () => {
        expect(desktopStartRequestFromValues({ mode: "local", cloudUrl: "" })).toEqual({
            mode: "local",
        });
        expect(
            desktopStartRequestFromValues({
                mode: "cloud",
                cloudUrl: "https://happy.example.test",
            }),
        ).toEqual({ mode: "cloud", serverUrl: "https://happy.example.test" });
        // The cloud value is forwarded verbatim: the desktop main validator owns
        // every HTTPS/origin rule, so the model never normalizes it.
        expect(
            desktopStartRequestFromValues({
                mode: "cloud",
                cloudUrl: "  http://happy.example.test/x ",
            }),
        ).toEqual({ mode: "cloud", serverUrl: "  http://happy.example.test/x " });
    });
});
