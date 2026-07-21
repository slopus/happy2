import { expect, it } from "vitest";
import { server } from "vitest/browser";
import "./theme.css";
import "./styles/icon.css";
import "./styles/avatar.css";
import "./styles/badge.css";
import "./styles/agent-desk.css";
import { AgentDesk, type DeskListItem, type DeskRun } from "./AgentDesk";
import { createRenderer } from "./testing";

type Engine = "chromium" | "firefox" | "webkit";
type View = ReturnType<typeof createRenderer>;

const engine = () => server.browser as Engine;

const uiFamily = () =>
    engine() === "webkit"
        ? "happy2 Figtree, system-ui, sans-serif"
        : '"happy2 Figtree", system-ui, sans-serif';

/*
 * Optical tolerances, measured at 2x with alpha-weighted visible-pixel
 * centroids (see styles/agent-desk.css for the per-engine corrections).
 * Glyph ink is symmetric, so icons hold the tight bound; word ink is
 * vertically asymmetric (descender-free vs descender-heavy strings straddle
 * the tuned midpoint by ~±0.45px), so text holds the 0.75px contract
 * ceiling on the vertical axis only.
 */
const ICON_TOLERANCE = 0.4;
const TEXT_TOLERANCE = 0.75;

/*
 * Alpha-weighted ink centroid of `selector`, offset from its lane center
 * (dy, positive = low; lane center given in the parent's coordinate space)
 * and from its own box center (dx). Refuses blank captures so a clipped or
 * unpainted part can never pass.
 */
async function ink(view: View, selector: string, laneCenterY: number) {
    const el = view.$(selector);
    const vis = await el.visibleMetrics();
    expect(vis.pixelCount, `${selector} paints no pixels`).toBeGreaterThan(0);
    return {
        bounds: vis.bounds,
        dx: vis.center.x - el.width() / 2,
        dy: el.offsets().top + vis.center.y - laneCenterY,
    };
}

const RUNNING: DeskRun[] = [
    {
        agent: "Codex",
        detail: "iPhone 15 ✓ · Pixel 9 ✓ · iPhone SE running…",
        eta: "4m left",
        id: "run-device",
        initials: "CX",
        progress: 62,
        title: "Device farm run",
        tone: "mint",
    },
    {
        agent: "Claude",
        eta: "writing",
        id: "run-notes",
        initials: "CL",
        progress: 34,
        title: "Release notes draft",
        tone: "ember",
    },
];

const QUEUED: DeskListItem[] = [
    { id: "q-triage", meta: "Fri 9:00", title: "Weekly triage sweep" },
    { icon: "branch", id: "q-backport", meta: "after review", title: "Backport fix to v2.2" },
];

const DONE: DeskListItem[] = [
    { id: "d-eng479", meta: "merged", title: "ENG-479 rate limiter fix" },
    { id: "d-sup88", meta: "posted", title: "SUP-88 triage summary" },
];

