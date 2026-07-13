import { createSignal, onCleanup, onMount, Show } from "solid-js";
import type { FileSummary } from "rigged-state";
import { thumbHashToDataURL } from "thumbhash";
import {
    Box,
    Banner,
    EmptyState,
    MediaGallery,
    type MediaItem,
    type MediaKind,
    type TabItem,
    Tabs,
    Toolbar,
} from "rigged-ui";
import { type AuthSession } from "../components/AuthGate";
import { featureEmptyStates } from "../mockData";

export type FilesViewProps = {
    /** Legacy preview data is deliberately ignored; production files are state-backed. */
    items?: MediaItem[];
    session?: AuthSession;
    onOpen?: (id: string) => void;
};

/** Filter tabs: "all" plus one per MediaKind, in gallery display order. */
const kindFilters: { id: string; kind?: MediaKind; label: string }[] = [
    { id: "all", label: "All" },
    { id: "photo", kind: "photo", label: "Photos" },
    { id: "video", kind: "video", label: "Videos" },
    { id: "gif", kind: "gif", label: "GIFs" },
    { id: "file", kind: "file", label: "Files" },
];

/**
 * Files feature area — a MediaGallery grid with a Toolbar (name search) and a
 * kind-filter Tabs row. When a session exists the grid is driven by rigged-state;
 * otherwise it renders an honest disconnected state. Selecting a file downloads
 * its authenticated bytes rather than presenting a dead gallery button.
 */
export function FilesView(props: FilesViewProps) {
    const [liveFiles, setLiveFiles] = createSignal<readonly FileSummary[]>();
    const [previewUrls, setPreviewUrls] = createSignal<Record<string, string>>({});
    const [loadError, setLoadError] = createSignal<string>();
    const [downloadState, setDownloadState] = createSignal<{
        id?: string;
        error?: string;
    }>({});
    const [filter, setFilter] = createSignal("all");
    const [query, setQuery] = createSignal("");

    let disposed = false;
    const objectUrls = new Set<string>();
    onMount(() => {
        const session = props.session;
        if (!session) return;
        void session.state
            .execute("getFiles", { limit: 60 })
            .then((response) => {
                if (disposed) return;
                setLiveFiles(response.files);
                setPreviewUrls(
                    Object.fromEntries(
                        response.files.flatMap((file) => {
                            const placeholder = thumbhashUrl(file.thumbhash);
                            return placeholder ? [[file.id, placeholder]] : [];
                        }),
                    ),
                );
                for (const file of response.files) {
                    if (file.kind !== "file") void loadPreview(session, file);
                }
            })
            .catch((reason: unknown) => {
                if (!disposed)
                    setLoadError(
                        reason instanceof Error ? reason.message : "Files could not load.",
                    );
            });
    });
    onCleanup(() => {
        disposed = true;
        for (const url of objectUrls) URL.revokeObjectURL(url);
        objectUrls.clear();
    });

    async function loadPreview(session: AuthSession, file: FileSummary) {
        try {
            let contents: ArrayBuffer;
            try {
                contents = await session.state.execute("downloadFileThumbnail", {
                    fileId: file.id,
                });
            } catch {
                contents = await session.state.execute("downloadFilePreview", {
                    fileId: file.id,
                });
            }
            if (disposed) return;
            const url = URL.createObjectURL(new Blob([contents], { type: "image/webp" }));
            objectUrls.add(url);
            setPreviewUrls((current) => ({ ...current, [file.id]: url }));
        } catch {
            // Keep the decoded thumbhash (or the gallery's type glyph) as fallback.
        }
    }

    const source = () =>
        (liveFiles() ?? []).map((file) => toMediaItem(file, previewUrls()[file.id]));
    const loading = () => Boolean(props.session) && liveFiles() === undefined && !loadError();
    const activeKind = () => kindFilters.find((entry) => entry.id === filter())?.kind;

    const filtered = () => {
        const kind = activeKind();
        const needle = query().trim().toLowerCase();
        return source().filter(
            (item) =>
                (kind === undefined || item.kind === kind) &&
                (needle === "" || (item.name ?? "").toLowerCase().includes(needle)),
        );
    };

    const tabs = (): TabItem[] => {
        const items = source();
        return kindFilters.map((entry) => {
            const count = entry.kind
                ? items.filter((item) => item.kind === entry.kind).length
                : items.length;
            return { id: entry.id, label: entry.label, badge: count || undefined };
        });
    };

    const countLabel = () => {
        const total = source().length;
        const shown = filtered().length;
        const noun = total === 1 ? "file" : "files";
        return activeKind() || query().trim() ? `${shown} of ${total} ${noun}` : `${total} ${noun}`;
    };

    async function openFile(id: string) {
        if (props.onOpen) return props.onOpen(id);
        const session = props.session;
        const file = liveFiles()?.find((item) => item.id === id);
        if (!session || !file) return;
        setDownloadState({ id });
        try {
            const contents = await session.state.execute("downloadFile", { fileId: id });
            if (disposed) return;
            const url = URL.createObjectURL(new Blob([contents], { type: file.contentType }));
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = file.originalName ?? "download";
            anchor.click();
            setTimeout(() => URL.revokeObjectURL(url), 0);
            setDownloadState({});
        } catch (reason) {
            if (!disposed)
                setDownloadState({
                    error:
                        reason instanceof Error ? reason.message : "The file could not download.",
                });
        }
    }

    const empty = featureEmptyStates["files"]!;

    return (
        <Show
            fallback={
                <Show
                    when={!loadError()}
                    fallback={
                        <Banner tone="danger" title="Files unavailable">
                            {loadError()!}
                        </Banner>
                    }
                >
                    <EmptyState
                        description={
                            loading()
                                ? "Fetching shared files from your workspace."
                                : props.session
                                  ? empty.description
                                  : "Connect to a workspace to browse shared files."
                        }
                        icon={empty.icon}
                        title={loading() ? "Loading files…" : "No shared files"}
                    />
                </Show>
            }
            when={source().length > 0}
        >
            <Show when={downloadState().id || downloadState().error}>
                <Banner
                    tone={downloadState().error ? "danger" : "info"}
                    title={downloadState().error ? "Download failed" : "Preparing download…"}
                >
                    {downloadState().error ?? "Retrieving the original file securely."}
                </Banner>
            </Show>
            <Toolbar
                search={{
                    onChange: setQuery,
                    placeholder: "Search files",
                    value: query(),
                }}
                subtitle={countLabel()}
                title="Files"
            />
            <Tabs activeId={filter()} onSelect={setFilter} tabs={tabs()} />
            <Box style={{ flex: "1 1 0%", "min-height": "0", overflow: "auto", padding: "16px" }}>
                <MediaGallery
                    empty={
                        <EmptyState
                            description="Try a different filter or search term."
                            icon={query().trim() ? "search" : "files"}
                            size="inline"
                            title="No files match"
                        />
                    }
                    items={filtered()}
                    onOpen={(id) => void openFile(id)}
                />
            </Box>
        </Show>
    );
}

function toMediaItem(file: FileSummary, thumbnailUrl?: string): MediaItem {
    return {
        duration: file.durationMs === undefined ? undefined : formatDuration(file.durationMs),
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
    if (size < 1024 * 1024 * 1024) return `${Math.round(size / (102.4 * 1024)) / 10} MB`;
    return `${Math.round(size / (102.4 * 1024 * 1024)) / 10} GB`;
}

function formatDuration(ms: number): string {
    const total = Math.round(ms / 1000);
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
