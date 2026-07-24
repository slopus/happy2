import { describe, expect, it } from "vitest";
import type { DesktopRuntimeSnapshot } from "../shared/desktopContract";
import {
    desktopWindowTarget,
    remoteNavigationAllowed,
    rendererNavigationAllowed,
} from "./navigation";

describe("desktop renderer navigation", () => {
    const renderer =
        "file:///Applications/Happy%202.app/Contents/Resources/app.asar/dist/renderer/index.html";

    it("allows only the exact packaged renderer file", () => {
        expect(rendererNavigationAllowed(renderer, renderer, false)).toBe(true);
        expect(rendererNavigationAllowed(`${renderer}#settings`, renderer, false)).toBe(true);
        expect(rendererNavigationAllowed("file:///tmp/untrusted.html", renderer, false)).toBe(
            false,
        );
        expect(rendererNavigationAllowed(`${renderer}?untrusted=1`, renderer, false)).toBe(false);
        expect(rendererNavigationAllowed("https://example.test", renderer, false)).toBe(false);
    });

    it("allows only the configured development origin", () => {
        const development = "http://127.0.0.1:5173";
        expect(rendererNavigationAllowed("http://127.0.0.1:5173/chat", development, true)).toBe(
            true,
        );
        expect(rendererNavigationAllowed("http://localhost:5173/chat", development, true)).toBe(
            false,
        );
    });
});

describe("desktop window target", () => {
    const update = { status: "idle" } as const;
    const targets = [
        { id: "top_local123", mode: "local", kind: "local", label: "Local", detail: "This Mac" },
        {
            id: "top_cloud123",
            mode: "cloud",
            kind: "remote",
            label: "Cloud",
            detail: "happy.example.test",
        },
    ] as const;

    it("keeps choosing, transitional, error, and ready-local states in the bundled shell", () => {
        const snapshots: DesktopRuntimeSnapshot[] = [
            { phase: "choosing", targets, update },
            {
                phase: "starting",
                message: "Connecting…",
                request: { mode: "cloud", serverUrl: "https://happy.example.test" },
                targets,
                update,
            },
            {
                phase: "error",
                message: "Unavailable",
                request: { mode: "cloud", serverUrl: "https://happy.example.test" },
                retryable: true,
                targets,
                update,
            },
            {
                phase: "ready",
                activeTarget: {
                    ...targets[0],
                    authentication: "rig",
                    rigVersion: "0.0.45",
                },
                activeTargetId: targets[0].id,
                connectionId: 3,
                mode: "local",
                targets,
                update,
            },
        ];

        for (const snapshot of snapshots)
            expect(desktopWindowTarget(snapshot)).toEqual({ key: "local", kind: "local" });
    });

    it("loads a cloud web app at its exact origin with desktop presentation enabled", () => {
        const snapshot: DesktopRuntimeSnapshot = {
            phase: "ready",
            activeTarget: {
                ...targets[1],
                authentication: "account",
                serverUrl: "https://happy.example.test",
            },
            activeTargetId: targets[1].id,
            connectionId: 7,
            mode: "cloud",
            targets,
            update,
        };

        expect(desktopWindowTarget(snapshot)).toEqual({
            key: "cloud:7",
            kind: "cloud",
            url: "https://happy.example.test/?desktop=1",
        });
        expect(desktopWindowTarget({ ...snapshot, update: { status: "checking" } })).toEqual(
            desktopWindowTarget(snapshot),
        );
        expect(desktopWindowTarget({ ...snapshot, connectionId: 8 }).key).toBe("cloud:8");
    });
});

describe("remote web navigation", () => {
    it("allows HTTPS Access and identity-provider redirects only", () => {
        expect(remoteNavigationAllowed("https://happy.example.test/v0/auth/oidc/callback")).toBe(
            true,
        );
        expect(
            remoteNavigationAllowed("https://team.cloudflareaccess.com/cdn-cgi/access/login"),
        ).toBe(true);
        expect(remoteNavigationAllowed("http://happy.example.test")).toBe(false);
        expect(remoteNavigationAllowed("file:///tmp/untrusted.html")).toBe(false);
        expect(remoteNavigationAllowed("not a URL")).toBe(false);
    });
});
