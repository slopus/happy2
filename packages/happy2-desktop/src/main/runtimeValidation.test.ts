import { describe, expect, it } from "vitest";
import {
    desktopLocalCapabilityValueValidate,
    desktopActiveTarget,
    desktopStartRequestValidate,
    desktopTopologyIdValidate,
    desktopTopologyTarget,
} from "./runtimeValidation";

describe("desktop startup request validation", () => {
    it("accepts only local and normalized cloud requests", () => {
        expect(desktopStartRequestValidate({ mode: "local" })).toEqual({ mode: "local" });
        expect(
            desktopStartRequestValidate({
                mode: "cloud",
                serverUrl: "https://HAPPY.example.test/",
            }),
        ).toEqual({ mode: "cloud", serverUrl: "https://happy.example.test" });
    });

    it("rejects removed hybrid, host, tunnel, and global-Rig shapes", () => {
        for (const request of [
            { mode: "hybrid", remoteUrl: "https://happy.example.test", rig: "embedded" },
            { mode: "host", rig: "embedded", tunnel: { kind: "quick" } },
            { mode: "local", rig: "global" },
            { mode: "local", tunnel: { kind: "quick" } },
        ])
            expect(() => desktopStartRequestValidate(request as never)).toThrow(
                "Choose a desktop mode",
            );
    });

    it("requires a clean HTTPS origin for a cloud Happy instance", () => {
        for (const serverUrl of [
            "http://happy.example.test",
            "https://user@happy.example.test",
            "https://happy.example.test?token=secret",
            "https://happy.example.test/team-a",
        ])
            expect(() => desktopStartRequestValidate({ mode: "cloud", serverUrl })).toThrow();
    });
});

describe("desktop topology targets", () => {
    it("keeps local and cloud credentials in topology-scoped namespaces", () => {
        const local = { id: "top_0123456789abcdef0123456789abcdef", mode: "local" } as const;
        const cloud = {
            id: "top_fedcba9876543210fedcba9876543210",
            mode: "cloud",
            serverUrl: "https://happy.example.test",
        } as const;

        expect(desktopTopologyTarget(local)).toMatchObject({
            id: local.id,
            kind: "local",
            mode: "local",
        });
        expect(desktopActiveTarget(local, "http://127.0.0.1:3020")).toMatchObject({
            authentication: "local",
            serverUrl: "http://127.0.0.1:3020",
        });
        expect(desktopActiveTarget(cloud)).toMatchObject({
            authentication: "account",
            id: cloud.id,
            kind: "remote",
            serverUrl: cloud.serverUrl,
        });
        expect(desktopTopologyIdValidate(cloud.id)).toBe(cloud.id);
        expect(desktopLocalCapabilityValueValidate("session-token")).toBe("session-token");
        expect(desktopLocalCapabilityValueValidate(undefined)).toBeUndefined();
        expect(() => desktopTopologyIdValidate({ id: cloud.id })).toThrow();
        expect(() => desktopLocalCapabilityValueValidate(42)).toThrow();
    });
});
