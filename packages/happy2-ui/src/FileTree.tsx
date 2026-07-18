import { splitProps } from "./reactProps";
import { type CSSProperties } from "react";
import { Icon, type IconName } from "./Icon";
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
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
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
const GIT_STATUS: Record<
    FileTreeGitStatus,
    {
        letter: string;
        label: string;
    }
> = {
    added: { letter: "A", label: "Added" },
    deleted: { letter: "D", label: "Deleted" },
    ignored: { letter: "I", label: "Ignored" },
    modified: { letter: "M", label: "Modified" },
    renamed: { letter: "R", label: "Renamed" },
    untracked: { letter: "U", label: "Untracked" },
};
const BASE_PADDING = 8;
const DEFAULT_INDENT = 16;
/**
 * File-type icon vocabulary, keyed by lowercase extension. Everything a code
 * explorer routinely shows maps to one of the shared Icon glyphs; anything
 * unrecognized falls back to the generic `doc`. This is a visual decision the
 * tree owns (like its git-status letters), derived purely from the file name —
 * the caller never has to pick an icon.
 */
const EXTENSION_ICON: Record<string, IconName> = {
    // Source code
    ts: "code",
    tsx: "code",
    js: "code",
    jsx: "code",
    mjs: "code",
    cjs: "code",
    mts: "code",
    cts: "code",
    py: "code",
    rb: "code",
    go: "code",
    rs: "code",
    java: "code",
    kt: "code",
    kts: "code",
    swift: "code",
    c: "code",
    h: "code",
    cc: "code",
    cpp: "code",
    hpp: "code",
    cxx: "code",
    cs: "code",
    php: "code",
    lua: "code",
    dart: "code",
    scala: "code",
    ex: "code",
    exs: "code",
    clj: "code",
    hs: "code",
    ml: "code",
    sql: "code",
    html: "code",
    htm: "code",
    vue: "code",
    svelte: "code",
    astro: "code",
    // Data, config, and style — brace-delimited formats
    json: "braces",
    jsonc: "braces",
    json5: "braces",
    yaml: "braces",
    yml: "braces",
    toml: "braces",
    xml: "braces",
    ini: "braces",
    env: "braces",
    lock: "braces",
    properties: "braces",
    conf: "braces",
    plist: "braces",
    css: "braces",
    scss: "braces",
    sass: "braces",
    less: "braces",
    styl: "braces",
    // Images
    png: "image",
    jpg: "image",
    jpeg: "image",
    gif: "image",
    svg: "image",
    webp: "image",
    ico: "image",
    bmp: "image",
    avif: "image",
    tiff: "image",
    heic: "image",
    // Shell scripts
    sh: "terminal",
    bash: "terminal",
    zsh: "terminal",
    fish: "terminal",
    ps1: "terminal",
    bat: "terminal",
    cmd: "terminal",
    // Keys and certificates
    pem: "shield",
    key: "shield",
    crt: "shield",
    cert: "shield",
    cer: "shield",
    p12: "shield",
    pfx: "shield",
    // Prose
    md: "doc",
    mdx: "doc",
    markdown: "doc",
    txt: "doc",
    rst: "doc",
    adoc: "doc",
    pdf: "doc",
};
/** Bare filenames (no useful extension) that still have a conventional icon. */
const FILENAME_ICON: Record<string, IconName> = {
    dockerfile: "code",
    makefile: "terminal",
    ".gitignore": "settings",
    ".gitattributes": "settings",
    ".npmrc": "settings",
    ".editorconfig": "settings",
    ".prettierrc": "settings",
    ".dockerignore": "settings",
};
/**
 * Pick a file's row icon from its name. Directories always use the folder glyph;
 * files resolve by a special-cased bare name first, then by extension, then the
 * generic document fallback.
 */
