import { expect, it } from "vitest";
import "./theme.css";
import "./styles/icon.css";
import "./styles/file-tree.css";
import { FileTree, type FileTreeNode } from "./FileTree";
import { createRenderer } from "./testing";

/*
 * FileTree owns row LAYOUT (a 28px row grid, a fixed 16px disclosure slot, and
 * 16px-per-level indentation expressed as row left padding), the git-status
 * decoration tokens (name + single letter share one semantic color per state),
 * and the selection/hover surfaces. Every painted glyph is an Icon primitive
 * already optically tuned in Icon.test, so this file asserts geometry, computed
 * tokens, and typography — not glyph centroids.
 */

const fontFamily = "happy2 Figtree, system-ui, sans-serif";
const monoFamily = "happy2 Mono, ui-monospace, monospace";

const nodes: FileTreeNode[] = [
    {
        id: "src/",
        name: "src",
        kind: "directory",
        expanded: true,
        hasMore: true,
        children: [
            { id: "src/index.ts", name: "index.ts", kind: "file", gitStatus: "modified" },
            { id: "src/theme.css", name: "theme.css", kind: "file" },
            { id: "src/logo.png", name: "logo.png", kind: "file" },
            { id: "src/new.ts", name: "new.ts", kind: "file", gitStatus: "added" },
            { id: "src/old.ts", name: "old.ts", kind: "file", gitStatus: "deleted" },
        ],
    },
    { id: "docs/", name: "docs", kind: "directory", gitStatus: "ignored" },
    { id: "notes.md", name: "notes.md", kind: "file", gitStatus: "renamed" },
    { id: ".env", name: ".env", kind: "file", gitStatus: "untracked" },
    { id: "README.md", name: "README.md", kind: "file" },
];

const statusColor: Record<string, string> = {
    "src/index.ts": "rgb(255, 149, 0)", // modified · warning
    "src/new.ts": "rgb(52, 199, 89)", // added · success
    "src/old.ts": "rgb(255, 59, 48)", // deleted · danger
    "notes.md": "rgb(0, 122, 255)", // renamed · info
    ".env": "rgb(52, 199, 89)", // untracked · success
};

const statusLetter: Record<string, string> = {
    "src/index.ts": "M",
    "src/new.ts": "A",
    "src/old.ts": "D",
    "notes.md": "R",
    ".env": "U",
    "docs/": "I",
};

