import { FileAttachment } from "../../src/FileAttachment";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

const column: Record<string, string> = {
    display: "flex",
    "flex-direction": "column",
    "align-items": "flex-start",
    gap: "10px",
};

export function FileAttachmentPage() {
    return (
        <ComponentPage
            number="C-049"
            summary="A non-image file card for a chat message: a doc glyph, a truncating name, and an optional mono size on an inset pill. A single block-level button so it composes cleanly in a message body."
            title="FileAttachment"
        >
            <Specimen
                detail="doc glyph · name 13/600 · size 11 mono · inset pill · clickable button"
                label="File attachment"
                number="01"
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
                number="02"
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
                number="03"
                stage="app"
            >
                <FileAttachment name="shared-config.json" size="12 KB" />
            </Specimen>
        </ComponentPage>
    );
}