function fileIcon(node: FileTreeNode): IconName {
    if (node.kind === "directory") return "files";
    const name = node.name.toLowerCase();
    const special = FILENAME_ICON[name];
    if (special) return special;
    const dot = name.lastIndexOf(".");
    // No dot, or a leading-dot dotfile with no further extension (e.g. ".env"
    // reads "env"; ".gitignore" reads "gitignore" and falls through to doc).
    const ext = dot > 0 ? name.slice(dot + 1) : dot === 0 ? name.slice(1) : "";
    return EXTENSION_ICON[ext] ?? "doc";
}
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
                className="happy2-file-tree__row"
                data-happy2-ui="file-tree-row"
                data-kind={node().kind}
                data-path={node().id}
                data-selected={selected() ? "" : undefined}
                data-status={node().gitStatus}
                data-expanded={directory() && node().expanded ? "" : undefined}
                style={{ paddingLeft: `${padLeft()}px` }}
            >
                <span className="happy2-file-tree__disc" data-happy2-ui="file-tree-disc">
                    {directory() ? (
                        <button
                            aria-expanded={node().expanded ? "true" : "false"}
                            aria-label={`${node().expanded ? "Collapse" : "Expand"} ${node().name}`}
                            className="happy2-file-tree__chevron"
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
                    ) : null}
                </span>
                <button
                    aria-current={selected() ? "true" : undefined}
                    className="happy2-file-tree__entry"
                    data-happy2-ui="file-tree-entry"
                    onClick={() => props.onSelect?.(node().id)}
                    onDoubleClick={() => directory() && props.onToggle?.(node().id)}
                    type="button"
                >
                    <span className="happy2-file-tree__icon" data-happy2-ui="file-tree-icon">
                        <Icon name={fileIcon(node())} size={14} />
                    </span>
                    <span className="happy2-file-tree__name" data-happy2-ui="file-tree-name">
                        {node().name}
                    </span>
                    {status()
                        ? ((entry) => (
                              <span
                                  className="happy2-file-tree__status"
                                  data-happy2-ui="file-tree-status"
                                  title={entry.label}
                              >
                                  {entry.letter}
                              </span>
                          ))(status()!)
                        : null}
                </button>
            </div>
            {directory() && node().expanded ? (
                node().loading ? (
                    <div
                        className="happy2-file-tree__loading"
                        data-happy2-ui="file-tree-loading"
                        style={{
                            paddingLeft: `${BASE_PADDING + (props.depth + 1) * props.indent}px`,
                        }}
                    >
                        Loading…
                    </div>
                ) : (
                    <>
                        {(node().children ?? []).map((child) => (
                            <FileTreeRow
                                depth={props.depth + 1}
                                key={child.id}
                                indent={props.indent}
                                moreLabel={props.moreLabel}
                                node={child}
                                onLoadMore={props.onLoadMore}
                                onSelect={props.onSelect}
                                onToggle={props.onToggle}
                                selectedId={props.selectedId}
                            />
                        ))}
                        {node().hasMore ? (
                            <button
                                className="happy2-file-tree__more"
                                data-happy2-ui="file-tree-more"
                                onClick={() => props.onLoadMore?.(node().id)}
                                style={{
                                    paddingLeft: `${BASE_PADDING + (props.depth + 1) * props.indent}px`,
                                }}
                                type="button"
                            >
                                {props.moreLabel}
                            </button>
                        ) : null}
                    </>
                )
            ) : null}
        </>
    );
}
/**
 * C-052 FileTree — a props-only, indentable file/folder tree modeled on a
 * code-editor explorer. Directories disclose with a chevron and reveal their
 * (caller-materialized) children; files are leaves that show a type icon
 * resolved from their name plus an optional git-status decoration. Selection,
 * hover, per-directory loading, and a "Show more" paging affordance are all
 * driven by props — the tree never fetches or holds state.
 */
export function FileTree(props: FileTreeProps) {
    const [local] = splitProps(props, [
        "className",
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
            className={["happy2-file-tree", local.className].filter(Boolean).join(" ")}
            data-happy2-ui="file-tree"
            data-testid={local["data-testid"]}
            role="tree"
            style={local.style}
        >
            {!local.loading ? (
                local.nodes.length > 0 ? (
                    local.nodes.map((node) => (
                        <FileTreeRow
                            depth={0}
                            key={node.id}
                            indent={indent()}
                            moreLabel={local.moreLabel ?? "Show more…"}
                            node={node}
                            onLoadMore={local.onLoadMore}
                            onSelect={local.onSelect}
                            onToggle={local.onToggle}
                            selectedId={local.selectedId}
                        />
                    ))
                ) : (
                    <div className="happy2-file-tree__status-line" data-happy2-ui="file-tree-empty">
                        {local.emptyLabel ?? "No files to show."}
                    </div>
                )
            ) : (
                <div
                    className="happy2-file-tree__status-line"
                    data-happy2-ui="file-tree-status-line"
                >
                    {local.loadingLabel ?? "Loading files…"}
                </div>
            )}
        </div>
    );
}
