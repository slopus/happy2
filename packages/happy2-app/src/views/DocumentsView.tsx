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
