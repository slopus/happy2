import { expect, it } from "vitest";
import { server } from "vitest/browser";
import "./theme.css";
import "./styles/icon.css";
import "./styles/button.css";
import "./styles/badge.css";
import "./styles/switch.css";
import "./styles/banner.css";
import "./styles/automation-card.css";
import { AutomationCard } from "./AutomationCard";
import { createRenderer, type RenderedElement } from "./testing";

type Engine = "chromium" | "firefox" | "webkit";
const engine = () => server.browser as Engine;

/* textMetrics() strips family quotes; getComputedStyle keeps them except on
 * WebKit (same quirk asserted in Button.test.tsx). */
const computedFontFamily =
    server.browser === "webkit"
        ? "happy2 Figtree, system-ui, sans-serif"
        : `"happy2 Figtree", system-ui, sans-serif`;
const uiFont = "happy2 Figtree, system-ui, sans-serif";
const monoFont = "happy2 Mono, ui-monospace, monospace";

/* Solid theme tokens resolved to the exact rgb()/rgba() each engine reports. */
const TEXT = "rgb(237, 234, 242)";
const SECONDARY = "rgb(165, 160, 176)";
const MUTED = "rgb(117, 112, 133)";
const SURFACE = "rgb(28, 27, 34)";
const BORDER = "rgba(255, 255, 255, 0.07)";
const ON_TRACK = "rgb(139, 124, 247)";
const OFF_TRACK = "rgba(255, 255, 255, 0.05)";
const SECONDARY_BTN = "rgb(36, 34, 43)";

const badgeColors = {
    info: { bg: "rgba(96, 165, 250, 0.13)", fg: "rgb(96, 165, 250)" },
    accent: { bg: "rgba(139, 124, 247, 0.15)", fg: "rgb(168, 155, 255)" },
    warning: { bg: "rgba(251, 191, 36, 0.13)", fg: "rgb(252, 211, 77)" },
    success: { bg: "rgba(52, 211, 153, 0.13)", fg: "rgb(110, 231, 183)" },
    danger: { bg: "rgba(248, 113, 113, 0.13)", fg: "rgb(252, 165, 165)" },
} as const;

/*
 * Per-engine paint-only text corrections resolved in automation-card.css. They
 * cancel the vertical raster drift of the card's own text runs (Firefox rasters
 * every run ~0.5px low; WebKit the 13px/12px runs ~0.5px low, but the 15px name
 * matches Chromium). Guards that the @supports engine scopes resolve on exactly
 * the right engine — every value is an exact 0.5px step the engines apply
 * verbatim. Mirrors the proven AgentRunCard treatment.
 */
const nameY: Record<Engine, string> = { chromium: "-0.5px", firefox: "-1px", webkit: "-0.5px" };
const detailY: Record<Engine, string> = { chromium: "0px", firefox: "-0.5px", webkit: "-0.5px" };
const metaY: Record<Engine, string> = { chromium: "0px", firefox: "-0.5px", webkit: "-0.5px" };
/* The name translate shifts its painted client rect by exactly this step. */
const nameYPx: Record<Engine, number> = { chromium: -0.5, firefox: -1, webkit: -0.5 };

type Renderer = ReturnType<typeof createRenderer>;

/*
 * Absolute (surface-relative) alpha-weighted ink centroid and visible bounds of
 * a rendered part. Every read sanity-asserts pixelCount > 0 so a blank or
 * clipped capture can never pass as "centered".
 */
async function inkCenter(part: RenderedElement<Element>, label: string) {
    const metrics = await part.visibleMetrics();
    expect(metrics.pixelCount, `${label} paints no pixels`).toBeGreaterThan(0);
    const b = part.bounds();
    // Ink must not touch the captured box edges, so a truncated capture fails.
    expect(metrics.bounds.y, `${label} ink clipped at box top`).toBeGreaterThanOrEqual(0);
    expect(
        metrics.bounds.y + metrics.bounds.height,
        `${label} ink clipped at box bottom`,
    ).toBeLessThanOrEqual(b.height + 0.5);
    return {
        x: b.x + metrics.center.x,
        y: b.y + metrics.center.y,
        top: b.y + metrics.bounds.y,
        bottom: b.y + metrics.bounds.y + metrics.bounds.height,
    };
}

function boxCenterY(part: RenderedElement<Element>) {
    const b = part.bounds();
    return b.y + b.height / 2;
}

const errorText = "Delivery failed after 3 retries.";

/* One renderer, three cases: A full (schedule→send_message, active, footer),
 * B error (webhook→moderate, active, danger banner), C minimal (event→
 * call_webhook, paused, header+flow only). Together they cover every trigger
 * type, every action type, the on/off switch, and the present/absent detail,
 * error, and footer rows. */
