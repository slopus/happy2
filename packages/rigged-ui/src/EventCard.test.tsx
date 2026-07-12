import "./styles.css";
import { expect, it } from "vitest";
import { EventCard } from "./EventCard";
import { createRenderer, type RenderedElement } from "./testing";

/*
 * Optical assertions measure the alpha-weighted ink centroid (color-blind,
 * background-subtracted) of every text-or-glyph part against the 44px row
 * center. Word labels (titles, from/to states) carry inherently asymmetric
 * ink — descender mass follows the specific characters — so those assert the
 * vertical centroid and deterministic line-box symmetry; each such case is
 * commented at the assertion site. Engine corrections in event-card.css were
 * measured at true 2x in all three engines; residual drift for every asserted
 * part is <=0.42px, so TOL holds real margin.
 */

const TOL = 0.75;
/* Icons are centered by path data and rasterize deterministically; hold them
 * to the tighter budget (measured |drift| <= 0.2px in every engine). */
const ICON_TOL = 0.4;

/* Ink centroid of `part`, in `box`-relative CSS px; every measured part must
 * paint (pixelCount > 0) so a clipped or blank capture can never pass. */
async function ink(part: RenderedElement<Element>, box: RenderedElement<Element>, name: string) {
    const vis = await part.visibleMetrics();
    expect(vis.pixelCount, `${name} pixelCount`).toBeGreaterThan(0);
    const p = part.bounds();
    const b = box.bounds();
    return { x: vis.center.x + p.x - b.x, y: vis.center.y + p.y - b.y };
}

/* Layout-space top offset of `part` inside `box`, with optical translates on
 * `part` and its lane wrapper removed — line-box symmetry is asserted on
 * layout geometry, not on the engine-corrected paint position. */
function layoutTop(part: RenderedElement<Element>, box: RenderedElement<Element>) {
    let translateY = 0;
    let node: Element | null = part.element;
    while (node && node !== box.element) {
        const transform = getComputedStyle(node).transform;
        if (transform.startsWith("matrix(")) {
            translateY += Number.parseFloat(transform.slice(7, -1).split(",")[5] ?? "0");
        }
        node = node.parentElement;
    }
    return part.bounds().y - translateY - box.bounds().y;
}

