import { type CSSProperties } from "react";
import { DesktopStartupScreen, type DesktopStartupValues } from "../../src/DesktopStartupScreen";
import { ComponentPage, FullScreenSpecimen, Specimen } from "../kit";

const frame: CSSProperties = { width: "720px", height: "480px" };
const localValues: DesktopStartupValues = {
    mode: "local",
    cloudUrl: "",
};
const cloudValues: DesktopStartupValues = {
    mode: "cloud",
    cloudUrl: "https://happy.example.com",
};

export function DesktopStartupScreenPage() {
    return (
        <ComponentPage
            number="C-145"
            summary="First-run desktop topology chooser. Exactly two modes: run Happy locally on this machine (no fields) or connect to an existing cloud instance over HTTPS."
            title="Desktop startup screen"
        >
            <FullScreenSpecimen
                detail="720 × 480 Electron minimum · large card scrolls internally · local mode has no fields"
                label="Mode chooser · local"
                number="01"
            >
                <DesktopStartupScreen
                    onChange={() => undefined}
                    onSubmit={() => undefined}
                    phase="choosing"
                    values={localValues}
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="Cloud mode reveals the single HTTPS origin field"
                label="Mode chooser · cloud"
                number="02"
            >
                <DesktopStartupScreen
                    onChange={() => undefined}
                    onSubmit={() => undefined}
                    phase="choosing"
                    values={cloudValues}
                />
            </FullScreenSpecimen>
            <Specimen
                detail="Static runtime progress and safe product copy"
                label="Starting"
                number="03"
                stage="app"
            >
                <div style={frame}>
                    <DesktopStartupScreen
                        message="Starting the local Happy server…"
                        onChange={() => undefined}
                        onSubmit={() => undefined}
                        phase="starting"
                        values={localValues}
                    />
                </div>
            </Specimen>
            <Specimen
                detail="Actionable failure with retry, topology reset, and updater state"
                label="Error"
                number="04"
                stage="app"
            >
                <div style={frame}>
                    <DesktopStartupScreen
                        error="The local Happy server stopped before it was ready."
                        onChange={() => undefined}
                        onChangeMode={() => undefined}
                        onRetry={() => undefined}
                        onSubmit={() => undefined}
                        phase="error"
                        update={{ availableVersion: "0.0.19", status: "downloaded" }}
                        values={localValues}
                    />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