function renderCases(view: Renderer) {
    view.render(
        () => (
            <AutomationCard
                active
                actionLabel="Post to #general"
                actionType="send_message"
                data-testid="a"
                lastRunLabel="Last run 2h ago"
                name="Daily digest"
                nextRunLabel="Next in 22h"
                onRun={() => {}}
                onToggleActive={() => {}}
                triggerLabel="Every day at 09:00"
                triggerType="schedule"
            />
        ),
        { width: 432, height: 200, padding: 16 },
    );
    view.render(
        () => (
            <AutomationCard
                active
                actionLabel="Escalate to on-call"
                actionType="moderate"
                data-testid="b"
                error={errorText}
                lastRunLabel="Failed 8m ago"
                name="Inbound alert relay"
                onRun={() => {}}
                onToggleActive={() => {}}
                triggerLabel="POST /hooks/alerts"
                triggerType="webhook"
            />
        ),
        { width: 432, height: 264, padding: 16 },
    );
    view.render(
        () => (
            <AutomationCard
                active={false}
                actionType="call_webhook"
                data-testid="c"
                name="Welcome message"
                onToggleActive={() => {}}
                triggerType="event"
            />
        ),
        { width: 432, height: 130, padding: 16 },
    );
}

it("holds AutomationCard layout, geometry, typography, badge colors, and states", async () => {
    const toggleCalls: boolean[] = [];
    const runCalls: number[] = [];
    const view = createRenderer();
    // Case A re-rendered with live handlers for the interaction assertions.
    view.render(
        () => (
            <AutomationCard
                active
                actionLabel="Post to #general"
                actionType="send_message"
                data-testid="a"
                lastRunLabel="Last run 2h ago"
                name="Daily digest"
                nextRunLabel="Next in 22h"
                onRun={() => runCalls.push(1)}
                onToggleActive={(v) => toggleCalls.push(v)}
                triggerLabel="Every day at 09:00"
                triggerType="schedule"
            />
        ),
        { width: 432, height: 200, padding: 16 },
    );
    view.render(
        () => (
            <AutomationCard
                active
                actionLabel="Escalate to on-call"
                actionType="moderate"
                data-testid="b"
                error={errorText}
                lastRunLabel="Failed 8m ago"
                name="Inbound alert relay"
                onRun={() => {}}
                onToggleActive={() => {}}
                triggerLabel="POST /hooks/alerts"
                triggerType="webhook"
            />
        ),
        { width: 432, height: 264, padding: 16 },
    );
    view.render(
        () => (
            <AutomationCard
                active={false}
                actionType="call_webhook"
                data-testid="c"
                name="Welcome message"
                onToggleActive={() => {}}
                triggerType="event"
            />
        ),
        { width: 432, height: 130, padding: 16 },
    );
    await view.ready();

    const a = (sel: string) => view.$(`[data-testid="a"] ${sel}`);

    /* — card surface: 400px, radius 10, hairline, surface fill, flex column — */
    const card = view.$('[data-testid="a"]');
    expect(card.bounds()).toEqual({ x: 16, y: 16, width: 400, height: 154 });
    expect(
        card.computedStyles([
            "background-color",
            "border-radius",
            "border-top-color",
            "border-top-width",
            "box-sizing",
            "display",
            "flex-direction",
            "font-family",
            "max-width",
            "padding",
        ]),
    ).toEqual({
        "background-color": SURFACE,
        "border-radius": "10px",
        "border-top-color": BORDER,
        "border-top-width": "1px",
        "box-sizing": "border-box",
        display: "flex",
        "flex-direction": "column",
        "font-family": computedFontFamily,
        "max-width": "400px",
        padding: "16px",
    });
    expect(card.element.hasAttribute("data-active"), "A active flag").toBe(true);
    // The @supports engine scopes resolve on exactly one engine.
    expect(card.computedStyle("--happy2-automation-name-y"), "name-y").toBe(nameY[engine()]);
    expect(card.computedStyle("--happy2-automation-detail-y"), "detail-y").toBe(detailY[engine()]);
    expect(card.computedStyle("--happy2-automation-meta-y"), "meta-y").toBe(metaY[engine()]);

    /* — row rhythm: header 20 / flow 18 / detail 18 / footer 28 on a 12px gap — */
    expect(a('[data-happy2-ui="automation-card-header"]').bounds()).toEqual({
        x: 33,
        y: 33,
        width: 366,
        height: 20,
    });
    expect(a('[data-happy2-ui="automation-card-flow"]').bounds()).toEqual({
        x: 33,
        y: 65,
        width: 366,
        height: 18,
    });
    expect(a('[data-happy2-ui="automation-card-detail"]').bounds()).toEqual({
        x: 33,
        y: 95,
        width: 366,
        height: 18,
    });
    expect(a('[data-happy2-ui="automation-card-footer"]').bounds()).toEqual({
        x: 33,
        y: 125,
        width: 366,
        height: 28,
    });

    /* — name title: 15/700, -0.15 tracking, text color, left-anchored — */
    const name = a('[data-happy2-ui="automation-card-name"]');
    const nameBounds = name.bounds();
    expect(nameBounds.x, "name left").toBe(33);
    expect(nameBounds.width, "name width").toBe(318); /* 366 − 36 switch − 12 gap */
    expect(nameBounds.height, "name height").toBe(20);
    // Layout top is 33; the paint-only translate shifts the rect by nameYPx.
    expect(Math.abs(nameBounds.y - (33 + nameYPx[engine()])), "name top").toBeLessThanOrEqual(0.05);
    expect(name.textMetrics().font).toEqual({
        family: uiFont,
        letterSpacing: -0.15,
        lineHeight: 20,
        size: 15,
        weight: "700",
    });
    expect(name.element.textContent, "name text").toBe("Daily digest");
    expect(name.computedStyle("color"), "name color").toBe(TEXT);

    /* — active switch: 36×20 medium track, accent-on, right-pinned in header — */
    const switchWrap = a('[data-happy2-ui="automation-card-switch"]');
    expect(switchWrap.offsets().right, "switch right-pinned").toBeCloseTo(0, 3);
    const switchRoot = a('[data-happy2-ui="switch"]');
    expect(switchRoot.element.getAttribute("aria-checked"), "A switch checked").toBe("true");
    const track = a('[data-happy2-ui="switch-track"]');
    expect(track.bounds()).toMatchObject({ width: 36, height: 20 });
    expect(track.computedStyle("background-color"), "A track on").toBe(ON_TRACK);

    /* — flow row: trigger badge → arrow → action badge, colored by type — */
    const triggerBadge = a('[data-happy2-ui="automation-card-trigger"] [data-happy2-ui="badge"]');
    expect(triggerBadge.offsets().left, "trigger badge flush left").toBe(0);
    expect(triggerBadge.element.textContent, "trigger label").toBe("Schedule");
    expect(triggerBadge.computedStyles(["background-color", "color", "height"])).toEqual({
        "background-color": badgeColors.info.bg,
        color: badgeColors.info.fg,
        height: "18px",
    });
    const actionBadge = a('[data-happy2-ui="automation-card-action"] [data-happy2-ui="badge"]');
    expect(actionBadge.element.textContent, "action label").toBe("Send message");
    expect(actionBadge.computedStyles(["background-color", "color"])).toEqual({
        "background-color": badgeColors.success.bg,
        color: badgeColors.success.fg,
    });
    const arrow = a('[data-happy2-ui="automation-card-arrow"] svg');
    expect(arrow.bounds()).toMatchObject({ width: 14, height: 14 });
    expect(arrow.element.getAttribute("data-name"), "arrow glyph").toBe("arrow-right");
    // Trigger sits left of the arrow, which sits left of the action.
    expect(triggerBadge.bounds().x).toBeLessThan(arrow.bounds().x);
    expect(arrow.bounds().x).toBeLessThan(actionBadge.bounds().x);

    /* — detail line: 13/400 secondary trigger + action labels — */
    const triggerLabel = a('[data-happy2-ui="automation-card-trigger-label"]');
    expect(triggerLabel.bounds().x, "trigger-label left").toBe(33);
    expect(triggerLabel.textMetrics().font).toMatchObject({
        family: uiFont,
        lineHeight: 18,
        size: 13,
        weight: "400",
    });
    expect(triggerLabel.element.textContent).toBe("Every day at 09:00");
    expect(triggerLabel.computedStyle("color"), "detail color").toBe(SECONDARY);
    expect(a('[data-happy2-ui="automation-card-action-label"]').element.textContent).toBe(
        "Post to #general",
    );

    /* — footer: mono meta run on the left, 28px run-now button on the right — */
    const last = a('[data-happy2-ui="automation-card-last"]');
    expect(last.textMetrics().font).toMatchObject({
        family: monoFont,
        lineHeight: 16,
        size: 12,
        weight: "500",
    });
    expect(last.element.textContent).toBe("Last run 2h ago");
    expect(last.computedStyle("color"), "meta color").toBe(MUTED);
    expect(a('[data-happy2-ui="automation-card-next"]').element.textContent).toBe("Next in 22h");
    const runWrap = a('[data-happy2-ui="automation-card-run"]');
    expect(runWrap.offsets().right, "run-now right-pinned").toBeCloseTo(0, 3);
    const runBtn = a('[data-happy2-ui="automation-card-run"] [data-happy2-ui="button"]');
    expect(runBtn.bounds().height, "run-now height").toBe(28);
    expect(runBtn.computedStyle("background-color"), "run-now secondary").toBe(SECONDARY_BTN);
    expect(runBtn.element.textContent).toContain("Run now");
    expect(
        runBtn.element.querySelector('svg[data-name="play"]'),
        "run-now play glyph",
    ).not.toBeNull();

    /* — interactions report upward — */
    (switchRoot.element as HTMLButtonElement).click();
    (runBtn.element as HTMLButtonElement).click();
    expect(toggleCalls, "toggle callback").toEqual([false]); /* active → toggles to false */
    expect(runCalls, "run callback").toEqual([1]);

    /* — Case B: danger banner tokens + webhook/moderate badge colors — */
    const b = (sel: string) => view.$(`[data-testid="b"] ${sel}`);
    expect(
        b('[data-happy2-ui="automation-card-trigger"] [data-happy2-ui="badge"]').computedStyles([
            "background-color",
            "color",
        ]),
    ).toEqual({ "background-color": badgeColors.warning.bg, color: badgeColors.warning.fg });
    expect(
        b('[data-happy2-ui="automation-card-action"] [data-happy2-ui="badge"]').computedStyles([
            "background-color",
            "color",
        ]),
    ).toEqual({ "background-color": badgeColors.danger.bg, color: badgeColors.danger.fg });
    const banner = b('[data-happy2-ui="banner"]');
    expect(banner.bounds().height, "banner single-line height").toBe(44);
    expect(
        banner.computedStyles(["background-color", "border-top-color", "border-radius"]),
    ).toEqual({
        "background-color": badgeColors.danger.bg,
        "border-top-color": "rgb(248, 113, 113)",
        "border-radius": "10px",
    });
    const bannerMsg = b('[data-happy2-ui="banner-message"]');
    expect(bannerMsg.element.textContent).toBe(errorText);
    expect(bannerMsg.computedStyle("color"), "banner message color").toBe(SECONDARY);

    /* — Case C: paused switch off, event/call_webhook badges, minimal layout — */
    const c = (sel: string) => view.$(`[data-testid="c"] ${sel}`);
    const cCard = view.$('[data-testid="c"]');
    expect(cCard.bounds()).toEqual({ x: 16, y: 16, width: 400, height: 84 });
    expect(cCard.element.hasAttribute("data-active"), "C paused flag").toBe(false);
    expect(c('[data-happy2-ui="switch"]').element.getAttribute("aria-checked"), "C off").toBe(
        "false",
    );
    expect(
        c('[data-happy2-ui="switch-track"]').computedStyle("background-color"),
        "C track off",
    ).toBe(OFF_TRACK);
    expect(
        c('[data-happy2-ui="automation-card-trigger"] [data-happy2-ui="badge"]').computedStyle(
            "color",
        ),
    ).toBe(badgeColors.accent.fg);
    expect(
        c('[data-happy2-ui="automation-card-action"] [data-happy2-ui="badge"]').computedStyle(
            "color",
        ),
    ).toBe(badgeColors.info.fg);
    // Minimal card renders no detail / error / footer rows.
    expect(cCard.element.querySelector('[data-happy2-ui="automation-card-detail"]')).toBeNull();
    expect(cCard.element.querySelector('[data-happy2-ui="automation-card-error"]')).toBeNull();
    expect(cCard.element.querySelector('[data-happy2-ui="automation-card-footer"]')).toBeNull();

    await view.screenshot("AutomationCard.test");
}, 120_000);

