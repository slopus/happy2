import type { JSX } from "solid-js";
import { Banner } from "../../src/Banner";
import { FileEditor } from "../../src/FileEditor";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

const sample = `import { createSignal } from "solid-js";

export function Counter() {
    const [count, setCount] = createSignal(0);
    return (
        <button onClick={() => setCount(count() + 1)}>
            Count: {count()}
        </button>
    );
}
`;

function frame(children: JSX.Element, height = 420) {
    return (
        <div
            style={{
                background: "var(--happy2-bg-surface)",
                border: "1px solid var(--happy2-border)",
                "border-radius": "10px",
                height: `${height}px`,
                overflow: "hidden",
                width: "640px",
            }}
        >
            {children}
        </div>
    );
}

export function FileEditorPage() {
    return (
        <ComponentPage
            number="C-054"
            summary="A single-file text editor: a 52px header with the file name, directory subtitle, unsaved marker, and Save / Revert / Close; an optional alert banner; a monospace code body; and a status bar. Cmd/Ctrl+S saves."
            title="FileEditor"
        >
            <Specimen
                detail="Clean file — Save disabled, no marker"
                label="Saved"
                number="01"
                stage="surface"
            >
                <div style={{ display: "flex", "flex-direction": "column", gap: "12px" }}>
                    {frame(
                        <FileEditor
                            onClose={() => {}}
                            onSave={() => {}}
                            path="src/components/Counter.tsx"
                            status="1.2 KB · UTF-8"
                            value={sample}
                        />,
                    )}
                    <DimensionRule label="640 px surface · 52 px header · 28 px status bar" />
                </div>
            </Specimen>

            <Specimen
                detail="Dirty — unsaved marker, Revert + enabled Save"
                label="Unsaved edits"
                number="02"
                stage="surface"
            >
                {frame(
                    <FileEditor
                        dirty
                        onClose={() => {}}
                        onRevert={() => {}}
                        onSave={() => {}}
                        path="src/components/Counter.tsx"
                        status="Modified"
                        value={sample.replace("Count:", "Total:")}
                    />,
                )}
            </Specimen>

            <Specimen
                detail="Disk-change / conflict alert above the body"
                label="Conflict banner"
                number="03"
                stage="surface"
            >
                {frame(
                    <FileEditor
                        banner={
                            <Banner action={{ label: "Reload", onClick: () => {} }} tone="warning">
                                This file changed on disk. Reloading discards your edits.
                            </Banner>
                        }
                        dirty
                        onClose={() => {}}
                        onRevert={() => {}}
                        onSave={() => {}}
                        path="README.md"
                        status="Conflict"
                        value={"# Project\n\nLocal edits that no longer match the file on disk.\n"}
                    />,
                )}
            </Specimen>

            <Specimen
                detail="Read-only — no Save/Revert, muted ink"
                label="Read only"
                number="04"
                stage="surface"
            >
                {frame(
                    <FileEditor
                        onClose={() => {}}
                        path="dist/bundle.js"
                        readOnly
                        status="Read only"
                        value={"// generated output — do not edit\nconsole.log(0);\n"}
                    />,
                    300,
                )}
            </Specimen>
        </ComponentPage>
    );
}
