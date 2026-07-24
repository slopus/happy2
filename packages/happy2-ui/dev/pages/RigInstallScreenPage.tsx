import { RigInstallScreen } from "../../src/RigInstallScreen";
import { ComponentPage, FullScreenSpecimen } from "../kit";

export function RigInstallScreenPage() {
    return (
        <ComponentPage
            number="C-147"
            summary="Confirmed fixed-command onboarding for the system Rig CLI, including interactive PTY output and actionable failure."
            title="Rig install screen"
        >
            <FullScreenSpecimen
                detail="720 × 600 · exact command is visible before any PTY starts"
                label="Awaiting confirmation"
                number="01"
            >
                <RigInstallScreen
                    command="npm install --global @slopus/rig"
                    onChangeMode={() => undefined}
                    onConfirm={() => undefined}
                    onInput={() => undefined}
                    onResize={() => undefined}
                    onRetry={() => undefined}
                    output=""
                    status="awaitingConfirmation"
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="Interactive output remains visible with an actionable retry"
                label="Failed installation"
                number="02"
            >
                <RigInstallScreen
                    command="npm install --global @slopus/rig"
                    error="npm exited with status 1."
                    exitCode={1}
                    onChangeMode={() => undefined}
                    onConfirm={() => undefined}
                    onInput={() => undefined}
                    onResize={() => undefined}
                    onRetry={() => undefined}
                    output={"npm error code EACCES\nnpm error permission denied\n"}
                    status="exited"
                    verified={false}
                />
            </FullScreenSpecimen>
        </ComponentPage>
    );
}