/*
 * Optical alignment (DESIGN.md): alpha-weighted ink centroids from true-2x
 * captures, asserted against the untranslated row each run is centered in. Word
 * runs (name, detail, meta) carry inherently asymmetric ink, so they assert the
 * vertical centroid only (their horizontal axis is left-aligned layout, not
 * centering); the paint-only corrections in automation-card.css bring every run
 * under the 0.75 contract ceiling in all three engines. Symmetric painted
 * glyphs the card owns/composes (arrow, switch thumb) assert both axes at the
 * tuned 0.4px — the arrow-right glyph points right, so its horizontal ink is
 * intentionally biased and exempt on x.
 */
it("centers ink optically in every card row and glyph", async () => {
    const view = createRenderer();
    renderCases(view);
    await view.ready();

    const a = (sel: string) => view.$(`[data-testid="a"] ${sel}`);

    /* — name title on the header center — */
    const header = a('[data-happy2-ui="automation-card-header"]');
    const nameInk = await inkCenter(a('[data-happy2-ui="automation-card-name"]'), "name");
    expect(
        Math.abs(nameInk.y - boxCenterY(header)),
        `name dy ${nameInk.y - boxCenterY(header)}`,
    ).toBeLessThanOrEqual(0.75);

    /* — trigger→action arrow: symmetric on y, box-centered in the 18px row — */
    const arrow = a('[data-happy2-ui="automation-card-arrow"]');
    expect(arrow.offsets().top, "arrow box vertical centering").toBe(2); /* (18 − 14) / 2 */
    const arrowInk = await inkCenter(arrow, "arrow");
    expect(
        Math.abs(arrowInk.y - boxCenterY(arrow)),
        `arrow dy ${arrowInk.y - boxCenterY(arrow)}`,
    ).toBeLessThanOrEqual(0.4);
    // x exempt: arrow-right points right, keeping intentional rightward ink.

    /* — detail label on the detail-row center — */
    const detail = a('[data-happy2-ui="automation-card-detail"]');
    const detailInk = await inkCenter(
        a('[data-happy2-ui="automation-card-trigger-label"]'),
        "detail",
    );
    expect(
        Math.abs(detailInk.y - boxCenterY(detail)),
        `detail dy ${detailInk.y - boxCenterY(detail)}`,
    ).toBeLessThanOrEqual(0.75);

    /* — mono meta run on the meta-line center — */
    const meta = a('[data-happy2-ui="automation-card-meta"]');
    const lastEl = a('[data-happy2-ui="automation-card-last"]');
    const nextEl = a('[data-happy2-ui="automation-card-next"]');
    const lastInk = await inkCenter(lastEl, "meta");
    expect(
        Math.abs(lastInk.y - boxCenterY(meta)),
        `meta dy ${lastInk.y - boxCenterY(meta)}`,
    ).toBeLessThanOrEqual(0.75);
    // "Next in 22h" has no descenders while "Last run 2h ago" carries a g, so
    // their visible ink bottoms differ by the descender depth — an invalid
    // baseline probe. Assert the browser-laid-out DOM baseline instead: adjacent
    // mono runs on one line (with the same meta-y translate) must share it.
    await inkCenter(nextEl, "meta-next"); /* paint guard for the next run */
    expect(
        Math.abs(lastEl.textMetrics().verticalOffset - nextEl.textMetrics().verticalOffset),
        "meta shared baseline",
    ).toBeLessThanOrEqual(0.1);

    /* — active switch thumb: solid symmetric circle, both axes at 0.4 — */
    const thumb = a('[data-happy2-ui="switch-thumb"]');
    const thumbBox = thumb.bounds();
    const thumbVisible = await thumb.visibleMetrics();
    expect(thumbVisible.pixelCount, "thumb paints no pixels").toBeGreaterThan(0);
    const thumbDx = thumbVisible.center.x - thumbBox.width / 2;
    const thumbDy = thumbVisible.center.y - thumbBox.height / 2;
    expect(Math.abs(thumbDx), `thumb dx ${thumbDx}`).toBeLessThanOrEqual(0.4);
    expect(Math.abs(thumbDy), `thumb dy ${thumbDy}`).toBeLessThanOrEqual(0.4);

    /* — composed-primitive ink lands inside its own row (Badge/Button own the
     * strict centering; a loose bound here proves the card didn't disturb it) — */
    const triggerLabelInk = await inkCenter(
        a('[data-happy2-ui="automation-card-trigger"] [data-happy2-ui="badge-label"]'),
        "badge-label",
    );
    const triggerBadge = a('[data-happy2-ui="automation-card-trigger"] [data-happy2-ui="badge"]');
    expect(
        Math.abs(triggerLabelInk.y - boxCenterY(triggerBadge)),
        "badge label row",
    ).toBeLessThanOrEqual(1.25);
    const runLabelInk = await inkCenter(
        a('[data-happy2-ui="automation-card-run"] [data-happy2-ui="button-label"]'),
        "run-label",
    );
    const runBtn = a('[data-happy2-ui="automation-card-run"] [data-happy2-ui="button"]');
    expect(Math.abs(runLabelInk.y - boxCenterY(runBtn)), "run label row").toBeLessThanOrEqual(1.25);

    expect(["chromium", "firefox", "webkit"]).toContain(engine());
    await view.screenshot("AutomationCard.optical.test");
}, 120_000);