it("holds FileTree row grid, indentation, disclosure, git decorations, and selection", async () => {
    const view = createRenderer();

    view.render(
        () => (
            <div style={{ background: "var(--happy2-bg-surface)", width: "100%" }}>
                <FileTree
                    data-testid="tree"
                    nodes={nodes}
                    onLoadMore={() => {}}
                    onSelect={() => {}}
                    onToggle={() => {}}
                    selectedId="README.md"
                />
            </div>
        ),
        { width: 300, height: 340, padding: 16 },
    );
    await view.ready();

    const sel = (rest: string) => `[data-testid="tree"] ${rest}`;
    const row = (path: string) => view.$(sel(`[data-path="${CSS.escape(path)}"]`));

    /* ---- Root contract -------------------------------------------------- */

    const root = view.$('[data-testid="tree"]');
    expect(root.element.tagName).toBe("DIV");
    expect(root.element.getAttribute("role")).toBe("tree");
    expect(
        root.computedStyles(["box-sizing", "display", "flex-direction", "background-color"]),
    ).toEqual({
        "box-sizing": "border-box",
        display: "flex",
        "flex-direction": "column",
        "background-color": "rgba(0, 0, 0, 0)",
    });

    /* ---- Row grid: rendered in tree order, every row 28px tall ---------- */

    const order = [
        "src/",
        "src/index.ts",
        "src/theme.css",
        "src/logo.png",
        "src/new.ts",
        "src/old.ts",
        "docs/",
        "notes.md",
        ".env",
        "README.md",
    ];
    for (const path of order) {
        const r = row(path);
        expect(r.bounds().height, path).toBe(28);
        expect(r.computedStyles(["display", "align-items"]), path).toEqual({
            display: "flex",
            "align-items": "center",
        });
    }

    /* Depth → left padding: 8px base + 16px per level. Root at 8, src/* at 24. */
    expect(row("src/").computedStyle("padding-left")).toBe("8px");
    expect(row("README.md").computedStyle("padding-left")).toBe("8px");
    expect(row("src/index.ts").computedStyle("padding-left")).toBe("24px");
    expect(row("src/old.ts").computedStyle("padding-left")).toBe("24px");

    /* ---- Disclosure: directories carry a chevron; files never do -------- */

    const srcChevron = view.$(sel('[data-path="src/"] [data-happy2-ui="file-tree-chevron"]'));
    expect(srcChevron.element.tagName).toBe("BUTTON");
    expect(srcChevron.element.getAttribute("aria-expanded")).toBe("true");
    expect(row("src/").element.getAttribute("data-expanded")).toBe("");
    expect(srcChevron.bounds().width).toBe(16);

    const docsChevron = view.$(sel('[data-path="docs/"] [data-happy2-ui="file-tree-chevron"]'));
    expect(docsChevron.element.getAttribute("aria-expanded")).toBe("false");
    expect(row("docs/").element.getAttribute("data-expanded")).toBeNull();

    expect(
        view.container.querySelector(
            sel('[data-path="README.md"] [data-happy2-ui="file-tree-chevron"]'),
        ),
        "files have no chevron",
    ).toBeNull();

    /* Disc slot is a fixed 16px column so file names align under folder names. */
    expect(
        view.$(sel('[data-path="README.md"] [data-happy2-ui="file-tree-disc"]')).bounds().width,
    ).toBe(16);

    /* ---- Kind icon: directories use the folder glyph, files resolve by type - */

    const iconName = (path: string) =>
        view
            .$(
                sel(
                    `[data-path="${CSS.escape(path)}"] [data-happy2-ui="file-tree-icon"] [data-name]`,
                ),
            )
            .element.getAttribute("data-name");

    expect(iconName("src/"), "directory").toBe("files");
    expect(iconName("docs/"), "directory").toBe("files");
    expect(iconName("src/index.ts"), ".ts is code").toBe("code");
    expect(iconName("src/theme.css"), ".css is braces").toBe("braces");
    expect(iconName(".env"), ".env is braces").toBe("braces");
    expect(iconName("src/logo.png"), ".png is image").toBe("image");
    expect(iconName("notes.md"), ".md is doc").toBe("doc");
    expect(iconName("README.md"), "README.md is doc").toBe("doc");

    /* ---- Directory typography ------------------------------------------ */

    const srcName = view.$(sel('[data-path="src/"] [data-happy2-ui="file-tree-name"]'));
    const srcMetrics = srcName.textMetrics();
    expect(srcMetrics.text).toBe("src");
    expect(srcMetrics.font.family).toBe(fontFamily);
    expect(srcMetrics.font.size).toBe(13);
    expect(srcMetrics.font.weight).toBe("600");
    expect(srcMetrics.font.lineHeight).toBe(18);
    expect(srcName.computedStyle("color")).toBe("rgb(0, 0, 0)");

    /* ---- File typography (unselected, no status) ----------------------- */

    const plainName = view.$(sel('[data-path="src/theme.css"] [data-happy2-ui="file-tree-name"]'));
    const plainMetrics = plainName.textMetrics();
    expect(plainMetrics.font.weight).toBe("500");
    expect(plainMetrics.font.size).toBe(13);
    expect(plainName.computedStyle("color")).toBe("rgb(142, 142, 147)");

    /* ---- Selection: README.md carries the accent-soft surface + solid ink */

    expect(row("README.md").element.getAttribute("data-selected")).toBe("");
    expect(row("README.md").computedStyle("background-color")).toBe("rgba(0, 122, 255, 0.14)");
    expect(
        view
            .$(sel('[data-path="README.md"] [data-happy2-ui="file-tree-name"]'))
            .computedStyle("color"),
    ).toBe("rgb(0, 0, 0)");
    /* Unselected rows keep the transparent surface. */
    expect(row("src/theme.css").computedStyle("background-color")).toBe("rgba(0, 0, 0, 0)");

    /* ---- Git decorations: name + letter share one color per status ------ */

    for (const [path, color] of Object.entries(statusColor)) {
        const name = view.$(
            sel(`[data-path="${CSS.escape(path)}"] [data-happy2-ui="file-tree-name"]`),
        );
        const status = view.$(
            sel(`[data-path="${CSS.escape(path)}"] [data-happy2-ui="file-tree-status"]`),
        );
        expect(name.computedStyle("color"), `${path} name`).toBe(color);
        expect(status.computedStyle("color"), `${path} letter`).toBe(color);
        expect(status.element.textContent, `${path} letter`).toBe(statusLetter[path]);
    }

    /* Deleted files are struck through; ignored directories dim to faint. */
    expect(
        view
            .$(sel('[data-path="src/old.ts"] [data-happy2-ui="file-tree-name"]'))
            .computedStyle("text-decoration-line"),
    ).toBe("line-through");
    const docsName = view.$(sel('[data-path="docs/"] [data-happy2-ui="file-tree-name"]'));
    expect(docsName.computedStyle("color")).toBe("rgb(142, 142, 147)");
    expect(row("docs/").element.getAttribute("data-status")).toBe("ignored");

    /* Status letter is tabular mono for a stable single-column decoration. */
    const modifiedStatus = view.$(
        sel('[data-path="src/index.ts"] [data-happy2-ui="file-tree-status"]'),
    );
    expect(modifiedStatus.textMetrics().font.family).toBe(monoFamily);
    expect(modifiedStatus.textMetrics().font.size).toBe(11);
    expect(modifiedStatus.textMetrics().font.weight).toBe("700");

    /* ---- Paging affordance: a "Show more" row indented one level deeper -- */

    const more = view.$(sel('[data-happy2-ui="file-tree-more"]'));
    expect(more.element.tagName).toBe("BUTTON");
    expect(more.element.textContent).toBe("Show more…");
    expect(more.computedStyle("padding-left")).toBe("24px");
    expect(more.computedStyle("color")).toBe("rgb(0, 122, 255)");
    expect((await more.visibleMetrics()).pixelCount).toBeGreaterThan(0);

    window.scrollTo(0, 0);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await view.screenshot("FileTree.test");
}, 120_000);

