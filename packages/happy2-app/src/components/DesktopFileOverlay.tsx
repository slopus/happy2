import { useReducer } from "react";
import { Banner, FileAttachment, Modal, ModalOverlay, StoreSurface } from "happy2-ui";
import type { HappyState } from "happy2-state";
export interface DesktopFileOverlayProps {
    fileId: string;
    state: HappyState;
    onClose: () => void;
}
/** Hosts one route-addressable file card over the still-mounted primary surface. */
export function DesktopFileOverlay(props: DesktopFileOverlayProps) {
    const store = props.state.files();
    const [downloadState, updateDownload] = useReducer(
        (
            current: { downloading: boolean; error?: string },
            patch: Partial<{ downloading: boolean; error?: string }>,
        ) => ({ ...current, ...patch }),
        { downloading: false },
    );
    const { downloading, error: downloadError } = downloadState;
    const download = async () => {
        if (downloading) return;
        updateDownload({ downloading: true, error: undefined });
        try {
            const file = store.getState().files.find((candidate) => candidate.id === props.fileId);
            const bytes = await props.state.fileDownload(props.fileId);
            const url = URL.createObjectURL(new Blob([bytes], { type: file?.contentType }));
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = file?.originalName ?? "download";
            anchor.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (error) {
            updateDownload({
                error: error instanceof Error ? error.message : "The file could not be downloaded.",
            });
        } finally {
            updateDownload({ downloading: false });
        }
    };
    return (
        <StoreSurface store={store}>
            {(snapshot) => {
                const file = () =>
                    snapshot.files.find((candidate) => candidate.id === props.fileId);
                return (
                    <ModalOverlay onDismiss={props.onClose}>
                        {/* The attachment row below carries the filename (it is the
                            download affordance), so the title names only the kind —
                            no duplicated filename in one small card. */}
                        <Modal
                            icon="doc"
                            onClose={props.onClose}
                            size="large"
                            title={kindTitle(file()?.kind)}
                        >
                            {downloadError ? (
                                <Banner tone="danger" title="Download failed">
                                    {downloadError}
                                </Banner>
                            ) : null}
                            {downloading ? (
                                <Banner tone="info">Downloading the original file…</Banner>
                            ) : null}
                            <FileAttachment
                                kind={file()?.kind ?? "file"}
                                name={file()?.originalName ?? props.fileId}
                                onOpen={() => void download()}
                                size={file() ? formatBytes(file()!.size) : undefined}
                                variant="chat"
                            />
                        </Modal>
                    </ModalOverlay>
                );
            }}
        </StoreSurface>
    );
}
function kindTitle(kind?: string): string {
    switch (kind) {
        case "photo":
            return "Photo";
        case "video":
            return "Video";
        case "gif":
            return "GIF";
        default:
            return "File";
    }
}
function formatBytes(size: number): string {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${Math.round(size / 102.4) / 10} KB`;
    return `${Math.round(size / (102.4 * 1024)) / 10} MB`;
}
