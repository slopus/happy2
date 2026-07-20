import { DocumentsPanel } from "../../src/index";
import { ComponentPage, Specimen } from "../kit";

const DOCUMENTS = [
    { id: "doc-1", title: "Launch checklist", detail: "Edited 12:04" },
    { id: "doc-2", title: "Design notes", detail: "Edited 09:31" },
    { id: "doc-3", title: "Retro — sprint 14", detail: "Edited yesterday" },
    { id: "doc-4", title: "", detail: "Edited yesterday" },
];

export function DocumentsPanelPage() {
    const noop = () => undefined;
    return (
        <ComponentPage
            contract="Props only"
            number="C-081"
            summary="Right-sidebar list of a channel's collaborative documents with create, open, and close intents."
            title="Documents panel"
        >
            <div className="specimen-grid">
                <Specimen
                    detail="Rows with titles, details, and an untitled fallback"
                    label="Populated"
                    number="C-081-A"
                >
                    <div style={{ display: "flex", width: 320, height: 420 }}>
                        <DocumentsPanel
                            data-testid="documents-panel-populated"
                            documents={DOCUMENTS}
                            onClose={noop}
                            onCreate={noop}
                            onOpen={noop}
                        />
                    </div>
                </Specimen>
                <Specimen detail="Empty state with create action" label="Empty" number="C-081-B">
                    <div style={{ display: "flex", width: 320, height: 420 }}>
                        <DocumentsPanel
                            data-testid="documents-panel-empty"
                            documents={[]}
                            onClose={noop}
                            onCreate={noop}
                            onOpen={noop}
                        />
                    </div>
                </Specimen>
                <Specimen detail="Initial load and failure" label="States" number="C-081-C">
                    <div style={{ display: "flex", gap: 16 }}>
                        <div style={{ display: "flex", width: 300, height: 220 }}>
                            <DocumentsPanel
                                data-testid="documents-panel-loading"
                                documents={[]}
                                loading
                                onClose={noop}
                            />
                        </div>
                        <div style={{ display: "flex", width: 300, height: 220 }}>
                            <DocumentsPanel
                                data-testid="documents-panel-error"
                                documents={[]}
                                error="Documents could not be loaded."
                                onClose={noop}
                            />
                        </div>
                    </div>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
