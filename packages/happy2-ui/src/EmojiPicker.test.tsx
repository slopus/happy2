import { expect, it } from "vitest";
import { server } from "vitest/browser";
import "./theme.css";
import "./styles/emoji-picker.css";
import "./styles/text-field.css";
import "./styles/icon.css";
import { EmojiPicker, type EmojiItem } from "./EmojiPicker";
import { createRenderer } from "./testing";

/* Opaque violet square — a deterministic, network-free custom
 * emoji image. object-fit fills the 24px slot, so its visible bounds equal the
 * slot exactly (parity reference against the unicode glyph slot). */
const CUSTOM_IMAGE =
    "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2024%2024'%3E%3Crect%20width='24'%20height='24'%20fill='%238b7cf7'/%3E%3C/svg%3E";

/* textMetrics().font.family strips quotes; a raw computed style keeps them on
 * Chromium/Firefox but not WebKit (see Button.test.tsx). */
const MONO = "happy2 Mono, ui-monospace, monospace";
const figtreeComputed =
    server.browser === "webkit"
        ? "happy2 Figtree, system-ui, sans-serif"
        : '"happy2 Figtree", system-ui, sans-serif';

type Engine = "chromium" | "firefox" | "webkit";
type Renderer = ReturnType<typeof createRenderer>;

const engine = server.browser as Engine;

/*
 * Per-engine emoji corrections (styles/emoji-picker.css), measured at true 2×
 * with visible-bounds centroids on zeroed vars. Guards that the @supports
 * engine scopes resolve on the right engine and nowhere else. Apple Color Emoji
 * sits ~1.5px left in Blink, ~2px left / 1px high in Gecko, and ~0.5px low in
 * WebKit; custom images are already centered and take no shift.
 */
const emojiCorrection: Record<Engine, { x: string; y: string }> = {
    chromium: { x: "1.5px", y: "0px" },
    firefox: { x: "2px", y: "1px" },
    webkit: { x: "0px", y: "-0.5px" },
};

/*
 * Painted-ink metrics of an emoji's inner element (unicode glyph span or custom
 * image) expressed in its own 24px art-slot coordinate system, per the DESIGN
 * emoji contract. Refuses a blank capture (pixelCount > 0) and returns the four
 * ink edges plus the visible-bounds center so the caller can assert the artwork
 * is unclipped and acceptably centered without requiring identical artwork.
 */
async function emojiInk(view: Renderer, cellSelector: string, inner: "glyph" | "image") {
    const art = view.$(`${cellSelector} [data-happy2-ui="emoji-picker-art"]`);
    const el = view.$(`${cellSelector} [data-happy2-ui="emoji-picker-${inner}"]`);
    const visible = await el.visibleMetrics();
    expect(visible.pixelCount, `${cellSelector} paints no pixels`).toBeGreaterThan(0);
    const artB = art.bounds();
    const elB = el.bounds();
    const inkLeft = elB.x - artB.x + visible.bounds.x;
    const inkTop = elB.y - artB.y + visible.bounds.y;
    return {
        inkLeft,
        inkTop,
        inkRight: inkLeft + visible.bounds.width,
        inkBottom: inkTop + visible.bounds.height,
        centerX: inkLeft + visible.bounds.width / 2,
        centerY: inkTop + visible.bounds.height / 2,
    };
}