it("holds EventCard geometry, transition lane, and optical centering", async () => {
    const view = createRenderer();

    let selections = 0;
    view.render(
        () => (
            <EventCard
                data-testid="ev-transition"
                from="In progress"
                icon="tasks"
                meta="MOB-217"
                onSelect={() => {
                    selections += 1;
                }}
                time="1h"
                title="Push notifications drop on cold start"
                to="In review"
            />
        ),
        { width: 712, height: 76, padding: 16 },
    );
    view.render(
        () => (
            <EventCard
                badge={{ label: "MERGED", variant: "success" }}
                data-testid="ev-badge"
                icon="merge"
                time="3h"
                title="fix/auth-flake into main"
            />
        ),
        { width: 712, height: 76, padding: 16 },
    );
    view.render(() => <EventCard data-testid="ev-min" title="Workspace exported" />, {
        width: 712,
        height: 76,
        padding: 16,
    });
    /* No icon chip, side carries a lone mono time: the leanest side layout. */
    view.render(() => <EventCard data-testid="ev-plain" time="12:04" title="Digest sent" />, {
        width: 712,
        height: 76,
        padding: 16,
    });
    view.render(
        () => (
            <EventCard
                data-testid="ev-narrow"
                from="Queued"
                icon="clock"
                time="2m"
                title="Nightly triage sweep across every stale workspace"
                to="Running"
            />
        ),
        { width: 480, height: 76, padding: 16 },
    );
    view.render(
        () => (
            <EventCard data-testid="ev-wide" icon="zap" time="4h" title="Deploy pipeline resumed" />
        ),
        { width: 760, height: 76, padding: 16 },
    );
    await view.ready();

    /* ---- Root row contract ---------------------------------------------- */

    const row = view.$('[data-testid="ev-transition"]');
    expect(row.element.tagName).toBe("BUTTON"); /* clickable rows are buttons */
    expect(row.element.getAttribute("data-clickable")).toBe("");
    expect(row.bounds()).toEqual({ x: 16, y: 16, width: 680, height: 44 });
    expect(
        row.computedStyles([
            "background-color",
            "border-radius",
            "border-top-color",
            "border-top-width",
            "box-sizing",
            "cursor",
            "display",
            "max-width",
            "padding-left",
            "padding-right",
        ]),
    ).toEqual({
        "background-color": "rgb(28, 27, 34)",
        "border-radius": "8px",
        "border-top-color": "rgba(255, 255, 255, 0.07)",
        "border-top-width": "1px",
        "box-sizing": "border-box",
        cursor: "pointer",
        display: "flex",
        "max-width": "680px",
        "padding-left": "12px",
        "padding-right": "12px",
    });

    /* ---- Icon chips: every glyph family member used by the fixtures ------- */

    for (const [id, glyph] of [
        ["ev-transition", "tasks"],
        ["ev-badge", "merge"],
        ["ev-narrow", "clock"],
        ["ev-wide", "zap"],
    ] as const) {
        const chipBox = view.$(`[data-testid="${id}"] [data-rigged-ui="event-card-chip"]`);
        expect(chipBox.bounds().width, `${glyph} chip width`).toBe(24);
        expect(chipBox.bounds().height, `${glyph} chip height`).toBe(24);
        expect(chipBox.offsets().top, `${glyph} chip centered`).toBe(10);
        const chipIcon = view.$(
            `[data-testid="${id}"] [data-rigged-ui="event-card-chip"] [data-rigged-ui="icon"]`,
        );
        expect(chipIcon.element.getAttribute("data-name")).toBe(glyph);
        expect(chipIcon.offsets()).toEqual({ top: 4, right: 4, bottom: 4, left: 4 });
        const glyphInk = await ink(chipIcon, chipBox, `${glyph} chip icon`);
        expect(Math.abs(glyphInk.y - 12), `${glyph} chip icon optical y`).toBeLessThanOrEqual(
            ICON_TOL,
        );
        /* merge's ink is inherently left-heavy (both circles and the elbow
         * hug the left rail of the glyph grid): vertical-only there. */
        if (glyph !== "merge") {
            expect(Math.abs(glyphInk.x - 12), `${glyph} chip icon optical x`).toBeLessThanOrEqual(
                ICON_TOL,
            );
        }
    }
    const chip = view.$('[data-testid="ev-transition"] [data-rigged-ui="event-card-chip"]');
    expect(chip.offsets().left).toBe(13); /* border 1 + pad 12 */
    expect(chip.computedStyles(["background-color", "border-radius", "color"])).toEqual({
        "background-color": "rgba(255, 255, 255, 0.05)",
        "border-radius": "6px",
        color: "rgb(117, 112, 133)",
    });

    /* ---- Title + inline meta ------------------------------------------------ */

    const title = view.$('[data-testid="ev-transition"] [data-rigged-ui="event-card-title"]');
    const titleMetrics = title.textMetrics();
    expect(titleMetrics.font.family).toBe("Rigged Figtree, system-ui, sans-serif");
    expect(titleMetrics.font.size).toBe(13);
    expect(titleMetrics.font.weight).toBe("600");
    expect(titleMetrics.font.lineHeight).toBe(18);
    expect(title.computedStyle("color")).toBe("rgb(237, 234, 242)");
    expect(title.bounds().x - row.bounds().x).toBe(47); /* 13 + chip 24 + gap 10 */
    /* Titles are arbitrary word runs whose descender mass drags the centroid
     * (content-dependent): assert the deterministic line-box symmetry — the
     * 18px line box centered in the 44px row, transform-stripped because the
     * lane carries the engine baseline correction — plus a vertical centroid
     * held to the row center within TOL. */
    expect(layoutTop(title, row)).toBe(13); /* (44 - 18) / 2 */
    const titleInk = await ink(title, row, "title");
    expect(Math.abs(titleInk.y - 22), "title optical y").toBeLessThanOrEqual(TOL);

    const meta = view.$('[data-testid="ev-transition"] [data-rigged-ui="event-card-meta"]');
    expect(meta.textMetrics().font.size).toBe(12);
    expect(meta.computedStyle("color")).toBe("rgb(117, 112, 133)");
    /* Uppercase + digits ticket ref: cap-band ink is symmetric enough for a
     * full vertical centroid check against the row center. */
    const metaInk = await ink(meta, row, "meta");
    expect(Math.abs(metaInk.y - 22), "meta optical y").toBeLessThanOrEqual(TOL);

    /* ---- Transition lane: from → to ---------------------------------------- */

    const from = view.$('[data-testid="ev-transition"] [data-rigged-ui="event-card-from"]');
    const arrow = view.$(
        '[data-testid="ev-transition"] [data-rigged-ui="event-card-transition"] [data-rigged-ui="icon"]',
    );
    const to = view.$('[data-testid="ev-transition"] [data-rigged-ui="event-card-to"]');
    expect(from.textMetrics().text).toBe("In progress");
    expect(from.computedStyles(["color", "font-size", "font-weight"])).toEqual({
        color: "rgb(117, 112, 133)",
        "font-size": "12px",
        "font-weight": "500",
    });
    expect(arrow.bounds().width).toBe(12);
    expect(arrow.bounds().height).toBe(12);
    expect(arrow.computedStyle("color")).toBe("rgb(85, 81, 95)");
    expect(to.textMetrics().text).toBe("In review");
    expect(to.computedStyles(["color", "font-size", "font-weight"])).toEqual({
        color: "rgb(168, 155, 255)",
        "font-size": "12px",
        "font-weight": "600",
    });
    /* from | 6px | arrow | 6px | to on one lane */
    expect(arrow.bounds().x - (from.bounds().x + from.bounds().width)).toBe(6);
    expect(to.bounds().x - (arrow.bounds().x + 12)).toBe(6);
    /* Status words ("In progress" carries p/g descenders): vertical centroid
     * only, aligned with the arrow glyph on the row center. */
    const fromInk = await ink(from, row, "from");
    expect(Math.abs(fromInk.y - 22), "from optical y").toBeLessThanOrEqual(TOL);
    const toInk = await ink(to, row, "to");
    expect(Math.abs(toInk.y - 22), "to optical y").toBeLessThanOrEqual(TOL);
    /* The arrow is a directional glyph (head-heavy to the right by design):
     * vertical centroid only. */
    const arrowInk = await ink(arrow, row, "arrow");
    expect(Math.abs(arrowInk.y - 22), "arrow optical y").toBeLessThanOrEqual(ICON_TOL);

    /* ---- Time, pinned right -------------------------------------------------- */

    const time = view.$('[data-testid="ev-transition"] [data-rigged-ui="event-card-time"]');
    const timeMetrics = time.textMetrics();
    expect(timeMetrics.font.family).toBe("Rigged Mono, ui-monospace, monospace");
    expect(timeMetrics.font.size).toBe(11);
    expect(time.computedStyle("color")).toBe("rgb(117, 112, 133)");
    expect(row.bounds().x + 680 - (time.bounds().x + time.bounds().width)).toBe(13);
    /* Gecko reports the ink-right edge at a subpixel float; 2dp is exact enough. */
    expect(time.bounds().x - (to.bounds().x + to.bounds().width)).toBeCloseTo(8, 2);

    /* Mono digit + unit stamps across all fixtures: vertical centroid on the
     * row center (residual spread, e.g. "2m" vs "3h", is content ink). */
    for (const [id, stamp] of [
        ["ev-transition", "1h"],
        ["ev-badge", "3h"],
        ["ev-plain", "12:04"],
        ["ev-narrow", "2m"],
        ["ev-wide", "4h"],
    ] as const) {
        const rowBox = view.$(`[data-testid="${id}"]`);
        const timeEl = view.$(`[data-testid="${id}"] [data-rigged-ui="event-card-time"]`);
        expect(timeEl.textMetrics().text).toBe(stamp);
        const timeInk = await ink(timeEl, rowBox, `time ${stamp}`);
        expect(Math.abs(timeInk.y - 22), `time ${stamp} optical y`).toBeLessThanOrEqual(TOL);
    }

    (row.element as HTMLButtonElement).click();
    expect(selections).toBe(1);

    /* ---- Badge variant (non-clickable) --------------------------------------- */

    const badgeRow = view.$('[data-testid="ev-badge"]');
    expect(badgeRow.element.tagName).toBe("DIV");
    expect(badgeRow.element.hasAttribute("data-clickable")).toBe(false);
    expect(badgeRow.computedStyle("cursor")).toBe("auto");
    expect(badgeRow.bounds().height).toBe(44);
    const badge = view.$('[data-testid="ev-badge"] [data-rigged-ui="badge"]');
    expect(badge.element.getAttribute("data-variant")).toBe("success");
    expect(badge.bounds().height).toBe(18);
    /* Badge box rides the row center; its ink is Badge's contract. */
    expect(badge.bounds().y - badgeRow.bounds().y).toBe(13); /* (44 - 18) / 2 */
    expect((await badge.visibleMetrics()).pixelCount).toBeGreaterThan(0);
    expect(badge.computedStyles(["background-color", "color"])).toEqual({
        "background-color": "rgba(52, 211, 153, 0.13)",
        color: "rgb(110, 231, 183)",
    });
    expect(
        view.container.querySelector(
            '[data-testid="ev-badge"] [data-rigged-ui="event-card-transition"]',
        ),
    ).toBeNull();

    /* ---- Minimal: title only --------------------------------------------------- */

    const min = view.$('[data-testid="ev-min"]');
    expect(min.bounds().height).toBe(44);
    expect(
        view.container.querySelector('[data-testid="ev-min"] [data-rigged-ui="event-card-chip"]'),
    ).toBeNull();
    expect(
        view.container.querySelector('[data-testid="ev-min"] [data-rigged-ui="event-card-side"]'),
    ).toBeNull();
    const minTitle = view.$('[data-testid="ev-min"] [data-rigged-ui="event-card-title"]');
    expect(minTitle.bounds().x - min.bounds().x).toBe(13); /* no chip: text leads */
    expect(layoutTop(minTitle, min)).toBe(13);
    const minTitleInk = await ink(minTitle, min, "min title");
    expect(Math.abs(minTitleInk.y - 22), "min title optical y").toBeLessThanOrEqual(TOL);

    /* ---- Plain: no chip, lone time in the side --------------------------------- */

    const plain = view.$('[data-testid="ev-plain"]');
    expect(plain.bounds().height).toBe(44);
    expect(
        view.container.querySelector('[data-testid="ev-plain"] [data-rigged-ui="event-card-chip"]'),
    ).toBeNull();
    expect(
        view.container.querySelector(
            '[data-testid="ev-plain"] [data-rigged-ui="event-card-transition"]',
        ),
    ).toBeNull();
    const plainTime = view.$('[data-testid="ev-plain"] [data-rigged-ui="event-card-time"]');
    expect(plain.bounds().x + 680 - (plainTime.bounds().x + plainTime.bounds().width)).toBe(13);
    const plainTitle = view.$('[data-testid="ev-plain"] [data-rigged-ui="event-card-title"]');
    expect(plainTitle.bounds().x - plain.bounds().x).toBe(13);
    expect(layoutTop(plainTitle, plain)).toBe(13);
    expect((await plainTitle.visibleMetrics()).pixelCount).toBeGreaterThan(0);

    /* ---- Fluid + clamped widths -------------------------------------------------- */

    expect(view.$('[data-testid="ev-narrow"]').bounds().width).toBe(448);
    expect(view.$('[data-testid="ev-narrow"]').bounds().height).toBe(44);
    /* Long titles truncate instead of pushing the transition lane out. */
    const narrowTitle = view.$('[data-testid="ev-narrow"] [data-rigged-ui="event-card-title"]');
    expect(narrowTitle.computedStyles(["overflow-x", "text-overflow"])).toEqual({
        "overflow-x": "hidden",
        "text-overflow": "ellipsis",
    });
    const narrowLane = view.$('[data-testid="ev-narrow"] [data-rigged-ui="event-card-transition"]');
    expect((await narrowLane.visibleMetrics()).pixelCount).toBeGreaterThan(0);
    const narrowRow = view.$('[data-testid="ev-narrow"]');
    /* "Queued" / "Running" (Q tail and g descender): vertical centroid only. */
    const narrowFrom = view.$('[data-testid="ev-narrow"] [data-rigged-ui="event-card-from"]');
    const narrowFromInk = await ink(narrowFrom, narrowRow, "narrow from");
    expect(Math.abs(narrowFromInk.y - 22), "narrow from optical y").toBeLessThanOrEqual(TOL);
    const narrowTo = view.$('[data-testid="ev-narrow"] [data-rigged-ui="event-card-to"]');
    const narrowToInk = await ink(narrowTo, narrowRow, "narrow to");
    expect(Math.abs(narrowToInk.y - 22), "narrow to optical y").toBeLessThanOrEqual(TOL);
    expect(view.$('[data-testid="ev-wide"]').bounds().width).toBe(680); /* max-width clamp */

    await view.screenshot("EventCard.test");
});