it("holds AgentDesk geometry, colors, and typography in the 340px shell panel", async () => {
    const selected: string[] = [];
    const view = createRenderer().render(
        () => (
            <div style={{ width: "340px", height: "620px", background: "#f5f5f5" }}>
                <AgentDesk
                    data-testid="desk"
                    done={DONE}
                    onItemSelect={(id) => selected.push(id)}
                    queued={QUEUED}
                    running={RUNNING}
                />
            </div>
        ),
        { width: 340, height: 620 },
    );
    await view.ready();

    // Root fills the panel as a flex column.
    const desk = view.$('[data-testid="desk"]');
    expect(desk.bounds()).toEqual({ x: 0, y: 0, width: 340, height: 620 });
    expect(
        desk.computedStyles([
            "box-sizing",
            "color",
            "display",
            "flex-direction",
            "font-family",
            "overflow-x",
            "overflow-y",
        ]),
    ).toEqual({
        "box-sizing": "border-box",
        color: "rgb(0, 0, 0)",
        display: "flex",
        "flex-direction": "column",
        "font-family": uiFamily(),
        "overflow-x": "hidden",
        "overflow-y": "hidden",
    });

    // Header: 48px, 14px x-padding, bottom hairline.
    const header = view.$('[data-happy2-ui="agent-desk-header"]');
    expect(header.bounds()).toEqual({ x: 0, y: 0, width: 340, height: 48 });
    expect(
        header.computedStyles([
            "border-bottom-color",
            "border-bottom-style",
            "border-bottom-width",
            "padding-left",
            "padding-right",
        ]),
    ).toEqual({
        "border-bottom-color": "rgb(234, 234, 234)",
        "border-bottom-style": "solid",
        "border-bottom-width": "1px",
        "padding-left": "14px",
        "padding-right": "14px",
    });

    // Spark icon: accent color, ink optically centered in the 47px lane.
    const spark = view.$(".happy2-agent-desk__spark");
    expect(spark.computedStyle("color")).toBe("rgb(43, 172, 204)");
    const sparkInk = await ink(view, ".happy2-agent-desk__spark", 23.5);
    expect(Math.abs(sparkInk.dy)).toBeLessThanOrEqual(ICON_TOLERANCE);
    expect(Math.abs(sparkInk.dx)).toBeLessThanOrEqual(ICON_TOLERANCE);

    // Title: 13/800 ui, sits after the 16px spark + 8px gap. Word ink is
    // horizontally asymmetric and left-aligned by design, so only the
    // vertical centroid is asserted.
    const title = view.$('[data-happy2-ui="agent-desk-title"]');
    const titleMetrics = title.textMetrics();
    expect(titleMetrics.text).toBe("Agent desk");
    expect(titleMetrics.bounds.x).toBe(38);
    expect(titleMetrics.font).toEqual({
        family: "happy2 Figtree, system-ui, sans-serif",
        letterSpacing: 0,
        lineHeight: 16,
        size: 13,
        weight: "800",
    });
    const titleInk = await ink(view, '[data-happy2-ui="agent-desk-title"]', 23.5);
    expect(Math.abs(titleInk.dy)).toBeLessThanOrEqual(TEXT_TOLERANCE);

    // Count badge: accent pill flush to the right padding edge, pill ink
    // centered in the header lane.
    const count = view.$(".happy2-agent-desk__count");
    expect(count.element.textContent).toBe("2 RUNNING");
    expect(count.height()).toBe(18);
    // Badge width can be fractional (its own letter-spacing compensation).
    expect(Math.abs(count.offsets().right - 14)).toBeLessThanOrEqual(0.1);
    expect(count.computedStyles(["background-color", "color"])).toEqual({
        "background-color": "rgb(198, 198, 200)",
        color: "rgb(43, 172, 204)",
    });
    const badgeInk = await ink(view, ".happy2-agent-desk__count", 23.5);
    expect(Math.abs(badgeInk.dy)).toBeLessThanOrEqual(TEXT_TOLERANCE);

    // Body: scroll container below the header.
    const body = view.$('[data-happy2-ui="agent-desk-body"]');
    expect(body.bounds()).toEqual({ x: 0, y: 48, width: 340, height: 572 });
    /* Scrollport edge-to-edge; the inner content wrapper owns gap + inset. */
    expect(
        body.computedStyles([
            "overflow-y",
            "padding-bottom",
            "padding-left",
            "padding-right",
            "padding-top",
        ]),
    ).toEqual({
        "overflow-y": "auto",
        "padding-bottom": "0px",
        "padding-left": "0px",
        "padding-right": "0px",
        "padding-top": "0px",
    });
    expect(
        view
            .$('[data-happy2-ui="agent-desk-body-content"]')
            .computedStyles(["padding-bottom", "padding-left", "padding-right", "padding-top"]),
    ).toEqual({
        "padding-bottom": "16px",
        "padding-left": "14px",
        "padding-right": "14px",
        "padding-top": "12px",
    });

    // Running tiles: raised surface, radius 10, padding 12.
    const tileOne = view.$(".happy2-agent-desk__run:nth-of-type(1)");
    const tileTwo = view.$(".happy2-agent-desk__run:nth-of-type(2)");
    expect(tileOne.bounds()).toEqual({ x: 14, y: 60, width: 312, height: 79 });
    expect(tileTwo.bounds()).toEqual({ x: 14, y: 147, width: 312, height: 55 });
    expect(tileOne.computedStyles(["background-color", "border-radius", "padding-top"])).toEqual({
        "background-color": "rgb(240, 240, 242)",
        "border-radius": "10px",
        "padding-top": "12px",
    });

    // Tile head: xs agent avatar, 13/700 title, mono eta at the right edge.
    expect(
        view.$('.happy2-agent-desk__run:nth-of-type(1) [data-happy2-ui="avatar"]').bounds(),
    ).toEqual({ x: 26, y: 72, width: 20, height: 20 });
    const runTitle = view.$(
        '.happy2-agent-desk__run:nth-of-type(1) [data-happy2-ui="agent-desk-run-title"]',
    );
    expect(runTitle.textMetrics().text).toBe("Device farm run");
    expect(runTitle.textMetrics().font).toEqual({
        family: "happy2 Figtree, system-ui, sans-serif",
        letterSpacing: 0,
        lineHeight: 16,
        size: 13,
        weight: "700",
    });
    const eta = view.$(
        '.happy2-agent-desk__run:nth-of-type(1) [data-happy2-ui="agent-desk-run-eta"]',
    );
    const etaBounds = eta.bounds();
    expect(etaBounds.x + etaBounds.width).toBe(314);
    expect(eta.computedStyle("color")).toBe("rgb(142, 142, 147)");
    expect(eta.textMetrics().font).toEqual({
        family: "happy2 Mono, ui-monospace, monospace",
        letterSpacing: 0,
        lineHeight: 14,
        size: 11,
        weight: "500",
    });

    // Title and eta ink centroids sit on the 20px head lane center.
    const headSelector = '.happy2-agent-desk__run:nth-of-type(1) [data-happy2-ui="%"]';
    const runTitleInk = await ink(view, headSelector.replace("%", "agent-desk-run-title"), 10);
    expect(Math.abs(runTitleInk.dy)).toBeLessThanOrEqual(TEXT_TOLERANCE);
    const etaInk = await ink(view, headSelector.replace("%", "agent-desk-run-eta"), 10);
    expect(Math.abs(etaInk.dy)).toBeLessThanOrEqual(TEXT_TOLERANCE);

    // Detail line: 12/16 muted, single truncating line.
    const detail = view.$('[data-happy2-ui="agent-desk-run-detail"]');
    expect(
        detail.computedStyles([
            "color",
            "font-size",
            "line-height",
            "text-overflow",
            "white-space",
        ]),
    ).toEqual({
        color: "rgb(142, 142, 147)",
        "font-size": "12px",
        "line-height": "16px",
        "text-overflow": "ellipsis",
        "white-space": "nowrap",
    });

    // Progress: 3px inset track with a brand-gradient fill at progress%.
    const track = view.$(
        '.happy2-agent-desk__run:nth-of-type(1) [data-happy2-ui="agent-desk-run-track"]',
    );
    expect(track.bounds()).toEqual({ x: 26, y: 124, width: 288, height: 3 });
    expect(track.computedStyles(["background-color", "border-radius", "overflow-y"])).toEqual({
        "background-color": "rgb(242, 242, 247)",
        "border-radius": "999px",
        "overflow-y": "hidden",
    });
    expect(track.element.getAttribute("aria-valuenow")).toBe("62");
    const fill = view.$(
        '.happy2-agent-desk__run:nth-of-type(1) [data-happy2-ui="agent-desk-run-fill"]',
    );
    expect(fill.height()).toBe(3);
    expect(Math.abs(fill.width() - 288 * 0.62)).toBeLessThanOrEqual(0.1);
    expect(fill.computedStyle("background-color")).toBe("rgb(43, 172, 204)");

    // Section labels: 24px rows, 11px mono uppercase faint. Bottom-anchored
    // by design, so the painted baseline anchor is asserted instead of a
    // centroid: ink caps start 13.5px into the box and the ink bottom lands
    // at 24px for QUEUED (the Q tail descends to the box edge) and 22.5px
    // for DONE TODAY (baseline + antialiasing) in every engine.
    const queuedLabel = view.$('[data-section="queued"]');
    expect(queuedLabel.bounds()).toEqual({ x: 14, y: 214, width: 312, height: 24 });
    expect(
        queuedLabel.computedStyles([
            "color",
            "font-size",
            "font-weight",
            "letter-spacing",
            "text-transform",
        ]),
    ).toEqual({
        color: "rgb(142, 142, 147)",
        "font-size": "11px",
        "font-weight": "700",
        "letter-spacing": "0.88px",
        "text-transform": "uppercase",
    });
    const queuedLabelInk = await ink(view, '[data-section="queued"]', 12);
    expect(Math.abs(queuedLabelInk.bounds.y - 13.5)).toBeLessThanOrEqual(TEXT_TOLERANCE);
    expect(
        Math.abs(queuedLabelInk.bounds.y + queuedLabelInk.bounds.height - 24),
    ).toBeLessThanOrEqual(TEXT_TOLERANCE);
    expect(view.$('[data-section="done"]').bounds()).toEqual({
        x: 14,
        y: 338,
        width: 312,
        height: 24,
    });
    const doneLabelInk = await ink(view, '[data-section="done"]', 12);
    expect(Math.abs(doneLabelInk.bounds.y - 13.5)).toBeLessThanOrEqual(TEXT_TOLERANCE);
    expect(Math.abs(doneLabelInk.bounds.y + doneLabelInk.bounds.height - 22.5)).toBeLessThanOrEqual(
        TEXT_TOLERANCE,
    );

    // Queued rows: 36px dashed hairline buttons with a leading clock icon.
    const queuedRows = desk.element.querySelectorAll('[data-happy2-ui="agent-desk-queued"]');
    expect(queuedRows.length).toBe(2);
    const queuedOne = view.$('[data-happy2-ui="agent-desk-queued"]');
    expect(queuedOne.bounds()).toEqual({ x: 14, y: 246, width: 312, height: 36 });
    expect(
        queuedOne.computedStyles([
            "background-color",
            "border-radius",
            "border-top-color",
            "border-top-style",
            "border-top-width",
            "cursor",
        ]),
    ).toEqual({
        "background-color": "rgba(0, 0, 0, 0)",
        "border-radius": "8px",
        "border-top-color": "rgb(209, 209, 214)",
        "border-top-style": "dashed",
        "border-top-width": "1px",
        cursor: "pointer",
    });
    const clockSelector = '[data-happy2-ui="agent-desk-queued"] .happy2-agent-desk__row-icon';
    expect(view.$(clockSelector).computedStyle("color")).toBe("rgb(142, 142, 147)");
    const clockInk = await ink(view, clockSelector, 18);
    expect(Math.abs(clockInk.dy)).toBeLessThanOrEqual(ICON_TOLERANCE);
    expect(Math.abs(clockInk.dx)).toBeLessThanOrEqual(ICON_TOLERANCE);
    const queuedTitle = view.$(
        '[data-happy2-ui="agent-desk-queued"] [data-happy2-ui="agent-desk-row-title"]',
    );
    expect(queuedTitle.computedStyle("color")).toBe("rgb(142, 142, 147)");
    expect(queuedTitle.textMetrics().font).toEqual({
        family: "happy2 Figtree, system-ui, sans-serif",
        letterSpacing: 0,
        lineHeight: 16,
        size: 12,
        weight: "500",
    });
    const queuedTitleInk = await ink(
        view,
        '[data-happy2-ui="agent-desk-queued"] [data-happy2-ui="agent-desk-row-title"]',
        18,
    );
    expect(Math.abs(queuedTitleInk.dy)).toBeLessThanOrEqual(TEXT_TOLERANCE);
    const queuedMeta = view.$(
        '[data-happy2-ui="agent-desk-queued"] [data-happy2-ui="agent-desk-row-meta"]',
    );
    expect(queuedMeta.computedStyle("color")).toBe("rgb(142, 142, 147)");
    expect(queuedMeta.textMetrics().font).toEqual({
        family: "happy2 Mono, ui-monospace, monospace",
        letterSpacing: 0,
        lineHeight: 14,
        size: 11,
        weight: "500",
    });
    const queuedMetaInk = await ink(
        view,
        '[data-happy2-ui="agent-desk-queued"] [data-happy2-ui="agent-desk-row-meta"]',
        18,
    );
    expect(Math.abs(queuedMetaInk.dy)).toBeLessThanOrEqual(TEXT_TOLERANCE);

    // Done rows: 32px quiet wash, mint check, no strike-through.
    const doneOne = view.$('[data-happy2-ui="agent-desk-done"]');
    expect(doneOne.bounds()).toEqual({ x: 14, y: 370, width: 312, height: 32 });
    expect(
        doneOne.computedStyles(["background-color", "border-radius", "border-top-width"]),
    ).toEqual({
        "background-color": "rgba(0, 0, 0, 0.08)",
        "border-radius": "8px",
        "border-top-width": "0px",
    });
    const checkSelector = '[data-happy2-ui="agent-desk-done"] .happy2-agent-desk__row-icon';
    expect(view.$(checkSelector).computedStyle("color")).toBe("rgb(52, 199, 89)");
    const checkInk = await ink(view, checkSelector, 16);
    expect(Math.abs(checkInk.dy)).toBeLessThanOrEqual(ICON_TOLERANCE);
    expect(Math.abs(checkInk.dx)).toBeLessThanOrEqual(ICON_TOLERANCE);
    const doneTitle = view.$(
        '[data-happy2-ui="agent-desk-done"] [data-happy2-ui="agent-desk-row-title"]',
    );
    expect(doneTitle.computedStyles(["color", "font-size", "text-decoration-line"])).toEqual({
        color: "rgb(142, 142, 147)",
        "font-size": "12px",
        "text-decoration-line": "none",
    });
    const doneTitleInk = await ink(
        view,
        '[data-happy2-ui="agent-desk-done"] [data-happy2-ui="agent-desk-row-title"]',
        16,
    );
    expect(Math.abs(doneTitleInk.dy)).toBeLessThanOrEqual(TEXT_TOLERANCE);
    const doneMetaInk = await ink(
        view,
        '[data-happy2-ui="agent-desk-done"] [data-happy2-ui="agent-desk-row-meta"]',
        16,
    );
    expect(Math.abs(doneMetaInk.dy)).toBeLessThanOrEqual(TEXT_TOLERANCE);

    // The per-engine optical corrections resolve on the right engine and
    // nowhere else (see styles/agent-desk.css).
    const runTitlePart = view.$('[data-happy2-ui="agent-desk-run-title"]');
    const rowTitlePart = view.$('[data-happy2-ui="agent-desk-row-title"]');
    if (engine() === "chromium") {
        expect(runTitlePart.computedStyle("margin-top")).toBe("0px");
        expect(runTitlePart.computedStyle("translate")).toContain("-0.5px");
    } else if (engine() === "firefox") {
        expect(runTitlePart.computedStyle("margin-top")).toBe("-1px");
        expect(runTitlePart.computedStyle("translate")).toBe("none");
        expect(rowTitlePart.computedStyle("margin-top")).toBe("-1px");
    } else {
        expect(runTitlePart.computedStyle("margin-top")).toBe("-1px");
        expect(rowTitlePart.computedStyle("margin-top")).toBe("-0.5px");
    }

    // Rows are real buttons and report their ids through onItemSelect.
    expect(queuedOne.element.tagName).toBe("BUTTON");
    expect(doneOne.element.tagName).toBe("BUTTON");
    (queuedOne.element as HTMLElement).click();
    const doneRows = desk.element.querySelectorAll<HTMLElement>(
        '[data-happy2-ui="agent-desk-done"]',
    );
    doneRows[1]!.click();
    expect(selected).toEqual(["q-triage", "d-sup88"]);

    await view.screenshot("AgentDesk.test");
});

