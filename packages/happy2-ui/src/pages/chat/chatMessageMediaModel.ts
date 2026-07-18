import { createSignal, onCleanup } from "solid-js";
import type { DeepReadonly, FileSummary } from "happy2-state";
import type { MessageImage } from "./ChatPageComponents.js";
import type { ChatPageActions } from "./ChatPage.js";
import type { LiveThreadMessage } from "./chatPageModels.js";

export function chatMessageMediaModelCreate(
    actions: ChatPageActions,
    onError: (error: unknown) => void,
) {
    const [lightbox, setLightbox] = createSignal<{
        url: string;
        caption?: string;
        detail?: string;
    }>();
    const urls = new Map<string, string>();
    async function ensureUrl(fileId: string, preview = false) {
        const cached = urls.get(fileId);
        if (cached) return cached;
        try {
            const contents = preview
                ? await actions.filePreviewDownload(fileId)
                : await actions.fileDownload(fileId);
            const url = URL.createObjectURL(new Blob([contents]));
            urls.set(fileId, url);
            return url;
        } catch (error) {
            onError(error);
            return undefined;
        }
    }
    const imageFiles = (message: LiveThreadMessage) =>
        message.serverMessage?.attachments.filter(
            (file) =>
                file.kind === "photo" ||
                file.kind === "gif" ||
                file.contentType.startsWith("image/"),
        ) ?? [];
    const images = (message: LiveThreadMessage): MessageImage[] =>
        imageFiles(message).map((file) => ({
            id: file.id,
            alt: file.originalName ?? "Photo",
            url: urls.get(file.id) ?? "",
        }));
    const files = (message: LiveThreadMessage) =>
        (message.serverMessage?.attachments ?? [])
            .filter((file) => !imageFiles(message).some((image) => image.id === file.id))
            .map((file) => ({
                name: file.originalName ?? "Attachment",
                kind: file.kind,
                size: formatBytes(file.size),
                onOpen: () => void download(file),
            }));
    async function imageOpen(message: LiveThreadMessage, imageId: string) {
        const file = imageFiles(message).find((candidate) => candidate.id === imageId);
        if (!file) return;
        const url = await ensureUrl(file.id, true);
        if (url)
            setLightbox({
                url,
                caption: file.originalName ?? "Photo",
                detail: formatBytes(file.size),
            });
    }
    async function download(file: DeepReadonly<FileSummary>) {
        const url = await ensureUrl(file.id);
        if (!url) return;
        const link = document.createElement("a");
        link.href = url;
        link.download = file.originalName ?? "download";
        link.click();
    }
    onCleanup(() => {
        for (const url of urls.values()) URL.revokeObjectURL(url);
    });
    return { lightbox, closeLightbox: () => setLightbox(undefined), images, files, imageOpen };
}

function formatBytes(size: number): string {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${Math.round(size / 102.4) / 10} KB`;
    return `${Math.round(size / (102.4 * 1024)) / 10} MB`;
}
