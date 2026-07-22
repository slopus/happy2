import { ChatProjectCreateDialog } from "../../src/pages/chat/ChatProjectCreateDialog";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

function frame(children: React.ReactNode) {
    return (
        <div
            style={{
                background: "var(--groupped-background)",
                border: "1px solid var(--surface-pressed-overlay)",
                borderRadius: "8px",
                height: "700px",
                overflow: "hidden",
                position: "relative",
                transform: "translateZ(0)",
                width: "800px",
            }}
        >
            {children}
        </div>
    );
}

export function ChatProjectCreateDialogPage() {
    return (
        <ComponentPage
            number="C-142"
            summary="Project creation form with the required first public or private channel, committed as one product action."
            title="ChatProjectCreateDialog"
        >
            <Specimen
                detail="480px form · project metadata · required first channel · visibility"
                label="Ready"
                number="01"
                stage="app"
            >
                {frame(
                    <ChatProjectCreateDialog busy={false} onClose={() => {}} onCreate={() => {}} />,
                )}
                <DimensionRule label="modal medium 480px" />
            </Specimen>
            <Specimen detail="submission disabled" label="Busy" number="02" stage="app">
                {frame(
                    <ChatProjectCreateDialog
                        busy
                        initialKind="private_channel"
                        onClose={() => {}}
                        onCreate={() => {}}
                    />,
                )}
            </Specimen>
        </ComponentPage>
    );
}