// Descender-free strings: ink bottom == painted baseline, centroid high.
const RUN_FLAT: DeskRun[] = [
    {
        agent: "Codex",
        eta: "4m left",
        id: "p-run",
        initials: "CX",
        progress: 62,
        title: "Device farm run",
        tone: "mint",
    },
];
// Descender-heavy strings: centroid pulled low.
const RUN_DESC: DeskRun[] = [
    {
        agent: "Claude",
        eta: "syncing",
        id: "p-run-d",
        initials: "CL",
        progress: 34,
        title: "Deploy pipeline judge",
        tone: "ember",
    },
];
const QUEUED_FLAT: DeskListItem[] = [{ id: "q1", meta: "Fri 9:00", title: "Weekly triage sweep" }];
const QUEUED_DESC: DeskListItem[] = [{ id: "q2", meta: "pending", title: "Backport gnarly patch" }];
const DONE_FLAT: DeskListItem[] = [{ id: "d1", meta: "merged", title: "ENG-479 rate limiter fix" }];
const DONE_DESC: DeskListItem[] = [{ id: "d2", meta: "posted", title: "Bumpy triage judgement" }];

/*
 * Asserts every text and glyph part of one rendered desk against its lane
 * center. Word ink is horizontally asymmetric by nature (and the rows are
 * left-aligned by design), so text asserts the vertical centroid only;
 * symmetric glyph ink asserts both axes at the tight tolerance.
 */
