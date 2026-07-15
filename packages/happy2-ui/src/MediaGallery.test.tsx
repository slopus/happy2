import { expect, it } from "vitest";
import "./theme.css";
import "./styles/icon.css";
import "./styles/badge.css";
import "./styles/media-gallery.css";
import { MediaGallery, type MediaItem } from "./MediaGallery";
import { createRenderer, RenderedElement } from "./testing";

/*
 * MediaGallery is a measured grid: equal integer tracks and gutters, 4:3
 * thumbnail cards, and — for a file tile — a centered 48px glyph medallion
 * that reuses the system's proven 48/20 Icon proportions. Per the optical
 * policy, the only strict alpha-centroid target is that balanced medallion
 * glyph (contract ceiling 0.75; Icon path data already measures <= 0.4px in
 * every engine). Everything else is asserted as exact geometry, computed-style
 * contract, colours, and clean (unclipped, painting) visible ink. Word labels
 * (name/size) are asserted for typography + left alignment, not a centroid.
 */

const noop = () => {};

/* Tuned centroid budget for the balanced file-glyph medallion. */
const GLYPH_TOL = 0.4;

/* Deterministic data-URI thumbnail — a solid violet 4:3 rect, no network. */
const THUMB = `data:image/svg+xml,${encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='160' height='120'>" +
        "<rect width='160' height='120' fill='#8b7cf7'/></svg>",
)}`;

/*
 * Alpha-weighted ink centroid of `part`, expressed in `box`-relative CSS px.
 * Refuses blank or clipped captures: the part must paint pixels, and its ink
 * must sit inside its own border box, so a truncated capture never passes.
 */
async function ink(part: RenderedElement<Element>, box: RenderedElement<Element>, name: string) {
    const vis = await part.visibleMetrics();
    const p = part.bounds();
    expect(vis.pixelCount, `${name} paints no pixels`).toBeGreaterThan(0);
    expect(vis.bounds.width, `${name} ink too narrow`).toBeGreaterThan(p.width * 0.2);
    expect(vis.bounds.height, `${name} ink too short`).toBeGreaterThan(p.height * 0.2);
    expect(vis.bounds.x, `${name} ink clipped left`).toBeGreaterThanOrEqual(-0.5);
    expect(vis.bounds.y, `${name} ink clipped top`).toBeGreaterThanOrEqual(-0.5);
    expect(vis.bounds.x + vis.bounds.width, `${name} ink clipped right`).toBeLessThanOrEqual(
        p.width + 0.5,
    );
    expect(vis.bounds.y + vis.bounds.height, `${name} ink clipped bottom`).toBeLessThanOrEqual(
        p.height + 0.5,
    );
    const b = box.bounds();
    return { x: vis.center.x + p.x - b.x, y: vis.center.y + p.y - b.y };
}

/* Absolute difference between a part's left and right gap inside `root`. */
function symmetry(part: RenderedElement<Element>, root: RenderedElement<Element>) {
    const p = part.bounds();
    const r = root.bounds();
    return Math.abs(p.x - r.x - (r.x + r.width - p.x - p.width));
}

const gridItems: MediaItem[] = [
    {
        id: "v1",
        kind: "video",
        name: "Standup recording.mp4",
        size: "48 MB",
        duration: "1:24",
        thumbnailUrl: THUMB,
    },
    { id: "p1", kind: "photo", name: "Launch cover.png", size: "1.2 MB", thumbnailUrl: THUMB },
    {
        id: "g1",
        kind: "gif",
        name: "Reaction.gif",
        size: "820 KB",
        duration: "0:03",
        thumbnailUrl: THUMB,
    },
    { id: "f1", kind: "file", name: "Q3 report.pdf", size: "2.4 MB" },
    { id: "f2", kind: "file", name: "budget.xlsx", size: "88 KB" },
    { id: "p2", kind: "photo", name: "Diagram.png", size: "540 KB", thumbnailUrl: THUMB },
];

