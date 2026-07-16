import { For, Show, splitProps, type JSX } from "solid-js";
import { Icon } from "./Icon";

/** Git working-tree state of a file, mirrored from the workspace API. */
export type FileTreeGitStatus =
    | "added"
    | "deleted"
    | "ignored"
    | "modified"
    | "renamed"
    | "untracked";

/**
 * One entry in the tree. Directories carry `children` (materialized on expand)
 * and disclosure/paging flags; files are leaves. The caller owns the shape —
 * FileTree renders exactly what it is given and never fetches or mutates.
 */
export type FileTreeNode = {
    /** Stable identity, typically the full path. */
    id: string;
    /** Row label — usually the last path segment. */
    name: string;
    kind: "file" | "directory";
    gitStatus?: FileTreeGitStatus;
    /** Directory only: whether its children row-group is shown. */
    expanded?: boolean;
    /** Directory only: a page request is in flight. */
    loading?: boolean;
    /** Directory only: more children exist beyond those loaded. */
    hasMore?: boolean;
    children?: FileTreeNode[];
};

export type FileTreeProps = {
    class?: string;
    "data-testid"?: string;
    style?: JSX.CSSProperties;
    nodes: FileTreeNode[];
    /** Currently selected entry id, if any. */
    selectedId?: string;
    onSelect?: (id: string) => void;
    /** Directory expand/collapse request. */
    onToggle?: (id: string) => void;
    /** Directory paging request (the "Show more" affordance). */
    onLoadMore?: (id: string) => void;
    /** Per-depth indentation step. Defaults to 16px. */
    indent?: number;
    /** Whole-tree initial loading state (before any node is known). */
    loading?: boolean;
    loadingLabel?: string;
    emptyLabel?: string;
    moreLabel?: string;
};

/** Single-letter git decoration and the semantic token driving its color. */
const GIT_STATUS: Record<FileTreeGitStatus, { letter: string; label: string }> = {
    added: { letter: "A", label: "Added" },
    deleted: { letter: "D", label: "Deleted" },
    ignored: { letter: "I", label: "Ignored" },
    modified: { letter: "M", label: "Modified" },
    renamed: { letter: "R", label: "Renamed" },
    untracked: { letter: "U", label: "Untracked" },
};

const BASE_PADDING = 8;
const DEFAULT_INDENT = 16;