async function expectDeskCentered(view: View, testId: string) {
    const p = `[data-testid="${testId}"]`;

    const spark = await ink(view, `${p} .happy2-agent-desk__spark`, 23.5);
    expect(Math.abs(spark.dy), `${testId} spark dy`).toBeLessThanOrEqual(ICON_TOLERANCE);
    expect(Math.abs(spark.dx), `${testId} spark dx`).toBeLessThanOrEqual(ICON_TOLERANCE);
    const headerTitle = await ink(view, `${p} [data-happy2-ui="agent-desk-title"]`, 23.5);
    expect(Math.abs(headerTitle.dy), `${testId} header title dy`).toBeLessThanOrEqual(
        TEXT_TOLERANCE,
    );
    const badge = await ink(view, `${p} .happy2-agent-desk__count`, 23.5);
    expect(Math.abs(badge.dy), `${testId} badge dy`).toBeLessThanOrEqual(TEXT_TOLERANCE);

    const runTitle = await ink(view, `${p} [data-happy2-ui="agent-desk-run-title"]`, 10);
    expect(Math.abs(runTitle.dy), `${testId} run title dy`).toBeLessThanOrEqual(TEXT_TOLERANCE);
    const runEta = await ink(view, `${p} [data-happy2-ui="agent-desk-run-eta"]`, 10);
    expect(Math.abs(runEta.dy), `${testId} run eta dy`).toBeLessThanOrEqual(TEXT_TOLERANCE);

    const clock = await ink(
        view,
        `${p} [data-happy2-ui="agent-desk-queued"] .happy2-agent-desk__row-icon`,
        18,
    );
    expect(Math.abs(clock.dy), `${testId} clock dy`).toBeLessThanOrEqual(ICON_TOLERANCE);
    expect(Math.abs(clock.dx), `${testId} clock dx`).toBeLessThanOrEqual(ICON_TOLERANCE);
    const queuedTitle = await ink(
        view,
        `${p} [data-happy2-ui="agent-desk-queued"] [data-happy2-ui="agent-desk-row-title"]`,
        18,
    );
    expect(Math.abs(queuedTitle.dy), `${testId} queued title dy`).toBeLessThanOrEqual(
        TEXT_TOLERANCE,
    );
    const queuedMeta = await ink(
        view,
        `${p} [data-happy2-ui="agent-desk-queued"] [data-happy2-ui="agent-desk-row-meta"]`,
        18,
    );
    expect(Math.abs(queuedMeta.dy), `${testId} queued meta dy`).toBeLessThanOrEqual(TEXT_TOLERANCE);

    const check = await ink(
        view,
        `${p} [data-happy2-ui="agent-desk-done"] .happy2-agent-desk__row-icon`,
        16,
    );
    expect(Math.abs(check.dy), `${testId} check dy`).toBeLessThanOrEqual(ICON_TOLERANCE);
    expect(Math.abs(check.dx), `${testId} check dx`).toBeLessThanOrEqual(ICON_TOLERANCE);
    const doneTitle = await ink(
        view,
        `${p} [data-happy2-ui="agent-desk-done"] [data-happy2-ui="agent-desk-row-title"]`,
        16,
    );
    expect(Math.abs(doneTitle.dy), `${testId} done title dy`).toBeLessThanOrEqual(TEXT_TOLERANCE);
    const doneMeta = await ink(
        view,
        `${p} [data-happy2-ui="agent-desk-done"] [data-happy2-ui="agent-desk-row-meta"]`,
        16,
    );
    expect(Math.abs(doneMeta.dy), `${testId} done meta dy`).toBeLessThanOrEqual(TEXT_TOLERANCE);
}

