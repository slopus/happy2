import { useLayoutEffect, useState } from "react";
import type { DeepReadonly, FileSummary } from "happy2-state";
import { thumbHashToDataURL } from "thumbhash";
import type { MessageImage } from "./ChatPageComponents.js";
import type { ChatPageActions } from "./ChatPage.js";
import type { LiveChatMessage } from "./chatPageModels.js";
export function useChatMessageMediaModel(
    actions: ChatPageActions,
    onError: (error: unknown) => void,
) {
    const [lightbox, setLightbox] = useState<{
        url: string;
        caption?: string;
        detail?: string;
    }>();
    const [urls] = useState(() => new Map<string, string>());
    const [loading] = useState(() => new Set<string>());
    const [, urlsVersionSet] = useState(0);
    async function ensureUrl(fileId: string, preview = false) {
        const cached = urls.get(fileId);
        if (cached) return cached;
        if (loading.has(fileId)) return undefined;
        loading.add(fileId);
        try {
            const contents = preview
                ? await actions.filePreviewDownload(fileId)
                : await actions.fileDownload(fileId);
            const url = URL.createObjectURL(new Blob([contents]));
            urls.set(fileId, url);
            urlsVersionSet((version) => version + 1);
            return url;
        } catch (error) {
            onError(error);
            return undefined;
        } finally {
            loading.delete(fileId);
        }
    }
    const imageFiles = (message: LiveChatMessage) =>
        message.serverMessage?.attachments.filter(
            (file) =>
                file.kind === "photo" ||
                file.kind === "gif" ||
                file.contentType.startsWith("image/"),
        ) ?? [];
    const images = (message: LiveChatMessage): MessageImage[] =>
        imageFiles(message).map((file) => {
            if (!urls.has(file.id) && !loading.has(file.id)) void ensureUrl(file.id, true);
            return {
                id: file.id,
                alt: file.originalName ?? "Photo",
                width: file.width,
                height: file.height,
                placeholderUrl: thumbhashUrl(file.thumbhash),
                url: urls.get(file.id) ?? "",
            };
        });
    const files = (message: LiveChatMessage) =>
        (message.serverMessage?.attachments ?? [])
            .filter((file) => !imageFiles(message).some((image) => image.id === file.id))
            .map((file) => ({
                name: file.originalName ?? "Attachment",
                kind: file.kind,
                size: formatBytes(file.size),
                onOpen: () => void download(file),
            }));
    async function imageOpen(message: LiveChatMessage, imageId: string) {
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
    useLayoutEffect(
        () => () => {
            for (const url of urls.values()) URL.revokeObjectURL(url);
        },
        [urls],
    );
    return { lightbox, closeLightbox: () => setLightbox(undefined), images, files, imageOpen };
}

/** Decodes the URL-safe base64 ThumbHash persisted with an uploaded image. */
function thumbhashUrl(value?: string): string | undefined {
    if (!value) return undefined;
    try {
        const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
        const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
        return thumbHashToDataURL(
            Uint8Array.from(atob(padded), (character) => character.charCodeAt(0)),
        );
    } catch {
        return undefined;
    }
}

function formatBytes(size: number): string {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${Math.round(size / 102.4) / 10} KB`;
    return `${Math.round(size / (102.4 * 1024)) / 10} MB`;
}
