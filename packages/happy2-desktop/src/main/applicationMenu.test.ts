import { describe, expect, it } from "vitest";
import type { DesktopRuntimeSnapshot } from "../shared/desktopContract";
import { desktopInstanceMenuTargets } from "./applicationMenu";

describe("desktop native instance menu", () => {
    it("lists every saved target and marks only the active topology", () => {
        const snapshot: DesktopRuntimeSnapshot = {
            phase: "ready",
            activeTarget: {
                id: "top_cloud123",
                mode: "cloud",
                kind: "remote",
                label: "Cloud",
                detail: "happy.example.test",
                authentication: "account",
                serverUrl: "https://happy.example.test",
            },
            activeTargetId: "top_cloud123",
            connectionId: 2,
            mode: "cloud",
            targets: [
                {
                    id: "top_local123",
                    mode: "local",
                    kind: "local",
                    label: "Local",
                    detail: "This Mac",
                },
                {
                    id: "top_cloud123",
                    mode: "cloud",
                    kind: "remote",
                    label: "Cloud",
                    detail: "happy.example.test",
                },
            ],
            update: { status: "idle" },
        };

        expect(desktopInstanceMenuTargets(snapshot)).toEqual([
            { active: false, id: "top_local123", label: "Local — This Mac" },
            { active: true, id: "top_cloud123", label: "Cloud — happy.example.test" },
        ]);
    });

    it("leaves all targets unchecked while the chooser owns the window", () => {
        expect(
            desktopInstanceMenuTargets({
                phase: "choosing",
                targets: [
                    {
                        id: "top_local123",
                        mode: "local",
                        kind: "local",
                        label: "Local",
                        detail: "This Mac",
                    },
                ],
                update: { status: "idle" },
            }),
        ).toEqual([{ active: false, id: "top_local123", label: "Local — This Mac" }]);
    });
});
