import { documentCollectionStoreCreate, type DocumentSummary } from "happy2-state";
import { DocumentsPage } from "../../src/index";
import { ComponentPage, Specimen } from "../kit";

function log(message: string) {
    console.info(`[blueprint] DocumentsPage: ${message}`);
}

function summary(id: string, title: string, attachments: number): DocumentSummary {
    return {
        id,
        ownerUserId: "user-1",
        title,
        format: "blocknote",
        channelAttachments: Array.from({ length: attachments }, (_none, index) => ({
            chatId: `chat-${index + 1}`,
            attachedByUserId: "user-1",
            attachedAt: "2026-07-20T09:00:00.000Z",
        })),
        latestSequence: "4",
        createdAt: "2026-07-19T09:00:00.000Z",
        updatedAt: "2026-07-20T12:00:00.000Z",
    };
}

function loadedStore(documents: DocumentSummary[]) {
    const store = documentCollectionStoreCreate();
    store.getState().documentCollectionInput({ type: "documentCollectionLoaded", documents });
    return store;
}

const POPULATED = loadedStore([
    summary("doc-1", "Launch plan — Q3", 1),
    summary("doc-2", "Collaboration architecture", 2),
    summary("doc-3", "Positioning notes", 0),
    summary("doc-4", "", 1),
]);
const EMPTY = loadedStore([]);

export function DocumentsPagePage() {
    return (
        <ComponentPage
            contract="Surface store"
            number="C-140"
            summary="Global documents surface behind the sidebar's Documents entry: every visible document across channels with create, open, and hover-revealed confirmed deletion."
            title="Documents page"
        >
            <div className="specimen-grid">
                <Specimen
                    detail="Rows show attachment count and edit date; hovering reveals the delete action"
                    label="Populated"
                    number="C-140-A"
                >
                    <div style={{ display: "flex", width: 640, height: 380 }}>
                        <DocumentsPage
                            data-testid="documents-page-populated"
                            onCreate={() => log("create")}
                            onDelete={(document) => log(`delete ${document.id}`)}
                            onOpen={(document) => log(`open ${document.id}`)}
                            store={POPULATED}
                        />
                    </div>
                </Specimen>
                <Specimen detail="Empty state with create action" label="Empty" number="C-140-B">
                    <div style={{ display: "flex", width: 640, height: 320 }}>
                        <DocumentsPage
                            data-testid="documents-page-empty"
                            onCreate={() => log("create")}
                            onOpen={(document) => log(`open ${document.id}`)}
                            store={EMPTY}
                        />
                    </div>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
