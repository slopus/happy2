import { type ReactNode } from "react";
import { FilePanel } from "../../src/FilePanel";
import type { FileTreeNode } from "../../src/FileTree";
import { ComponentPage, DimensionRule, Specimen } from "../kit";
const nodes: FileTreeNode[] = [
    {
        id: "src/",
        name: "src",
        kind: "directory",
        expanded: true,
        children: [
            { id: "src/index.ts", name: "index.ts", kind: "file", gitStatus: "modified" },
            { id: "src/model.ts", name: "model.ts", kind: "file", gitStatus: "modified" },
            { id: "src/workspace.ts", name: "workspace.ts", kind: "file", gitStatus: "added" },
        ],
    },
    {
        id: "tests/",
        name: "tests",
        kind: "directory",
        expanded: true,
        hasMore: true,
        children: [
            {
                id: "tests/workspace.test.ts",
                name: "workspace.test.ts",
                kind: "file",
                gitStatus: "added",
            },
        ],
    },
    { id: "dist/", name: "dist", kind: "directory", gitStatus: "ignored" },
    { id: "README.md", name: "README.md", kind: "file", gitStatus: "modified" },
    { id: ".env.local", name: ".env.local", kind: "file", gitStatus: "untracked" },
];
function panelFrame(children: ReactNode, height = 520) {
    return (
        <div
            style={{
                background: "var(--surface)",
                border: "1px solid var(--divider)",
                borderRadius: "10px",
                height: `${height}px`,
                overflow: "hidden",
                width: "320px",
            }}
        >
            {children}
        </div>
    );
}
export function FilePanelPage() {
    return (
        <ComponentPage
            number="C-053"
            summary="The workspace file-tree side panel: a 52px surface header with a branch/revision subtitle and close button, an optional note strip, and a scrolling FileTree body."
            title="FilePanel"
        >
            <Specimen
                detail="52px header · branch subtitle · git-status note · FileTree body"
                label="Workspace files"
                number="01"
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {panelFrame(
                        <FilePanel
                            note="6 changes on this branch"
                            nodes={nodes}
                            onClose={() => {}}
                            onSelect={() => {}}
                            onToggle={() => {}}
                            selectedId="src/model.ts"
                            subtitle="main · r1"
                        />,
                    )}
                    <DimensionRule label="320 px panel · 52 px header" />
                </div>
            </Specimen>

            <Specimen detail="Loading the initial tree" label="Loading" number="02" stage="surface">
                {panelFrame(
                    <FilePanel loading nodes={[]} onClose={() => {}} subtitle="main" />,
                    360,
                )}
            </Specimen>

            <Specimen
                detail="Clean checkout — no tree yet"
                label="Empty"
                number="03"
                stage="surface"
            >
                {panelFrame(
                    <FilePanel
                        emptyLabel="This workspace has no files yet."
                        nodes={[]}
                        onClose={() => {}}
                        subtitle="main"
                    />,
                    360,
                )}
            </Specimen>
        </ComponentPage>
    );
}
