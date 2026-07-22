import { type CSSProperties } from "react";
import { DesktopInstanceSwitcher } from "../../src/DesktopInstanceSwitcher";
import { ComponentPage, Specimen } from "../kit";

const frame: CSSProperties = {
    width: "320px",
    paddingTop: "8px",
    background: "var(--groupped-background)",
};
const targets = [
    {
        id: "local",
        kind: "local" as const,
        label: "This machine",
        detail: "Private loopback server",
    },
    {
        id: "cloud:happy",
        kind: "cloud" as const,
        label: "Cloud",
        detail: "happy.example.com",
    },
];

export function DesktopInstanceSwitcherPage() {
    return (
        <ComponentPage
            number="C-146"
            summary="Persistent local/cloud identity above every sidebar scrollport, with arrow-key target selection, active runtime status, and a compact updater control."
            title="Desktop instance switcher"
        >
            <Specimen
                detail="Local and cloud have distinct icon treatment, explicit kind labels, and pressed state"
                label="Local + cloud"
                number="01"
                stage="app"
            >
                <div style={frame}>
                    <DesktopInstanceSwitcher
                        activeTargetId="local"
                        onChangeMode={() => undefined}
                        onTargetSelect={() => undefined}
                        status={{ label: "Local server · two instances", tone: "success" }}
                        targets={targets}
                    />
                </div>
            </Specimen>
            <Specimen
                detail="Single local identity while the local server finishes starting"
                label="Local only"
                number="02"
                stage="app"
            >
                <div style={frame}>
                    <DesktopInstanceSwitcher
                        activeTargetId="local"
                        onChangeMode={() => undefined}
                        onTargetSelect={() => undefined}
                        status={{ label: "Waiting for local server to start", tone: "warning" }}
                        targets={targets.slice(0, 1)}
                    />
                </div>
            </Specimen>
            <Specimen
                detail="Downloaded updater action remains secondary to target identity"
                label="Update ready"
                number="03"
                stage="app"
            >
                <div style={frame}>
                    <DesktopInstanceSwitcher
                        activeTargetId="cloud:happy"
                        onChangeMode={() => undefined}
                        onInstallUpdate={() => undefined}
                        onTargetSelect={() => undefined}
                        targets={targets}
                        update={{ availableVersion: "0.0.19", status: "downloaded" }}
                    />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
