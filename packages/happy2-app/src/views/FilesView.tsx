import { FilesPage } from "happy2-ui";
import type { HappyState } from "happy2-state";

export interface FilesViewProps {
    state: HappyState;
}

/** Selects the file surface and provides authenticated binary reads. */
export function FilesView(props: FilesViewProps) {
    return (
        <FilesPage
            fileDownload={(id) => props.state.fileDownload(id)}
            filePreviewDownload={(id) => props.state.filePreviewDownload(id)}
            fileThumbnailDownload={(id) => props.state.fileThumbnailDownload(id)}
            store={props.state.files()}
        />
    );
}