const emoji: EmojiItem[] = [
    { id: "thumbsup", char: "\u{1F44D}", name: "thumbs up" },
    { id: "tada", char: "\u{1F389}", name: "tada" },
    { id: "rocket", char: "\u{1F680}", name: "rocket" },
    { id: "check", char: "\u{2705}", name: "check mark" },
    { id: "fire", char: "\u{1F525}", name: "fire" },
    { id: "heart", char: "\u{2764}\u{FE0F}", name: "heart" },
    { id: "eyes", char: "\u{1F440}", name: "eyes" },
    { id: "pray", char: "\u{1F64F}", name: "folded hands" },
    { id: "grinning", char: "\u{1F600}", name: "grinning" },
    { id: "sweat", char: "\u{1F605}", name: "sweat smile" },
    { id: "thinking", char: "\u{1F914}", name: "thinking" },
    { id: "party", char: "\u{1F973}", name: "partying face" },
    { id: "star", char: "\u{2B50}", name: "star" },
    { id: "sparkles", char: "\u{2728}", name: "sparkles" },
    { id: "bulb", char: "\u{1F4A1}", name: "light bulb" },
    { id: "handshake", char: "\u{1F91D}", name: "handshake" },
    { id: "flag-us", char: "\u{1F1FA}\u{1F1F8}", name: "flag United States" },
    { id: "dev", char: "\u{1F469}\u{200D}\u{1F4BB}", name: "woman technologist" },
    { id: "relay", imageUrl: CUSTOM_IMAGE, name: "relay custom" },
    { id: "mint", imageUrl: CUSTOM_IMAGE, name: "shipit custom" },
    { id: "rainbow", char: "\u{1F308}", name: "rainbow" },
    { id: "pizza", char: "\u{1F355}", name: "pizza" },
    { id: "clap", char: "\u{1F44F}", name: "clap" },
    { id: "wave", char: "\u{1F44B}", name: "wave" },
];

/* Ink is measured for the two images plus a spread of unicode classes: plain
 * faces, a flag, a ZWJ sequence, an emoji-presentation symbol, and a VS16
 * heart. Geometry is asserted for all 24 slots; ink capture is limited to this
 * representative set to keep the screenshot count bounded. */
const inkSubset = [
    "thumbsup",
    "flag-us",
    "dev",
    "heart",
    "star",
    "sparkles",
    "check",
    "party",
    "relay",
    "mint",
];