it("holds MediaGallery grid geometry, tile anatomy, overlays, and footer typography", async () => {
    const view = createRenderer();

    // 3 columns, 12px gutters, 160px tiles → 504px root (480 tracks + 24 gap).
    view.render(
        () => <MediaGallery columns={3} data-testid="gallery" items={gridItems} onOpen={noop} />,
        {
            width: 536,
            height: 380,
            padding: 16,
        },
    );
    await view.ready();

    const uiFont = "happy2 Figtree, system-ui, sans-serif";

    /* ---- Root grid: equal integer tracks, 12px gutters ------------------- */

    const root = view.$('[data-testid="gallery"]');
    expect(root.element.tagName).toBe("DIV");
    expect(root.bounds()).toMatchObject({ x: 16, y: 16, width: 504 });
    expect(
        root.computedStyles(["display", "grid-template-columns", "column-gap", "row-gap", "color"]),
    ).toEqual({
        display: "grid",
        "grid-template-columns": "160px 160px 160px",
        "column-gap": "12px",
        "row-gap": "12px",
        color: "rgb(237, 234, 242)",
    });
    const rootBounds = root.bounds();

    /* ---- Six tiles: equal 160×160 boxes on a 172px pitch ----------------- */

    const ids = ["v1", "p1", "g1", "f1", "f2", "p2"];
    for (let i = 0; i < ids.length; i += 1) {
        const id = ids[i]!;
        const col = i % 3;
        const rowIndex = Math.floor(i / 3);
        const tile = view.$(`[data-media-id="${id}"]`);
        const b = tile.bounds();
        expect(tile.element.tagName, id).toBe("BUTTON");
        expect(b.width, `${id} width`).toBe(160);
        expect(b.height, `${id} height`).toBe(160);
        expect(b.x - rootBounds.x, `${id} column x`).toBe(col * 172);
        expect(b.y - rootBounds.y, `${id} row y`).toBe(rowIndex * 172);
    }

    /* ---- Thumbnail card: 4:3 border-box, radius 10, hairline, raised ----- */

    for (const id of ids) {
        const thumb = view.$(`[data-media-id="${id}"] [data-happy2-ui="media-thumb"]`);
        const tb = thumb.bounds();
        expect(tb.width, `${id} thumb width`).toBe(160);
        expect(tb.height, `${id} thumb height`).toBe(120);
        expect(
            thumb.computedStyles([
                "position",
                "overflow",
                "border-radius",
                "box-shadow",
                "background-color",
            ]),
            `${id} thumb style`,
        ).toEqual({
            position: "relative",
            overflow: "hidden",
            "border-radius": "10px",
            // 1px inset hairline (see media-gallery.css) — the thumb keeps a
            // clean integer 4:3 border box because it carries no layout border.
            "box-shadow": "rgba(255, 255, 255, 0.07) 0px 0px 0px 1px inset",
            "background-color": "rgb(36, 34, 43)",
        });
    }

    /* ---- Footer: 8px below the thumb, name over size --------------------- */

    const thumbV = view.$('[data-media-id="v1"] [data-happy2-ui="media-thumb"]');
    const footer = view.$('[data-media-id="v1"] [data-happy2-ui="media-footer"]');
    expect(footer.bounds().y - (thumbV.bounds().y + 120), "footer top gap").toBe(8);
    expect(footer.height(), "footer height").toBe(32);

    const name = view.$('[data-media-id="v1"] [data-happy2-ui="media-name"]');
    expect(name.bounds().x - thumbV.bounds().x, "name left-aligns with thumb").toBe(0);
    expect(name.textMetrics()).toMatchObject({
        font: { family: uiFont, lineHeight: 16, size: 13, weight: "500" },
        text: "Standup recording.mp4",
    });
    expect(name.computedStyles(["color", "white-space", "text-overflow", "overflow"])).toEqual({
        color: "rgb(237, 234, 242)",
        "white-space": "nowrap",
        "text-overflow": "ellipsis",
        overflow: "hidden",
    });
    expect((await name.visibleMetrics()).pixelCount, "name paints").toBeGreaterThan(0);

    const size = view.$('[data-media-id="v1"] [data-happy2-ui="media-size"]');
    expect(size.bounds().y - (name.bounds().y + name.bounds().height), "size below name").toBe(2);
    expect(size.textMetrics()).toMatchObject({
        font: { family: uiFont, lineHeight: 14, size: 11, weight: "500" },
        text: "48 MB",
    });
    expect(size.computedStyle("color"), "size muted").toBe("rgb(117, 112, 133)");

    /* ---- File glyph medallion (tile f1): centered 48px chip, 20px Icon --- */

    const thumbF = view.$('[data-media-id="f1"] [data-happy2-ui="media-thumb"]');
    const glyph = view.$('[data-media-id="f1"] [data-happy2-ui="media-glyph"]');
    expect(glyph.bounds().width, "glyph medallion width").toBe(48);
    expect(glyph.bounds().height, "glyph medallion height").toBe(48);
    // Centered in the 160×120 thumb border-box: (160-48)/2, (120-48)/2.
    expect(glyph.bounds().x - thumbF.bounds().x, "glyph x inset").toBe(56);
    expect(glyph.bounds().y - thumbF.bounds().y, "glyph y inset").toBe(36);
    expect(symmetry(glyph, thumbF), "glyph horizontal centering").toBeLessThanOrEqual(0.5);
    expect(
        glyph.computedStyles([
            "background-color",
            "border-radius",
            "border-top-color",
            "border-top-width",
            "color",
        ]),
    ).toEqual({
        "background-color": "rgba(255, 255, 255, 0.05)",
        "border-radius": "10px",
        "border-top-color": "rgba(255, 255, 255, 0.07)",
        "border-top-width": "1px",
        color: "rgb(165, 160, 176)",
    });

    const icon = view.$(
        '[data-media-id="f1"] [data-happy2-ui="media-glyph"] [data-happy2-ui="icon"]',
    );
    expect(icon.bounds().width, "icon box").toBe(20);
    expect(icon.bounds().height, "icon box").toBe(20);
    // Centered in the 48px medallion: (48 - 20) / 2 = 14 (13 + 1px border).
    expect(icon.bounds().x - glyph.bounds().x, "icon left inset").toBe(14);
    expect(icon.bounds().y - glyph.bounds().y, "icon top inset").toBe(14);
    expect(icon.computedStyle("stroke"), "icon stroke").toBe("rgb(165, 160, 176)");

    // Balanced glyph: alpha centroid on the medallion center (24, 24).
    const glyphInk = await ink(icon, glyph, "file glyph");
    expect(Math.abs(glyphInk.x - 24), "glyph optical x").toBeLessThanOrEqual(GLYPH_TOL);
    expect(Math.abs(glyphInk.y - 24), "glyph optical y").toBeLessThanOrEqual(GLYPH_TOL);

    /* ---- Kind badge overlay (tile v1): top-left inset 8, reuses Badge ---- */

    const kind = view.$('[data-media-id="v1"] [data-happy2-ui="media-kind"]');
    expect(kind.computedStyle("position"), "kind position").toBe("absolute");
    expect(kind.bounds().x - thumbV.bounds().x, "kind left inset").toBe(8);
    expect(kind.bounds().y - thumbV.bounds().y, "kind top inset").toBe(8);
    const badge = view.$('[data-media-id="v1"] [data-happy2-ui="badge"]');
    expect(badge.height(), "badge height").toBe(18);
    const badgeLabel = view.$('[data-media-id="v1"] [data-happy2-ui="badge-label"]');
    expect(badgeLabel.element.textContent, "kind label").toBe("VIDEO");
    expect((await badgeLabel.visibleMetrics()).pixelCount, "kind label paints").toBeGreaterThan(0);

    /* ---- Duration chip overlay (tile v1): bottom-right inset 8 ----------- */

    const duration = view.$('[data-media-id="v1"] [data-happy2-ui="media-duration"]');
    const db = duration.bounds();
    expect(db.height, "duration height").toBe(18);
    expect(thumbV.bounds().x + 160 - (db.x + db.width), "duration right inset").toBe(8);
    expect(thumbV.bounds().y + 120 - (db.y + db.height), "duration bottom inset").toBe(8);
    expect(duration.element.textContent, "duration text").toBe("1:24");
    expect(
        duration.computedStyles([
            "background-color",
            "border-radius",
            "color",
            "font-size",
            "font-weight",
        ]),
    ).toEqual({
        "background-color": "rgb(19, 18, 23)",
        "border-radius": "2px",
        color: "rgb(237, 234, 242)",
        "font-size": "11px",
        "font-weight": "600",
    });
    expect(duration.textMetrics().font.family, "duration mono").toBe(
        "happy2 Mono, ui-monospace, monospace",
    );
    expect(duration.computedStyle("font-variant-numeric"), "duration tabular").toContain(
        "tabular-nums",
    );
    expect((await duration.visibleMetrics()).pixelCount, "duration paints").toBeGreaterThan(0);

    /* ---- Image tile (photo p1): fills the content box, object-fit cover -- */

    const thumbP = view.$('[data-media-id="p1"] [data-happy2-ui="media-thumb"]');
    const image = view.$('[data-media-id="p1"] [data-happy2-ui="media-image"]');
    // The image fills the clean 160×120 thumb box (inset hairline, no border).
    expect(image.bounds().width, "image width").toBe(160);
    expect(image.bounds().height, "image height").toBe(120);
    expect(image.bounds().x - thumbP.bounds().x, "image left").toBe(0);
    expect(image.bounds().y - thumbP.bounds().y, "image top").toBe(0);
    expect(image.computedStyles(["display", "object-fit"])).toEqual({
        display: "block",
        "object-fit": "cover",
    });
    expect((await image.visibleMetrics()).pixelCount, "image paints").toBeGreaterThan(0);

    // Non-badge kinds carry no kind overlay; files carry no thumbnail image.
    expect(
        view.container.querySelector('[data-media-id="p1"] [data-happy2-ui="media-kind"]'),
        "photo has no kind badge",
    ).toBeNull();
    expect(
        view.container.querySelector('[data-media-id="f1"] [data-happy2-ui="media-image"]'),
        "file has no image",
    ).toBeNull();

    await view.screenshot("MediaGallery.test");
}, 120_000);

