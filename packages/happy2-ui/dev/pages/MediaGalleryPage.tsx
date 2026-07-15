import type { MediaItem } from "../../src/MediaGallery";
import { MediaGallery } from "../../src/MediaGallery";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/* Deterministic data-URI previews (no network). A 4:3 diagonal gradient rect
 * standing in for a real thumbnail; the theme palette keeps the blueprint
 * on-brand. */
function thumb(from: string, to: string) {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='120'>\
<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>\
<stop offset='0' stop-color='${from}'/><stop offset='1' stop-color='${to}'/>\
</linearGradient></defs><rect width='160' height='120' fill='url(#g)'/></svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const overview: MediaItem[] = [
    {
        id: "rec",
        kind: "video",
        name: "Standup recording.mp4",
        size: "48 MB",
        duration: "12:04",
        thumbnailUrl: thumb("#8b7cf7", "#6d28d9"),
    },
    {
        id: "cover",
        kind: "photo",
        name: "Launch cover.png",
        size: "1.2 MB",
        thumbnailUrl: thumb("#38bdf8", "#6366f1"),
    },
    {
        id: "react",
        kind: "gif",
        name: "Reaction.gif",
        size: "820 KB",
        duration: "0:03",
        thumbnailUrl: thumb("#fb7185", "#c026d3"),
    },
    { id: "spec", kind: "file", name: "Q3 report.pdf", size: "2.4 MB" },
    {
        id: "shot",
        kind: "photo",
        name: "Diagram.png",
        size: "540 KB",
        thumbnailUrl: thumb("#34d399", "#0d9488"),
    },
    {
        id: "demo",
        kind: "video",
        name: "Feature demo.mov",
        size: "112 MB",
        duration: "4:37",
        thumbnailUrl: thumb("#fbbf24", "#ea580c"),
    },
    { id: "budget", kind: "file", name: "budget.xlsx", size: "88 KB" },
    {
        id: "loop",
        kind: "gif",
        name: "Loading loop.gif",
        size: "210 KB",
        duration: "0:01",
        thumbnailUrl: thumb("#f472b6", "#8b7cf7"),
    },
];

const kinds: MediaItem[] = [
    {
        id: "k-photo",
        kind: "photo",
        name: "photo.png",
        size: "1.2 MB",
        thumbnailUrl: thumb("#38bdf8", "#6366f1"),
    },
    {
        id: "k-video",
        kind: "video",
        name: "clip.mp4",
        size: "48 MB",
        duration: "1:24",
        thumbnailUrl: thumb("#8b7cf7", "#6d28d9"),
    },
    {
        id: "k-gif",
        kind: "gif",
        name: "loop.gif",
        size: "820 KB",
        duration: "0:03",
        thumbnailUrl: thumb("#fb7185", "#c026d3"),
    },
    { id: "k-file", kind: "file", name: "report.pdf", size: "2.4 MB" },
];

const noop = () => {};

export function MediaGalleryPage() {
    return (
        <ComponentPage
            number="C-038"
            summary="Media grid tiles — 4:3 thumbnail or file-glyph medallion, kind badge and duration overlays, and a name + size footer on an equal-track grid."
            title="Media gallery"
        >
            <div class="specimen-grid">
                <Specimen
                    detail="4 columns · 160px tiles · 12px gutters · 4:3 thumbnails"
                    label="Grid"
                    number="C-038·A"
                    stage="surface"
                >
                    <div style={{ display: "grid", gap: "6px", width: "676px", padding: "28px" }}>
                        <DimensionRule label="grid width 676 — 4 × 160 tiles" />
                        <MediaGallery columns={4} items={overview} onOpen={noop} />
                    </div>
                </Specimen>
            </div>

            <div class="specimen-grid">
                <Specimen
                    detail="photo · video · gif · file — thumbnail vs file-glyph fallback"
                    label="Kinds"
                    number="C-038·B"
                    stage="surface"
                >
                    <div style={{ width: "676px", padding: "28px" }}>
                        <MediaGallery columns={4} items={kinds} onOpen={noop} />
                    </div>
                </Specimen>
            </div>

            <div class="specimen-grid">
                <Specimen
                    detail="kind badge top-left · duration chip bottom-right · 48px glyph medallion"
                    label="Tile anatomy"
                    number="C-038·C"
                    stage="surface"
                >
                    <div style={{ display: "flex", gap: "24px", padding: "28px" }}>
                        <div style={{ display: "grid", gap: "6px", width: "160px" }}>
                            <DimensionRule label="video — badge + duration" />
                            <MediaGallery columns={1} items={[kinds[1]!]} onOpen={noop} />
                        </div>
                        <div style={{ display: "grid", gap: "6px", width: "160px" }}>
                            <DimensionRule label="file — glyph medallion" />
                            <MediaGallery columns={1} items={[kinds[3]!]} onOpen={noop} />
                        </div>
                    </div>
                </Specimen>
            </div>

            <div class="specimen-grid">
                <Specimen
                    detail="2-column density · long-name truncation · empty slot"
                    label="Layout states"
                    number="C-038·D"
                    stage="surface"
                >
                    <div style={{ display: "flex", gap: "24px", padding: "28px" }}>
                        <div style={{ width: "332px" }}>
                            <MediaGallery
                                columns={2}
                                items={[
                                    {
                                        id: "t-long",
                                        kind: "file",
                                        name: "Very-long-quarterly-financial-report-final-v7.pdf",
                                        size: "9.1 MB",
                                    },
                                    kinds[0]!,
                                ]}
                                onOpen={noop}
                            />
                        </div>
                        <div style={{ width: "240px" }}>
                            <MediaGallery
                                columns={2}
                                empty={
                                    <div
                                        style={{
                                            display: "grid",
                                            "place-items": "center",
                                            height: "120px",
                                            border: "1px dashed var(--happy2-border-strong)",
                                            "border-radius": "10px",
                                            color: "var(--happy2-text-muted)",
                                            "font-family": "var(--happy2-font-ui)",
                                            "font-size": "13px",
                                        }}
                                    >
                                        No files shared yet
                                    </div>
                                }
                                items={[]}
                            />
                        </div>
                    </div>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