it("keeps ink optically centered for descender-free and descender-heavy content", async () => {
    const view = createRenderer()
        .render(
            () => (
                <AgentDesk
                    data-testid="flat"
                    done={DONE_FLAT}
                    queued={QUEUED_FLAT}
                    running={RUN_FLAT}
                    title="Agent desk"
                />
            ),
            { width: 340, height: 320 },
        )
        .render(
            () => (
                <AgentDesk
                    data-testid="desc"
                    done={DONE_DESC}
                    queued={QUEUED_DESC}
                    running={RUN_DESC}
                    title="Type gauge"
                />
            ),
            { width: 340, height: 320 },
        );
    await view.ready();

    await expectDeskCentered(view, "flat");
    await expectDeskCentered(view, "desc");
}, 120_000);

it("keeps ink optically centered at 280 and 400 widths and in a scrolling desk", async () => {
    const view = createRenderer()
        .render(
            () => (
                <AgentDesk
                    data-testid="w280"
                    done={DONE_FLAT}
                    queued={QUEUED_FLAT}
                    running={RUN_FLAT}
                />
            ),
            { width: 280, height: 320 },
        )
        .render(
            () => (
                <AgentDesk
                    data-testid="w400"
                    done={DONE_FLAT}
                    queued={QUEUED_FLAT}
                    running={RUN_FLAT}
                />
            ),
            { width: 400, height: 320 },
        )
        .render(
            () => (
                <AgentDesk
                    data-testid="short"
                    done={DONE_FLAT}
                    queued={QUEUED_FLAT}
                    running={RUN_FLAT}
                />
            ),
            { width: 340, height: 200 },
        );
    await view.ready();

    await expectDeskCentered(view, "w280");
    await expectDeskCentered(view, "w400");

    // Height-constrained desk: the body scrolls; the header and the running
    // tile hold their optical centering above the fold…
    const body = view.$('[data-testid="short"] [data-happy2-ui="agent-desk-body"]');
    expect(body.element.scrollHeight).toBeGreaterThan(body.element.clientHeight);
    const s = `[data-testid="short"]`;
    const spark = await ink(view, `${s} .happy2-agent-desk__spark`, 23.5);
    expect(Math.abs(spark.dy)).toBeLessThanOrEqual(ICON_TOLERANCE);
    const runTitle = await ink(view, `${s} [data-happy2-ui="agent-desk-run-title"]`, 10);
    expect(Math.abs(runTitle.dy)).toBeLessThanOrEqual(TEXT_TOLERANCE);
    const runEta = await ink(view, `${s} [data-happy2-ui="agent-desk-run-eta"]`, 10);
    expect(Math.abs(runEta.dy)).toBeLessThanOrEqual(TEXT_TOLERANCE);

    // …and the done row keeps it after scrolling to the bottom.
    body.element.scrollTop = body.element.scrollHeight;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(body.element.scrollTop).toBeGreaterThan(0);
    const check = await ink(
        view,
        `${s} [data-happy2-ui="agent-desk-done"] .happy2-agent-desk__row-icon`,
        16,
    );
    expect(Math.abs(check.dy)).toBeLessThanOrEqual(ICON_TOLERANCE);
    expect(Math.abs(check.dx)).toBeLessThanOrEqual(ICON_TOLERANCE);
    const doneMeta = await ink(
        view,
        `${s} [data-happy2-ui="agent-desk-done"] [data-happy2-ui="agent-desk-row-meta"]`,
        16,
    );
    expect(Math.abs(doneMeta.dy)).toBeLessThanOrEqual(TEXT_TOLERANCE);
}, 120_000);