it("holds MediaGallery column density, truncation, and the empty slot", async () => {
    const view = createRenderer();

    // 4 columns, 12px gutters, 120px tiles → 516px root (480 tracks + 36 gap).
    view.render(
        () => (
            <MediaGallery
                columns={4}
                data-testid="gallery-4"
                items={[
                    {
                        id: "long",
                        kind: "file",
                        name: "Very-long-quarterly-financial-report-final-v7.pdf",
                        size: "9.1 MB",
                    },
                    { id: "b", kind: "file", name: "notes.txt", size: "4 KB" },
                    { id: "c", kind: "file", name: "deck.key", size: "12 MB" },
                    { id: "d", kind: "file", name: "logo.svg", size: "6 KB" },
                ]}
                onOpen={noop}
            />
        ),
        { width: 548, height: 190, padding: 16 },
    );
    view.render(
        () => (
            <MediaGallery
                columns={2}
                data-testid="gallery-empty"
                empty={
                    <div
                        data-testid="empty-body"
                        style={{ height: "120px", background: "#24222b" }}
                    >
                        No files shared yet
                    </div>
                }
                items={[]}
            />
        ),
        { width: 280, height: 160, padding: 16 },
    );
    await view.ready();

    /* ---- Four equal tracks -------------------------------------------------- */

    const root4 = view.$('[data-testid="gallery-4"]');
    expect(root4.bounds().width).toBe(516);
    expect(root4.computedStyle("grid-template-columns")).toBe("120px 120px 120px 120px");
    const root4Bounds = root4.bounds();
    for (let i = 0; i < 4; i += 1) {
        const tile = view.$(`[data-media-id="${["long", "b", "c", "d"][i]}"]`);
        const b = tile.bounds();
        expect(b.width, `col ${i} width`).toBe(120);
        expect(b.x - root4Bounds.x, `col ${i} x`).toBe(i * 132);
    }
    const thumb4 = view.$('[data-media-id="b"] [data-happy2-ui="media-thumb"]');
    expect(thumb4.bounds().width, "4-col thumb width").toBe(120);
    expect(thumb4.bounds().height, "4-col thumb height").toBe(90); // 4:3

    /* ---- Long name truncates inside the tile ------------------------------- */

    const longName = view.$('[data-media-id="long"] [data-happy2-ui="media-name"]');
    expect(longName.bounds().width, "truncated name width").toBeLessThanOrEqual(120);
    expect(longName.computedStyles(["white-space", "text-overflow", "overflow"])).toEqual({
        "white-space": "nowrap",
        "text-overflow": "ellipsis",
        overflow: "hidden",
    });
    expect(
        (longName.element as HTMLElement).scrollWidth,
        "name content overflows its box",
    ).toBeGreaterThan(Math.ceil(longName.bounds().width));
    expect((await longName.visibleMetrics()).pixelCount, "truncated name paints").toBeGreaterThan(
        0,
    );

    /* ---- Empty slot spans the full grid width, no tiles rendered ----------- */

    const rootEmpty = view.$('[data-testid="gallery-empty"]');
    const empty = view.$('[data-testid="gallery-empty"] [data-happy2-ui="media-empty"]');
    expect(empty.bounds().width, "empty spans full width").toBe(rootEmpty.bounds().width);
    expect(
        view.container.querySelector('[data-testid="gallery-empty"] [data-happy2-ui="media-tile"]'),
        "empty gallery renders no tiles",
    ).toBeNull();
    expect(
        (await view.$('[data-testid="empty-body"]').visibleMetrics()).pixelCount,
        "empty body paints",
    ).toBeGreaterThan(0);

    await view.screenshot("MediaGallery.variants.test");
}, 120_000);