it("routes selection, disclosure, and paging callbacks, and renders loading/empty states", async () => {
    const selected: string[] = [];
    const toggled: string[] = [];
    const paged: string[] = [];
    const view = createRenderer();

    view.render(
        () => (
            <div style={{ background: "var(--happy2-bg-surface)", width: "100%" }}>
                <FileTree
                    data-testid="live"
                    nodes={nodes}
                    onLoadMore={(id) => paged.push(id)}
                    onSelect={(id) => selected.push(id)}
                    onToggle={(id) => toggled.push(id)}
                />
                <FileTree data-testid="busy" loading nodes={[]} />
                <FileTree data-testid="empty" nodes={[]} />
                <FileTree
                    data-testid="collapsed"
                    nodes={[
                        {
                            id: "pkg/",
                            name: "pkg",
                            kind: "directory",
                            expanded: true,
                            loading: true,
                        },
                    ]}
                />
            </div>
        ),
        { width: 300, height: 460, padding: 16 },
    );
    await view.ready();

    const at = (testid: string, rest = "") => `[data-testid="${testid}"] ${rest}`;

    /* Clicking a file entry selects it; a directory chevron toggles it; the
       "Show more" control pages — each reports the node id, nothing else. */
    (
        view.$(at("live", '[data-path="README.md"] [data-happy2-ui="file-tree-entry"]'))
            .element as HTMLButtonElement
    ).click();
    (
        view.$(at("live", '[data-path="docs/"] [data-happy2-ui="file-tree-chevron"]'))
            .element as HTMLButtonElement
    ).click();
    (view.$(at("live", '[data-happy2-ui="file-tree-more"]')).element as HTMLButtonElement).click();
    expect(selected).toEqual(["README.md"]);
    expect(toggled).toEqual(["docs/"]);
    expect(paged).toEqual(["src/"]);

    /* Selecting a directory's own name still selects (does not toggle). */
    (
        view.$(at("live", '[data-path="src/"] [data-happy2-ui="file-tree-entry"]'))
            .element as HTMLButtonElement
    ).click();
    expect(selected).toEqual(["README.md", "src/"]);
    expect(toggled).toEqual(["docs/"]);

    /* Whole-tree loading and empty states render a single muted status line. */
    const busy = view.$(at("busy", '[data-happy2-ui="file-tree-status-line"]'));
    expect(busy.element.textContent).toBe("Loading files…");
    expect(busy.computedStyle("color")).toBe("rgb(142, 142, 147)");
    expect(view.$(at("empty", '[data-happy2-ui="file-tree-empty"]')).element.textContent).toBe(
        "No files to show.",
    );

    /* A directory mid-fetch shows its own loading placeholder in place of children. */
    const nested = view.$(at("collapsed", '[data-happy2-ui="file-tree-loading"]'));
    expect(nested.element.textContent).toBe("Loading…");
    expect(nested.computedStyle("padding-left")).toBe("24px");

    window.scrollTo(0, 0);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await view.screenshot("FileTree.states");
}, 120_000);