it("holds EmojiPicker card, search, fixed grid slots, and per-emoji centering", async () => {
    const selected: string[] = [];
    const view = createRenderer();

    view.render(
        () => (
            <EmojiPicker data-testid="picker" emoji={emoji} onSelect={(id) => selected.push(id)} />
        ),
        { width: 360, height: 200, padding: 16 },
    );
    await view.ready();

    /* ---- Card contract --------------------------------------------------- */

    const card = view.$('[data-testid="picker"]');
    /* 8 cols × 36 grid = 288, + 2×8 padding + 2×1 border = 306 wide; search
     * (28) + 8 gap + 3 rows × 36 grid (108) + 2×8 padding + 2×1 border = 162. */
    expect(card.bounds()).toEqual({ x: 16, y: 16, width: 306, height: 162 });
    expect(
        card.computedStyles([
            "background-color",
            "border-radius",
            "border-top-color",
            "border-top-width",
            "box-shadow",
            "box-sizing",
            "color",
            "display",
            "font-family",
            "gap",
            "padding",
        ]),
    ).toEqual({
        "background-color": "rgb(36, 34, 43)",
        "border-radius": "10px",
        "border-top-color": "rgba(255, 255, 255, 0.13)",
        "border-top-width": "1px",
        "box-shadow": "rgba(0, 0, 0, 0.45) 0px 12px 32px 0px",
        "box-sizing": "border-box",
        color: "rgb(237, 234, 242)",
        display: "flex",
        "font-family": figtreeComputed,
        gap: "8px",
        padding: "8px",
    });
    expect((await card.visibleMetrics()).pixelCount, "card paints").toBeGreaterThan(0);

    /* ---- Search field ---------------------------------------------------- */

    const control = view.$('[data-testid="picker"] [data-happy2-ui="text-field-control"]');
    expect(control.bounds().height, "search height").toBe(28);
    /* Full-width search spans the 288px content lane. */
    expect(control.bounds().width, "search width").toBe(288);
    const input = view.$('[data-testid="picker"] [data-happy2-ui="text-field-input"]')
        .element as HTMLInputElement;
    expect(input.type).toBe("search");
    expect(input.value).toBe("");
    expect(input.placeholder).toBe("Search emoji");
    const searchIcon = view.$('[data-testid="picker"] [data-happy2-ui="text-field-icon"] svg');
    expect(searchIcon.bounds().width, "search icon box").toBe(14);
    expect(searchIcon.bounds().height, "search icon box").toBe(14);

    /* ---- Grid of fixed equal slots --------------------------------------- */

    const grid = view.$('[data-testid="picker"] [data-happy2-ui="emoji-picker-grid"]');
    expect(grid.computedStyle("display")).toBe("grid");
    /* repeat(8, 36px) resolves to eight explicit 36px tracks. */
    expect(grid.computedStyle("grid-template-columns")).toBe(
        "36px 36px 36px 36px 36px 36px 36px 36px",
    );
    const gridBounds = grid.bounds();
    expect(gridBounds.width, "grid width").toBe(288);
    /* 3 rows of 36px, no row gaps. */
    expect(gridBounds.height, "grid height").toBe(108);

    /* Every cell is an identical 36px slot on a perfectly regular 8-column
     * lattice: cell i sits at column (i % 8), row floor(i / 8). */
    emoji.forEach((item, index) => {
        const cell = view.$(
            `[data-testid="picker"] [data-happy2-ui="emoji-picker-grid"] [data-emoji-id="${item.id}"]`,
        );
        const b = cell.bounds();
        expect(b.width, `${item.id} cell width`).toBe(36);
        expect(b.height, `${item.id} cell height`).toBe(36);
        expect(b.x - gridBounds.x, `${item.id} cell col`).toBe((index % 8) * 36);
        expect(b.y - gridBounds.y, `${item.id} cell row`).toBe(Math.floor(index / 8) * 36);
    });

    /* ---- Art slot parity: identical geometry, unicode vs image ----------- */

    for (const item of emoji) {
        const cell = `[data-testid="picker"] [data-happy2-ui="emoji-picker-grid"] [data-emoji-id="${item.id}"]`;
        const art = view.$(`${cell} [data-happy2-ui="emoji-picker-art"]`);
        expect(art.bounds().width, `${item.id} art width`).toBe(24);
        expect(art.bounds().height, `${item.id} art height`).toBe(24);
        /* 24px slot centered in the 36px cell → 6px clear on every edge. This
         * is what makes the custom-image slot and the unicode slot identical. */
        expect(art.offsets(), `${item.id} art centering`).toEqual({
            top: 6,
            right: 6,
            bottom: 6,
            left: 6,
        });
        if (item.imageUrl === undefined) {
            expect(art.computedStyle("font-family"), `${item.id} emoji font`).toContain(
                "Apple Color Emoji",
            );
        }
    }

    /* Custom-image cells: the <img> fills the 24px art slot with contain. */
    for (const id of ["relay", "mint"]) {
        const image = view.$(
            `[data-testid="picker"] [data-happy2-ui="emoji-picker-grid"] [data-emoji-id="${id}"] [data-happy2-ui="emoji-picker-image"]`,
        );
        expect(image.bounds().width, `${id} image box`).toBe(24);
        expect(image.bounds().height, `${id} image box`).toBe(24);
        expect(image.computedStyles(["display", "object-fit"]), `${id} image fit`).toEqual({
            display: "block",
            "object-fit": "contain",
        });
    }

    /* ---- Per-emoji ink: visible, unclipped, acceptably centered ---------- */

    /* The engine-scoped emoji correction resolves on this engine and nowhere
     * else (guards the @supports scopes, like Button's label-y). */
    const probeGlyph = view.$(
        '[data-testid="picker"] [data-happy2-ui="emoji-picker-grid"] [data-emoji-id="thumbsup"] [data-happy2-ui="emoji-picker-glyph"]',
    );
    expect(probeGlyph.computedStyle("--happy2-emoji-x"), "emoji-x correction").toBe(
        emojiCorrection[engine].x,
    );
    expect(probeGlyph.computedStyle("--happy2-emoji-y"), "emoji-y correction").toBe(
        emojiCorrection[engine].y,
    );

    for (const id of inkSubset) {
        const item = emoji.find((entry) => entry.id === id)!;
        const cell = `[data-testid="picker"] [data-happy2-ui="emoji-picker-grid"] [data-emoji-id="${id}"]`;
        const ink = await emojiInk(view, cell, item.imageUrl ? "image" : "glyph");
        /* Unclipped: painted ink stays within the 24px slot (±0.5 for AA). */
        expect(ink.inkLeft, `${id} unclipped left`).toBeGreaterThanOrEqual(-0.5);
        expect(ink.inkTop, `${id} unclipped top`).toBeGreaterThanOrEqual(-0.5);
        expect(ink.inkRight, `${id} unclipped right`).toBeLessThanOrEqual(24.5);
        expect(ink.inkBottom, `${id} unclipped bottom`).toBeLessThanOrEqual(24.5);
        /* System color-emoji artwork has content-dependent mass, so we compare
         * each glyph's full visible bounds with its own slot center (12, 12)
         * rather than forcing an alpha centroid; contract ceiling 0.75px. After
         * the per-engine correction the residual is well under this. */
        expect(Math.abs(ink.centerX - 12), `${id} bounds x`).toBeLessThanOrEqual(0.75);
        expect(Math.abs(ink.centerY - 12), `${id} bounds y`).toBeLessThanOrEqual(0.75);
    }

    /* ---- Interaction ----------------------------------------------------- */

    (
        view.$(
            '[data-testid="picker"] [data-happy2-ui="emoji-picker-grid"] [data-emoji-id="thumbsup"]',
        ).element as HTMLButtonElement
    ).click();
    (
        view.$(
            '[data-testid="picker"] [data-happy2-ui="emoji-picker-grid"] [data-emoji-id="relay"]',
        ).element as HTMLButtonElement
    ).click();
    expect(selected).toEqual(["thumbsup", "relay"]);

    await view.screenshot("EmojiPicker.test");
}, 120_000);

