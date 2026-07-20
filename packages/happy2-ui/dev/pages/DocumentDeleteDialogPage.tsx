import { DocumentDeleteDialog } from "../../src/DocumentDeleteDialog";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

function log(message: string) {
    console.info(`[blueprint] DocumentDeleteDialog: ${message}`);
}

function frame(children: React.ReactNode, height = 420) {
    return (
        <div
            style={{
                background: "var(--happy2-bg-app)",
                border: "1px solid var(--happy2-border-strong)",
                borderRadius: "8px",
                height: `${height}px`,
                overflow: "hidden",
                position: "relative",
                transform: "translateZ(0)",
                width: "560px",
            }}
        >
            {children}
        </div>
    );
}

export function DocumentDeleteDialogPage() {
    return (
        <ComponentPage
            number="C-139"
            summary="Destructive delete confirmation for a collaborative document in a 360px danger modal. The copy states the blast radius: content, complete edit history, and every channel attachment, for everyone at once."
            title="DocumentDeleteDialog"
        >
            <Specimen
                detail="danger tone · document named in the title · danger confirm action"
                label="Confirmation"
                number="01"
                stage="app"
            >
                {frame(
                    <DocumentDeleteDialog
                        documentTitle="Launch plan — Q3"
                        onCancel={() => log("cancel")}
                        onConfirm={() => log("confirm")}
                    />,
                )}
                <DimensionRule label="modal small 360px" />
            </Specimen>

            <Specimen
                detail="untitled fallback · in-dialog failure banner keeps retry available"
                label="Failure"
                number="02"
                stage="app"
            >
                {frame(
                    <DocumentDeleteDialog
                        documentTitle=""
                        error="The server rejected the delete."
                        onCancel={() => log("cancel")}
                        onConfirm={() => log("confirm")}
                    />,
                    340,
                )}
            </Specimen>
        </ComponentPage>
    );
}