it("handles custom icons, 1-char initials, and truncating labels", async () => {
    const view = createRenderer().render(
        () => (
            <AgentDesk
                data-testid="misc"
                done={[
                    {
                        icon: "doc",
                        id: "d-doc",
                        meta: "shipped",
                        title: "Custom-icon done row",
                    },
                ]}
                queued={[
                    {
                        icon: "branch",
                        id: "q-branch",
                        meta: "after review",
                        title: "Backport the flaky retry patch to the v2.2 maintenance branch",
                    },
                ]}
                running={[
                    {
                        agent: "Solo",
                        eta: "2m",
                        id: "run-solo",
                        initials: "C",
                        progress: 5,
                        title: "Long-running dependency upgrade sweep across all workspaces",
                        tone: "violet",
                    },
                ]}
            />
        ),
        { width: 340, height: 320 },
    );
    await view.ready();

    // Custom queued icon (branch) replaces the clock and stays centered.
    const branch = view.$('[data-happy2-ui="agent-desk-queued"] .happy2-agent-desk__row-icon');
    expect(branch.element.getAttribute("data-name")).toBe("branch");
    const branchInk = await ink(
        view,
        '[data-happy2-ui="agent-desk-queued"] .happy2-agent-desk__row-icon',
        18,
    );
    expect(Math.abs(branchInk.dy)).toBeLessThanOrEqual(TEXT_TOLERANCE);
    expect(Math.abs(branchInk.dx)).toBeLessThanOrEqual(TEXT_TOLERANCE);

    // Custom done icon (doc) replaces the check but keeps the success color.
    const doc = view.$('[data-happy2-ui="agent-desk-done"] .happy2-agent-desk__row-icon');
    expect(doc.element.getAttribute("data-name")).toBe("doc");
    expect(doc.computedStyle("color")).toBe("rgb(52, 199, 89)");
    const docInk = await ink(
        view,
        '[data-happy2-ui="agent-desk-done"] .happy2-agent-desk__row-icon',
        16,
    );
    expect(Math.abs(docInk.dy)).toBeLessThanOrEqual(TEXT_TOLERANCE);
    expect(Math.abs(docInk.dx)).toBeLessThanOrEqual(TEXT_TOLERANCE);

    // Single-character initials still paint a 20px agent avatar.
    const avatar = view.$('[data-happy2-ui="agent-desk-run"] [data-happy2-ui="avatar"]');
    expect(avatar.bounds().width).toBe(20);
    expect(avatar.bounds().height).toBe(20);
    expect(avatar.element.textContent).toBe("C");
    const avatarPixels = await avatar.visibleMetrics();
    expect(avatarPixels.pixelCount).toBeGreaterThan(0);

    // Long titles truncate with an ellipsis and never spill their ink.
    for (const selector of [
        '[data-happy2-ui="agent-desk-run-title"]',
        '[data-happy2-ui="agent-desk-queued"] [data-happy2-ui="agent-desk-row-title"]',
    ]) {
        const el = view.$(selector);
        expect(el.computedStyle("text-overflow"), selector).toBe("ellipsis");
        expect(el.element.scrollWidth, selector).toBeGreaterThan(el.element.clientWidth);
        const vis = await el.visibleMetrics();
        expect(vis.pixelCount, selector).toBeGreaterThan(0);
        expect(vis.bounds.x, selector).toBeGreaterThanOrEqual(0);
        expect(vis.bounds.x + vis.bounds.width, selector).toBeLessThanOrEqual(el.width());
    }
}, 120_000);

