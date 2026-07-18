import { Banner, FileAttachment, Modal, ModalOverlay, StoreSurface } from "happy2-ui";
import type { HappyState } from "happy2-state";
import { createSignal, Show } from "solid-js";

export interface DesktopFileOverlayProps {
    fileId: string;
    state: HappyState;
    onClose: () => void;
}

/** Hosts one route-addressable file card over the still-mounted primary surface. */
export function DesktopFileOverlay(props: DesktopFileOverlayProps) {
    const store = props.state.files();
    const [downloading, setDownloading] = createSignal(false);
    const [downloadError, setDownloadError] = createSignal<string>();
    const download = async () => {
        if (downloading()) return;
        setDownloading(true);
        setDownloadError(undefined);
        try {
            const file = store.get().files.find((candidate) => candidate.id === props.fileId);
            const bytes = await props.state.fileDownload(props.fileId);
            const url = URL.createObjectURL(new Blob([bytes], { type: file?.contentType }));
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = file?.originalName ?? "download";
            anchor.click();
            setTimeout(() => URL.revokeObjectURL(url), 1_000);
        } catch (error) {
            setDownloadError(
                error instanceof Error ? error.message : "The file could not be downloaded.",
            );
        } finally {
            setDownloading(false);
        }
    };
    return (
        <StoreSurface store={store}>
            {(snapshot) => {
                const file = () =>
                    snapshot().files.find((candidate) => candidate.id === props.fileId);
                return (
                    <ModalOverlay onDismiss={props.onClose}>
                        <Modal
                            icon="doc"
                            onClose={props.onClose}
                            size="large"
                            title={file()?.originalName ?? "File"}
                        >
                            <Show when={downloadError()}>
                                <Banner tone="danger" title="Download failed">
                                    {downloadError()}
                                </Banner>
                            </Show>
                            <Show when={downloading()}>
                                <Banner tone="info">Downloading the original file…</Banner>
                            </Show>
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

function formatBytes(size: number): string {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${Math.round(size / 102.4) / 10} KB`;
    return `${Math.round(size / (102.4 * 1024)) / 10} MB`;
}