it("holds EmojiPicker recent sections, searching, empty state, and query events", async () => {
    const selected: string[] = [];
    const queries: string[] = [];
    const view = createRenderer();

    view.render(
        () => (
            <EmojiPicker
                data-testid="recent"
                emoji={emoji}
                onSelect={(id) => selected.push(id)}
                recent={["thumbsup", "tada", "rocket", "fire", "heart", "relay"]}
            />
        ),
        { width: 360, height: 300, padding: 16 },
    );
    view.render(
        () => (
            <EmojiPicker
                data-testid="searching"
                emoji={emoji.filter((item) => ["fire", "sparkles"].includes(item.id))}
                onQueryChange={(value) => queries.push(value)}
                query="fire"
                recent={["thumbsup", "tada"]}
            />
        ),
        { width: 360, height: 140, padding: 16 },
    );
    view.render(() => <EmojiPicker data-testid="empty" emoji={[]} query="zzzz" />, {
        width: 360,
        height: 120,
        padding: 16,
    });
    await view.ready();

    /* ---- Recent + all sections ------------------------------------------- */

    const recent = view.$('[data-testid="recent"]');
    /* search 28 + 8 + (recent label 20 + 8 + 1 row 36) + 8 + (all label 20 + 8
     * + 3 rows 108) + 16 padding + 2 border = 262. */
    expect(recent.bounds().width, "recent card width").toBe(306);
    expect(recent.bounds().height, "recent card height").toBe(262);

    const recentLabel = view.$(
        '[data-testid="recent"] [data-happy2-ui="emoji-picker-recent-label"]',
    );
    expect(recentLabel.element.textContent).toBe("Recently used");
    expect(recentLabel.bounds().height, "recent label height").toBe(20);
    expect(recentLabel.textMetrics().font, "recent label font").toMatchObject({
        family: MONO,
        size: 11,
        weight: "700",
    });
    expect(recentLabel.computedStyles(["color", "text-transform"]), "recent label style").toEqual({
        color: "rgb(85, 81, 95)",
        "text-transform": "uppercase",
    });

    const allLabel = view.$('[data-testid="recent"] [data-happy2-ui="emoji-picker-all-label"]');
    expect(allLabel.element.textContent).toBe("All emoji");

    const recentGrid = view.$('[data-testid="recent"] [data-happy2-ui="emoji-picker-recent-grid"]');
    const recentCells = recentGrid.element.querySelectorAll('[data-happy2-ui="emoji-picker-cell"]');
    expect(recentCells.length, "recent cell count").toBe(6);
    /* Recent slots reuse the exact grid geometry (36px, 8-column lattice). */
    ["thumbsup", "tada", "rocket", "fire", "heart", "relay"].forEach((id, index) => {
        const cell = view.$(
            `[data-testid="recent"] [data-happy2-ui="emoji-picker-recent-grid"] [data-emoji-id="${id}"]`,
        );
        expect(cell.bounds().width, `${id} recent cell width`).toBe(36);
        expect(cell.bounds().height, `${id} recent cell height`).toBe(36);
        expect(cell.bounds().x - recentGrid.bounds().x, `${id} recent col`).toBe(index * 36);
        expect(cell.bounds().y - recentGrid.bounds().y, `${id} recent row`).toBe(0);
    });
    const allGrid = view.$('[data-testid="recent"] [data-happy2-ui="emoji-picker-grid"]');
    expect(
        allGrid.element.querySelectorAll('[data-happy2-ui="emoji-picker-cell"]').length,
        "all cell count",
    ).toBe(24);

    /* A recent emoji click reports its id. */
    (
        view.$(
            '[data-testid="recent"] [data-happy2-ui="emoji-picker-recent-grid"] [data-emoji-id="fire"]',
        ).element as HTMLButtonElement
    ).click();
    expect(selected).toEqual(["fire"]);

    /* ---- Searching hides the recent section ------------------------------ */

    const searching = view.$('[data-testid="searching"]');
    expect(
        searching.element.querySelector('[data-happy2-ui="emoji-picker-recent-section"]'),
        "recent hidden while searching",
    ).toBeNull();
    expect(
        searching.element.querySelector('[data-happy2-ui="emoji-picker-all-label"]'),
        "no all-label without a recent row",
    ).toBeNull();
    const searchInput = view.$('[data-testid="searching"] [data-happy2-ui="text-field-input"]')
        .element as HTMLInputElement;
    expect(searchInput.value, "query drives the field").toBe("fire");
    expect(
        view
            .$('[data-testid="searching"] [data-happy2-ui="emoji-picker-grid"]')
            .element.querySelectorAll('[data-happy2-ui="emoji-picker-cell"]').length,
        "filtered result count",
    ).toBe(2);

    /* Typing reports through onQueryChange. */
    searchInput.value = "fireworks";
    searchInput.dispatchEvent(new Event("input", { bubbles: true }));
    expect(queries).toEqual(["fireworks"]);

    /* ---- Empty state ----------------------------------------------------- */

    const empty = view.$('[data-testid="empty"]');
    expect(
        empty.element.querySelector('[data-happy2-ui="emoji-picker-grid"]'),
        "no grid when empty",
    ).toBeNull();
    const emptyMsg = view.$('[data-testid="empty"] [data-happy2-ui="emoji-picker-empty"]');
    expect(emptyMsg.element.textContent).toBe("No emoji found");
    expect(emptyMsg.computedStyle("color"), "empty muted color").toBe("rgb(117, 112, 133)");
    expect((await emptyMsg.visibleMetrics()).pixelCount, "empty text paints").toBeGreaterThan(0);

    await view.screenshot("EmojiPicker.variants.test");
}, 120_000);
