import { FilesPage, type FilesPageFilter } from "happy2-ui";
import type { DocumentSummary, HappyState } from "happy2-state";

export interface FilesViewProps {
    state: HappyState;
    filter: FilesPageFilter;
    query: string;
    onFilterChange: (filter: FilesPageFilter) => void;
    onQueryChange: (query: string) => void;
    onOpen: (fileId: string) => void;
    onDocumentOpen: (document: DocumentSummary) => void;
}

/** Selects the file surface and provides authenticated binary reads. */
export function FilesView(props: FilesViewProps) {
    return (
        <FilesPage
            documents={props.state.documentCollection()}
            onDocumentOpen={props.onDocumentOpen}
            filter={props.filter}
            fileDownload={(id) => props.state.fileDownload(id)}
            filePreviewDownload={(id) => props.state.filePreviewDownload(id)}
            fileThumbnailDownload={(id) => props.state.fileThumbnailDownload(id)}
            onFilterChange={props.onFilterChange}
            onOpen={props.onOpen}
            onQueryChange={props.onQueryChange}
            query={props.query}
            store={props.state.files()}
        />
    );
}
