import { createSignal, onMount, Show } from "solid-js";
import {
    Box,
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
import { type FileSummary } from "../server";

export type FilesViewProps = {
    items: MediaItem[];
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
 * kind-filter Tabs row. When a session exists the grid is driven by live
 * `/v0/files`; otherwise it renders the mock gallery. File previews fall back to
 * their kind glyph so the grid never loads a network image.
 */
export function FilesView(props: FilesViewProps) {
    const connected = Boolean(props.session);
    const [liveItems, setLiveItems] = createSignal<MediaItem[]>();
    const [filter, setFilter] = createSignal("all");
    const [query, setQuery] = createSignal("");

    onMount(() => {
        const session = props.session;
        if (!session) return;
        void session.client
            .files(session.token, { limit: 60 })
            .then((response) => setLiveItems(response.files.map(toMediaItem)))
            // TODO(server): surface a load error banner once the shell exposes one.
            .catch(() => setLiveItems([]));
    });

    const source = () => (connected ? (liveItems() ?? []) : props.items);
    const loading = () => connected && liveItems() === undefined;
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

    const empty = featureEmptyStates["files"]!;

    return (
        <Show
            fallback={
                <EmptyState
                    description={
                        loading() ? "Fetching shared files from your workspace." : empty.description
                    }
                    icon={empty.icon}
                    title={loading() ? "Loading files…" : empty.title}
                />
            }
            when={source().length > 0}
        >
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
                    onOpen={props.onOpen}
                />
            </Box>
        </Show>
    );
}

function toMediaItem(file: FileSummary): MediaItem {
    return {
        duration: file.durationMs === undefined ? undefined : formatDuration(file.durationMs),
        id: file.id,
        kind: file.kind,
        name: file.originalName,
        size: formatBytes(file.size),
    };
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
