import * as Y from "yjs";
import { DocumentEditor } from "../../src/index";
import { documentEditorSeedDoc } from "../../src/documentEditorSeed";
import { ComponentPage, Specimen } from "../kit";

const emptyDoc = new Y.Doc();
const richDoc = documentEditorSeedDoc();
const readOnlyDoc = documentEditorSeedDoc();
const commentsDoc = documentEditorSeedDoc();

const commentUsers: Record<string, string> = {
    "user-ada": "Ada Lovelace",
    "user-grace": "Grace Hopper",
};

export function DocumentEditorPage() {
    return (
        <ComponentPage
            contract="Props only"
            number="C-080"
            summary="Collaborative BlockNote editor bound to a shared Y.Doc; presence flows through opaque awareness payloads."
            title="Document editor"
        >
            <div className="specimen-grid">
                <Specimen
                    detail="Fresh document, editable, placeholder prompt"
                    label="Empty"
                    number="C-080-A"
                >
                    <div style={{ display: "flex", width: 520, height: 220 }}>
                        <DocumentEditor
                            data-testid="document-editor-empty"
                            user={{ name: "Ada", color: "#2baccc" }}
                            ydoc={emptyDoc}
                        />
                    </div>
                </Specimen>
                <Specimen
                    detail="Seeded heading, formatting, and bullets"
                    label="Content"
                    number="C-080-B"
                >
                    <div style={{ display: "flex", width: 520, height: 340 }}>
                        <DocumentEditor
                            data-testid="document-editor-content"
                            user={{ name: "Ada", color: "#2baccc" }}
                            ydoc={richDoc}
                        />
                    </div>
                </Specimen>
                <Specimen
                    detail="Select text to add an inline comment thread, stored in the same Y.Doc"
                    label="Comments"
                    number="C-080-D"
                >
                    <div style={{ display: "flex", width: 520, height: 340 }}>
                        <DocumentEditor
                            commentUserId="user-ada"
                            commentUsersResolve={async (userIds) =>
                                userIds.map((id) => ({
                                    id,
                                    username: commentUsers[id] ?? "Someone",
                                }))
                            }
                            data-testid="document-editor-comments"
                            user={{ name: "Ada", color: "#2baccc" }}
                            ydoc={commentsDoc}
                        />
                    </div>
                </Specimen>
                <Specimen
                    detail="Same document with editing disabled"
                    label="Read only"
                    number="C-080-C"
                >
                    <div style={{ display: "flex", width: 520, height: 340 }}>
                        <DocumentEditor
                            data-testid="document-editor-readonly"
                            editable={false}
                            user={{ name: "Ada", color: "#2baccc" }}
                            ydoc={readOnlyDoc}
                        />
                    </div>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
