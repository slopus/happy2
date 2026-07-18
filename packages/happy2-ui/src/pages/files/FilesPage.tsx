import type { FileSummary, FilesStore } from "happy2-state";
import { createEffect, createMemo, createSignal, onCleanup, Show } from "solid-js";
import { thumbHashToDataURL } from "thumbhash";
import { Banner } from "../../Banner";
import { Box } from "../../Box";
import { EmptyState } from "../../EmptyState";
import { MediaGallery, type MediaItem, type MediaKind } from "../../MediaGallery";
import { StoreSurface } from "../../StoreSurface";
import { Tabs, type TabItem } from "../../Tabs";
import { Toolbar } from "../../Toolbar";

export interface FilesPageProps {
    store: FilesStore;
    filter: FilesPageFilter;
    query: string;
    onFilterChange: (filter: FilesPageFilter) => void;
    onQueryChange: (query: string) => void;
    fileDownload?: (fileId: string) => Promise<ArrayBuffer>;
    filePreviewDownload?: (fileId: string) => Promise<ArrayBuffer>;
    fileThumbnailDownload?: (fileId: string) => Promise<ArrayBuffer>;
    onOpen?: (fileId: string) => void;
}

export type FilesPageFilter = "all" | "photo" | "video" | "gif" | "file";

const kindFilters: { id: FilesPageFilter; kind?: MediaKind; label: string }[] = [
    { id: "all", label: "All" },
    { id: "photo", kind: "photo", label: "Photos" },
    { id: "video", kind: "video", label: "Videos" },
    { id: "gif", kind: "gif", label: "GIFs" },
    { id: "file", kind: "file", label: "Files" },
];

/** Complete file browser driven by one coarse FilesStore subscription. */
export function FilesPage(props: FilesPageProps) {
    const [previewUrls, setPreviewUrls] = createSignal<Record<string, string>>({});
    const [downloadState, setDownloadState] = createSignal<{ id?: string; error?: string }>({});
    const requested = new Set<string>();
    const objectUrls = new Set<string>();
    let disposed = false;

    function previewsEnsure(files: readonly FileSummary[]): void {
        for (const file of files) {
            if (file.kind === "file" || requested.has(file.id)) continue;
            requested.add(file.id);
            queueMicrotask(() => void previewLoad(file));
        }
    }
    onCleanup(() => {
        disposed = true;
        for (const url of objectUrls) URL.revokeObjectURL(url);
    });

    async function previewLoad(file: FileSummary): Promise<void> {
        const placeholder = thumbhashUrl(file.thumbhash);
        if (placeholder) setPreviewUrls((current) => ({ ...current, [file.id]: placeholder }));
        if (!props.fileThumbnailDownload || !props.filePreviewDownload) return;
        try {
            let bytes: ArrayBuffer;
            try {
                bytes = await props.fileThumbnailDownload(file.id);
            } catch {
                bytes = await props.filePreviewDownload(file.id);
            }
            if (disposed) return;
            const url = URL.createObjectURL(new Blob([bytes], { type: "image/webp" }));
            objectUrls.add(url);
            setPreviewUrls((current) => ({ ...current, [file.id]: url }));
        } catch {
            // The thumbhash or type glyph remains the truthful fallback.
        }
    }

    async function open(file: FileSummary): Promise<void> {
        if (props.onOpen) return props.onOpen(file.id);
        if (!props.fileDownload) return;
        setDownloadState({ id: file.id });
        try {
            const bytes = await props.fileDownload(file.id);
            if (disposed) return;
            const url = URL.createObjectURL(new Blob([bytes], { type: file.contentType }));
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = file.originalName ?? "download";
            anchor.click();
            setTimeout(() => URL.revokeObjectURL(url), 0);
            setDownloadState({});
        } catch (reason) {
            setDownloadState({
                error: reason instanceof Error ? reason.message : "The file could not download.",
            });
        }
    }

    return (
        <StoreSurface store={props.store}>
            {(snapshot) => {
                createEffect(() => previewsEnsure(snapshot().files));
                const source = createMemo(() =>
                    snapshot().files.map((file) => toMediaItem(file, previewUrls()[file.id])),
                );
                const activeKind = createMemo(
                    () => kindFilters.find((entry) => entry.id === props.filter)?.kind,
                );
                const needle = createMemo(() => props.query.trim().toLowerCase());
                const filtered = createMemo(() =>
                    source().filter(
                        (item) =>
                            (activeKind() === undefined || item.kind === activeKind()) &&
                            (!needle() || (item.name ?? "").toLowerCase().includes(needle())),
                    ),
                );
                const tabs = createMemo<TabItem[]>(() =>
                    kindFilters.map((entry) => ({
                        id: entry.id,
                        label: entry.label,
                        badge:
                            (entry.kind
                                ? source().filter((item) => item.kind === entry.kind).length
                                : source().length) || undefined,
                    })),
                );
                const loadError = createMemo(() => {
                    const status = snapshot().status;
                    return status.type === "error" ? status.error.message : undefined;
                });
                return (
                    <Show
                        when={source().length > 0}
                        fallback={
                            <Show
                                when={!loadError()}
                                fallback={
                                    <Banner tone="danger" title="Files unavailable">
                                        {loadError()}
                                    </Banner>
                                }
                            >
                                <EmptyState
                                    description={
                                        snapshot().status.type === "loading"
                                            ? "Fetching shared files from your workspace."
                                            : "Shared files and diffs from agent runs will land here."
                                    }
                                    icon="files"
                                    title={
                                        snapshot().status.type === "loading"
                                            ? "Loading files…"
                                            : "No shared files"
                                    }
                                />
                            </Show>
                        }
                    >
                        <Show when={downloadState().id || downloadState().error}>
                            <Banner
                                tone={downloadState().error ? "danger" : "info"}
                                title={
                                    downloadState().error
                                        ? "Download failed"
                                        : "Preparing download…"
                                }
                            >
                                {downloadState().error ?? "Retrieving the original file securely."}
                            </Banner>
                        </Show>
                        <Toolbar
                            search={{
                                onChange: props.onQueryChange,
                                placeholder: "Search files",
                                value: props.query,
                            }}
                            subtitle={`${filtered().length} of ${source().length} files`}
                            title="Files"
                        />
                        <Tabs
                            activeId={props.filter}
                            onSelect={(id) => props.onFilterChange(id as FilesPageFilter)}
                            tabs={tabs()}
                        />
                        <Box
                            style={{
                                flex: "1 1 0%",
                                "min-height": "0",
                                overflow: "auto",
                                padding: "16px",
                            }}
                        >
                            <MediaGallery
                                empty={
                                    <EmptyState
                                        description="Try a different filter or search term."
                                        icon={needle() ? "search" : "files"}
                                        size="inline"
                                        title="No files match"
                                    />
                                }
                                items={filtered()}
                                onOpen={(id) => {
                                    const file = snapshot().files.find((item) => item.id === id);
                                    if (file) void open(file);
                                }}
                            />
                        </Box>
                    </Show>
                );
            }}
        </StoreSurface>
    );
}

function toMediaItem(file: FileSummary, thumbnailUrl?: string): MediaItem {
    return {
        duration:
            file.durationMs === undefined
                ? undefined
                : `${Math.floor(file.durationMs / 60_000)}:${Math.round(
                      (file.durationMs % 60_000) / 1000,
                  )
                      .toString()
                      .padStart(2, "0")}`,
        id: file.id,
        kind: file.kind,
        name: file.originalName,
        size: formatBytes(file.size),
        thumbnailUrl,
    };
}

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
