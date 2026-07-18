import { FileTree, type FileTreeNode } from "../../src/FileTree";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

const sampleNodes: FileTreeNode[] = [
    {
        id: "src/",
        name: "src",
        kind: "directory",
        expanded: true,
        children: [
            {
                id: "src/components/",
                name: "components",
                kind: "directory",
                expanded: true,
                hasMore: true,
                children: [
                    {
                        id: "src/components/FileTree.tsx",
                        name: "FileTree.tsx",
                        kind: "file",
                        gitStatus: "added",
                    },
                    {
                        id: "src/components/Sidebar.tsx",
                        name: "Sidebar.tsx",
                        kind: "file",
                        gitStatus: "modified",
                    },
                    {
                        id: "src/components/legacy.tsx",
                        name: "legacy.tsx",
                        kind: "file",
                        gitStatus: "deleted",
                    },
                ],
            },
            { id: "src/index.ts", name: "index.ts", kind: "file", gitStatus: "modified" },
            { id: "src/theme.css", name: "theme.css", kind: "file" },
            { id: "src/logo.svg", name: "logo.svg", kind: "file" },
            { id: "src/notes.md", name: "notes.md", kind: "file", gitStatus: "renamed" },
        ],
    },
    {
        id: "tests/",
        name: "tests",
        kind: "directory",
        expanded: true,
        loading: true,
    },
    { id: "deploy.sh", name: "deploy.sh", kind: "file" },
    { id: "package.json", name: "package.json", kind: "file", gitStatus: "modified" },
    { id: ".env.local", name: ".env.local", kind: "file", gitStatus: "untracked" },
    { id: "dist/", name: "dist", kind: "directory", gitStatus: "ignored" },
    { id: "README.md", name: "README.md", kind: "file" },
];

const collapsedNodes: FileTreeNode[] = [
    { id: ".git/", name: ".git", kind: "directory" },
    { id: "node_modules/", name: "node_modules", kind: "directory", gitStatus: "ignored" },
    { id: "src/", name: "src", kind: "directory", gitStatus: "modified" },
    { id: "package.json", name: "package.json", kind: "file" },
];

function frame(children: ReturnType<typeof FileTree>, width = 320) {
    return (
        <div
            style={{
                background: "var(--happy2-bg-surface)",
                border: "1px solid var(--happy2-border)",
                borderRadius: "10px",
                padding: "6px",
                width: `${width}px`,
            }}
        >
            {children}
        </div>
    );
}

export function FileTreePage() {
    return (
        <ComponentPage
            number="C-052"
            summary="A props-only file/folder explorer: 28px rows, chevron disclosure for directories, 16px-per-level indentation, file-type icons resolved from each name, git-status decorations, selection, and a 'Show more' paging affordance."
            title="FileTree"
        >
            <Specimen
                detail="28px rows · 16px indent · git decorations · selection · paging · per-directory loading"
                label="Materialized tree"
                number="01"
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {frame(
                        <FileTree
                            nodes={sampleNodes}
                            onLoadMore={() => {}}
                            onSelect={() => {}}
                            onToggle={() => {}}
                            selectedId="src/index.ts"
                        />,
                    )}
                    <DimensionRule label="320 px panel · 28 px row · 16 px indent per level" />
                </div>
            </Specimen>

            <Specimen
                detail="Collapsed directories waiting to disclose; ignored entries dimmed"
                label="Collapsed roots"
                number="02"
                stage="surface"
            >
                {frame(<FileTree nodes={collapsedNodes} onToggle={() => {}} />)}
            </Specimen>

            <Specimen detail="Initial load" label="Loading" number="03" stage="surface">
                {frame(<FileTree loading nodes={[]} />)}
            </Specimen>

            <Specimen detail="Nothing to show" label="Empty" number="04" stage="surface">
                {frame(<FileTree nodes={[]} />)}
            </Specimen>
        </ComponentPage>
    );
}
