import { useLayoutEffect, useReducer, useRef } from "react";
import { DocumentDetailPane, DocumentsPage } from "happy2-ui";
import type { DocumentHandle, HappyState } from "happy2-state";

export interface DocumentsViewProps {
    state: HappyState;
    /** Open document, when the route addresses one; otherwise the list. */
    documentId?: string;
    user: { readonly id: string; readonly firstName: string };
    onOpen: (documentId: string) => void;
    onCloseDetail: () => void;
    onFileOpen: (fileId: string) => void;
}

type DocumentsResources = {
    document?: DocumentHandle;
    documentId?: string;
};

/** Owns the route-keyed document session lease for the global Documents surface. */
export function DocumentsView(props: DocumentsViewProps) {
    const state = props.state;
    const [resources, resourcesReplace] = useReducer(
        (_current: DocumentsResources, next: DocumentsResources) => next,
        {},
    );
    const resourcesRef = useRef<DocumentsResources>({});
    const nextDocumentId = props.documentId;
    useLayoutEffect(() => {
        if (resourcesRef.current.documentId === nextDocumentId) return;
        resourcesRef.current.document?.[Symbol.dispose]();
        const next: DocumentsResources = {
            documentId: nextDocumentId,
            document: nextDocumentId ? state.documentOpen(nextDocumentId) : undefined,
        };
        resourcesRef.current = next;
        resourcesReplace(next);
    }, [state, nextDocumentId]);
    useLayoutEffect(
        () => () => {
            resourcesRef.current.document?.[Symbol.dispose]();
            resourcesRef.current = {};
        },
        [],
    );
    if (nextDocumentId && resources.document && resources.documentId === nextDocumentId) {
        return (
            <DocumentDetailPane
                directory={state.directory()}
                document={resources.document}
                onClose={props.onCloseDetail}
                onDelete={() => {
                    void state
                        .documentDelete(nextDocumentId)
                        .then(() => props.onCloseDetail())
                        .catch(() => undefined);
                }}
                onFileAttach={(fileId) =>
                    state.documentFileAttach(nextDocumentId, fileId).then(() => undefined)
                }
                onFileDetach={(fileId) => state.documentFileDetach(nextDocumentId, fileId)}
                onFileOpen={props.onFileOpen}
                onFileUpload={async (file) => {
                    const body = new FormData();
                    body.set("file", file, file.name);
                    const uploaded = await state.fileUpload(body);
                    const attachment = await state.documentFileAttach(nextDocumentId, uploaded.id);
                    return {
                        id: attachment.file.id,
                        name: attachment.file.originalName ?? file.name,
                    };
                }}
                onFileUrlResolve={(fileId) => state.fileSignedUrlCreate(fileId)}
                onRename={(title) => void state.documentRename(nextDocumentId, title)}
                user={props.user}
            />
        );
    }
    return (
        <DocumentsPage
            data-testid="documents-view"
            onCreate={() => {
                void state
                    .documentStandaloneCreate({ title: "" })
                    .then((document) => props.onOpen(document.id))
                    .catch(() => undefined);
            }}
            onDelete={(document) => void state.documentDelete(document.id).catch(() => undefined)}
            onOpen={(document) => props.onOpen(document.id)}
            store={state.documentCollection()}
        />
    );
}
