import { FileAttachment } from "../../src/FileAttachment";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

const column: Record<string, string> = {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "10px",
};

export function FileAttachmentPage() {
    return (
        <ComponentPage
            number="C-049"
            summary="A non-image file attachment with a compact treatment and a larger bounded card for chat message lists."
            title="FileAttachment"
        >
            <Specimen
                detail="bounded 420px card · 40px file tile · stacked metadata · hover action"
                label="Chat-list attachment"
                number="01"
                stage="app"
            >
                <div style={column}>
                    <FileAttachment
                        name="Relay Flagship (standalone).html"
                        onOpen={() => {}}
                        size="283 KB"
                        variant="chat"
                    />
                    <FileAttachment
                        actionsVisible
                        name="Relay Flagship (standalone).html"
                        onOpen={() => {}}
                        size="283 KB"
                        variant="chat"
                    />
                </div>
                <DimensionRule label="64px high · never stretches beyond 420px · hover reveals download affordance" />
            </Specimen>

            <Specimen
                detail="doc glyph · name 13/600 · size 11 mono · inset pill · clickable button"
                label="Compact attachment"
                number="02"
                stage="app"
            >
                <div style={column}>
                    <FileAttachment
                        name="Relay Flagship (standalone).html"
                        onOpen={() => {}}
                        size="283 KB"
                    />
                    <FileAttachment
                        kind="archive"
                        name="release-assets.zip"
                        onOpen={() => {}}
                        size="4.2 MB"
                    />
                    <FileAttachment name="notes.txt" onOpen={() => {}} />
                    <DimensionRule label="inset pill · 10px radius · hover raises the surface" />
                </div>
            </Specimen>

            <Specimen
                detail="A long name truncates with an ellipsis; the size never shrinks"
                label="Truncation"
                number="03"
                stage="app"
            >
                <div style={{ width: "320px" }}>
                    <FileAttachment
                        name="Q3-mobile-launch-readiness-review-final-FINAL-v2.pdf"
                        onOpen={() => {}}
                        size="1.7 MB"
                    />
                </div>
            </Specimen>

            <Specimen
                detail="Read-only (no onOpen) renders a static div rather than a button"
                label="Read-only"
                number="04"
                stage="app"
            >
                <FileAttachment name="shared-config.json" size="12 KB" />
            </Specimen>
        </ComponentPage>
    );
}