it("stays fluid, clamps progress, and scrolls overflowing content", async () => {
    const view = createRenderer()
        .render(
            () => (
                <div style={{ width: "280px", height: "180px", background: "#f5f5f5" }}>
                    <AgentDesk
                        data-testid="desk-narrow"
                        running={[
                            {
                                agent: "Codex",
                                id: "run-paused",
                                initials: "CX",
                                title: "Nightly sweep",
                                tone: "violet",
                            },
                        ]}
                        runningLabel="PAUSED"
                        title="Codex desk"
                    />
                </div>
            ),
            { width: 280, height: 180 },
        )
        .render(
            () => (
                <div style={{ width: "400px", height: "320px", background: "#f5f5f5" }}>
                    <AgentDesk
                        data-testid="desk-wide"
                        running={[
                            {
                                agent: "Codex",
                                eta: "finishing",
                                id: "run-over",
                                initials: "CX",
                                progress: 140,
                                title: "Clamped overrun",
                                tone: "mint",
                            },
                            {
                                agent: "Claude",
                                eta: "starting",
                                id: "run-zero",
                                initials: "CL",
                                progress: 0,
                                title: "Just started",
                                tone: "ember",
                            },
                            {
                                agent: "Claude",
                                eta: "1m left",
                                id: "run-quarter",
                                initials: "CL",
                                progress: 25,
                                title: "Quarter done",
                                tone: "violet",
                            },
                            {
                                agent: "Codex",
                                eta: "4m left",
                                id: "run-most",
                                initials: "CX",
                                progress: 62,
                                title: "Mostly there",
                                tone: "ocean",
                            },
                        ]}
                    />
                </div>
            ),
            { width: 400, height: 320 },
        )
        .render(
            () => (
                <div style={{ width: "340px", height: "300px", background: "#f5f5f5" }}>
                    <AgentDesk
                        data-testid="desk-scroll"
                        done={DONE}
                        queued={QUEUED}
                        running={RUNNING}
                    />
                </div>
            ),
            { width: 340, height: 300 },
        );
    await view.ready();

    // Narrow desk: fluid width, custom title and label, no optional parts.
    const narrow = view.$('[data-testid="desk-narrow"]');
    expect(narrow.bounds()).toEqual({ x: 0, y: 0, width: 280, height: 180 });
    expect(
        view.$('[data-testid="desk-narrow"] [data-happy2-ui="agent-desk-title"]').element
            .textContent,
    ).toBe("Codex desk");
    expect(
        view.$('[data-testid="desk-narrow"] .happy2-agent-desk__count').element.textContent,
    ).toBe("PAUSED");
    const narrowTile = view.$('[data-testid="desk-narrow"] [data-happy2-ui="agent-desk-run"]');
    expect(narrowTile.bounds()).toEqual({ x: 14, y: 60, width: 252, height: 44 });
    expect(narrow.element.querySelector('[data-happy2-ui="agent-desk-run-track"]')).toBeNull();
    expect(narrow.element.querySelector('[data-happy2-ui="agent-desk-run-eta"]')).toBeNull();
    expect(
        narrow.element.querySelectorAll('[data-happy2-ui="agent-desk-section-label"]').length,
    ).toBe(0);

    // Wide desk: the 348px track renders 0, 25, 62, and clamped >100
    // percentages at exact pixel widths.
    const wideTracks = view
        .$('[data-testid="desk-wide"]')
        .element.querySelectorAll('[data-happy2-ui="agent-desk-run-track"]');
    expect(wideTracks.length).toBe(4);
    expect(wideTracks[0]!.getAttribute("aria-valuenow")).toBe("100");
    expect(wideTracks[1]!.getAttribute("aria-valuenow")).toBe("0");
    expect(wideTracks[2]!.getAttribute("aria-valuenow")).toBe("25");
    expect(wideTracks[3]!.getAttribute("aria-valuenow")).toBe("62");
    const fillWidths = [348, 0, 87, 215.76];
    for (const [index, expected] of fillWidths.entries()) {
        const track = view.$(
            `[data-testid="desk-wide"] .happy2-agent-desk__run:nth-of-type(${index + 1}) [data-happy2-ui="agent-desk-run-track"]`,
        );
        expect(track.bounds().width, `track ${index}`).toBe(348);
        expect(track.height(), `track ${index}`).toBe(3);
        const fill = view.$(
            `[data-testid="desk-wide"] .happy2-agent-desk__run:nth-of-type(${index + 1}) [data-happy2-ui="agent-desk-run-fill"]`,
        );
        expect(Math.abs(fill.width() - expected), `fill ${index}`).toBeLessThanOrEqual(0.1);
        if (expected > 0) {
            expect(fill.height(), `fill ${index}`).toBe(3);
            const fillPixels = await fill.visibleMetrics();
            expect(fillPixels.pixelCount, `fill ${index}`).toBeGreaterThan(0);
        }
    }

    // Constrained desk: the body scrolls while the root keeps its height.
    const scrollDesk = view.$('[data-testid="desk-scroll"]');
    expect(scrollDesk.bounds()).toEqual({ x: 0, y: 0, width: 340, height: 300 });
    const scrollBody = view.$('[data-testid="desk-scroll"] [data-happy2-ui="agent-desk-body"]');
    expect(scrollBody.height()).toBe(252);
    expect(scrollBody.computedStyle("overflow-y")).toBe("auto");
    expect(scrollBody.element.scrollHeight).toBeGreaterThanOrEqual(400);

    await view.screenshot("AgentDesk.variants.test");
});