function FileTreeRow(props: {
    node: FileTreeNode;
    depth: number;
    indent: number;
    selectedId?: string;
    onSelect?: (id: string) => void;
    onToggle?: (id: string) => void;
    onLoadMore?: (id: string) => void;
    moreLabel: string;
}) {
    const node = () => props.node;
    const directory = () => node().kind === "directory";
    const selected = () => props.selectedId === node().id;
    const status = () => (node().gitStatus ? GIT_STATUS[node().gitStatus!] : undefined);
    const padLeft = () => BASE_PADDING + props.depth * props.indent;

    return (
        <>
            <div
                class="happy2-file-tree__row"
                data-happy2-ui="file-tree-row"
                data-kind={node().kind}
                data-path={node().id}
                data-selected={selected() ? "" : undefined}
                data-status={node().gitStatus}
                data-expanded={directory() && node().expanded ? "" : undefined}
                style={{ "padding-left": `${padLeft()}px` }}
            >
                <span class="happy2-file-tree__disc" data-happy2-ui="file-tree-disc">
                    <Show when={directory()}>
                        <button
                            aria-expanded={node().expanded ? "true" : "false"}
                            aria-label={`${node().expanded ? "Collapse" : "Expand"} ${node().name}`}
                            class="happy2-file-tree__chevron"
                            data-happy2-ui="file-tree-chevron"
                            onClick={(event) => {
                                event.stopPropagation();
                                props.onToggle?.(node().id);
                            }}
                            type="button"
                        >
                            <Icon
                                name={node().expanded ? "chevron-down" : "chevron-right"}
                                size={12}
                            />
                        </button>
                    </Show>
                </span>
                <button
                    aria-current={selected() ? "true" : undefined}
                    class="happy2-file-tree__entry"
                    data-happy2-ui="file-tree-entry"
                    onClick={() => props.onSelect?.(node().id)}
                    onDblClick={() => directory() && props.onToggle?.(node().id)}
                    type="button"
                >
                    <span class="happy2-file-tree__icon" data-happy2-ui="file-tree-icon">
                        <Icon name={directory() ? "files" : "doc"} size={14} />
                    </span>
                    <span class="happy2-file-tree__name" data-happy2-ui="file-tree-name">
                        {node().name}
                    </span>
                    <Show when={status()}>
                        {(entry) => (
                            <span
                                class="happy2-file-tree__status"
                                data-happy2-ui="file-tree-status"
                                title={entry().label}
                            >
                                {entry().letter}
                            </span>
                        )}
                    </Show>
                </button>
            </div>
            <Show when={directory() && node().expanded}>
                <Show
                    when={node().loading}
                    fallback={
                        <>
                            <For each={node().children ?? []}>
                                {(child) => (
                                    <FileTreeRow
                                        depth={props.depth + 1}
                                        indent={props.indent}
                                        moreLabel={props.moreLabel}
                                        node={child}
                                        onLoadMore={props.onLoadMore}
                                        onSelect={props.onSelect}
                                        onToggle={props.onToggle}
                                        selectedId={props.selectedId}
                                    />
                                )}
                            </For>
                            <Show when={node().hasMore}>
                                <button
                                    class="happy2-file-tree__more"
                                    data-happy2-ui="file-tree-more"
                                    onClick={() => props.onLoadMore?.(node().id)}
                                    style={{
                                        "padding-left": `${BASE_PADDING + (props.depth + 1) * props.indent}px`,
                                    }}
                                    type="button"
                                >
                                    {props.moreLabel}
                                </button>
                            </Show>
                        </>
                    }
                >
                    <div
                        class="happy2-file-tree__loading"
                        data-happy2-ui="file-tree-loading"
                        style={{
                            "padding-left": `${BASE_PADDING + (props.depth + 1) * props.indent}px`,
                        }}
                    >
                        Loading…
                    </div>
                </Show>
            </Show>
        </>
    );
}

/**
 * C-052 FileTree — a props-only, indentable file/folder tree modeled on a
 * code-editor explorer. Directories disclose with a chevron and reveal their
 * (caller-materialized) children; files are leaves with an optional git-status
 * decoration. Selection, hover, per-directory loading, and a "Show more" paging
 * affordance are all driven by props — the tree never fetches or holds state.
 */
export function FileTree(props: FileTreeProps) {
    const [local] = splitProps(props, [
        "class",
        "data-testid",
        "style",
        "nodes",
        "selectedId",
        "onSelect",
        "onToggle",
        "onLoadMore",
        "indent",
        "loading",
        "loadingLabel",
        "emptyLabel",
        "moreLabel",
    ]);
    const indent = () => local.indent ?? DEFAULT_INDENT;

    return (
        <div
            class={["happy2-file-tree", local.class].filter(Boolean).join(" ")}
            data-happy2-ui="file-tree"
            data-testid={local["data-testid"]}
            role="tree"
            style={local.style}
        >
            <Show
                when={!local.loading}
                fallback={
                    <div
                        class="happy2-file-tree__status-line"
                        data-happy2-ui="file-tree-status-line"
                    >
                        {local.loadingLabel ?? "Loading files…"}
                    </div>
                }
            >
                <Show
                    when={local.nodes.length > 0}
                    fallback={
                        <div class="happy2-file-tree__status-line" data-happy2-ui="file-tree-empty">
                            {local.emptyLabel ?? "No files to show."}
                        </div>
                    }
                >
                    <For each={local.nodes}>
                        {(node) => (
                            <FileTreeRow
                                depth={0}
                                indent={indent()}
                                moreLabel={local.moreLabel ?? "Show more…"}
                                node={node}
                                onLoadMore={local.onLoadMore}
                                onSelect={local.onSelect}
                                onToggle={local.onToggle}
                                selectedId={local.selectedId}
                            />
                        )}
                    </For>
                </Show>
            </Show>
        </div>
    );
}
