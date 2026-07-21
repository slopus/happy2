import { expect, it } from "vitest";
import { server } from "vitest/browser";
import "./theme.css";
import "./styles/policy-control.css";
import "./styles/segmented-control.css";
import "./styles/select.css";
import "./styles/switch.css";
import "./styles/form-row.css";
import "./styles/icon.css";
import { PolicyControl } from "./PolicyControl";
import { createRenderer } from "./testing";

type Engine = "chromium" | "firefox" | "webkit";

const engine = () => server.browser as Engine;

/* Fixed theme colors so every engine reports the same rgb(). */
const TEXT = "rgb(0, 0, 0)"; // --text  #000000
const SECONDARY = "rgb(142, 142, 147)"; // --text-secondary #8e8e93
const MUTED = "rgb(142, 142, 147)"; // --text-secondary #8e8e93
const SURFACE = "rgb(255, 255, 255)"; // --surface #ffffff
const HAIRLINE = "rgb(234, 234, 234)"; // --divider
const ACCENT = "rgb(52, 199, 89)"; // --switch-track-active #34c759

/* Card fills a 400px host; border 1 + padding 20 each side → 358 content. */
const CARD_W = 400;
const CONTENT_W = 358;

type Renderer = ReturnType<typeof createRenderer>;

/* WebKit reports the family unquoted; textMetrics strips quotes for both. */
const fontFamily = () =>
    server.browser === "webkit"
        ? "happy2 Figtree, system-ui, sans-serif"
        : '"happy2 Figtree", system-ui, sans-serif';

/*
 * Alpha-weighted ink centroid of a painted part, as a signed offset from the
 * center of its own border box (positive = right/low). Refuses blank or clipped
 * captures: the part must paint pixels and its ink may not touch the box edges,
 * so a truncated screenshot can never pass silently.
 */
async function boxCentroid(view: Renderer, selector: string) {
    const el = view.$(selector);
    const visible = await el.visibleMetrics();
    expect(visible.pixelCount, `${selector} paints no pixels`).toBeGreaterThan(0);
    const box = el.bounds();
    expect(visible.bounds.x, `${selector} ink clipped at left`).toBeGreaterThan(0);
    expect(visible.bounds.y, `${selector} ink clipped at top`).toBeGreaterThan(0);
    expect(
        visible.bounds.x + visible.bounds.width,
        `${selector} ink clipped at right`,
    ).toBeLessThan(box.width);
    expect(
        visible.bounds.y + visible.bounds.height,
        `${selector} ink clipped at bottom`,
    ).toBeLessThan(box.height);
    return { dx: visible.center.x - box.width / 2, dy: visible.center.y - box.height / 2 };
}

/* A word label paints asymmetric ink, so its centroid is not chased. Assert the
 * capture is non-blank and unclipped inside its own line box instead. */
async function assertLegibleUnclipped(view: Renderer, selector: string) {
    const el = view.$(selector);
    const visible = await el.visibleMetrics();
    const box = el.bounds();
    expect(visible.pixelCount, `${selector} paints no pixels`).toBeGreaterThan(0);
    expect(visible.bounds.x, `${selector} ink clipped at left`).toBeGreaterThanOrEqual(0);
    expect(visible.bounds.y, `${selector} ink clipped at top`).toBeGreaterThan(0);
    expect(
        visible.bounds.x + visible.bounds.width,
        `${selector} ink clipped at right`,
    ).toBeLessThanOrEqual(box.width);
    expect(
        visible.bounds.y + visible.bounds.height,
        `${selector} ink clipped at bottom`,
    ).toBeLessThan(box.height);
}

/* Line-box symmetry of a word label inside its host box (left gap ≈ right gap). */
function labelSymmetry(view: Renderer, hostSelector: string, labelSelector: string) {
    const host = view.$(hostSelector).bounds();
    const label = view.$(labelSelector).bounds();
    const left = label.x - host.x;
    const right = host.x + host.width - label.x - label.width;
    return Math.abs(left - right);
}

it("holds PolicyControl card, sections, composed controls, and optical centering", async () => {
    const view = createRenderer();

    view.render(
        () => (
            <div style={{ width: `${CARD_W}px` }}>
                <PolicyControl
                    afterReadScope="all_readers"
                    data-testid="policy"
                    expiryMode="after_read"
                    retentionMode="duration"
                    retentionSeconds={2592000}
                    selfDestructSeconds={3600}
                />
            </div>
        ),
        { width: 460, height: 580, padding: 24 },
    );
    await view.ready();

    // ---- Card contract ------------------------------------------------------
    const card = view.$('[data-testid="policy"]');
    expect(card.bounds().width, "card width").toBe(CARD_W);
    expect(
        card.computedStyles([
            "background-color",
            "border-radius",
            "border-top-color",
            "border-top-width",
            "box-sizing",
            "color",
            "display",
            "flex-direction",
            "font-family",
            "padding",
            "row-gap",
        ]),
        "card styles",
    ).toEqual({
        "background-color": SURFACE,
        "border-radius": "10px",
        "border-top-color": HAIRLINE,
        "border-top-width": "1px",
        "box-sizing": "border-box",
        color: TEXT,
        display: "flex",
        "flex-direction": "column",
        "font-family": fontFamily(),
        padding: "20px",
        "row-gap": "20px",
    });

    // ---- Both policy sections present, stretched to card content width ------
    const expiry = view.$('[data-section="expiry"]');
    const retention = view.$('[data-section="retention"]');
    for (const [name, section] of [
        ["expiry", expiry],
        ["retention", retention],
    ] as const) {
        expect(section.bounds().width, `${name} section width`).toBe(CONTENT_W);
        expect(
            section.computedStyles(["display", "flex-direction", "row-gap"]),
            `${name} section layout`,
        ).toEqual({ display: "flex", "flex-direction": "column", "row-gap": "16px" });
    }

    // ---- Section header typography + muted help color -----------------------
    const expiryTitle = view.$('[data-section="expiry"] [data-happy2-ui="policy-control-title"]');
    expect(expiryTitle.textMetrics(), "expiry title").toMatchObject({
        font: {
            family: "happy2 Figtree, system-ui, sans-serif",
            lineHeight: 20,
            size: 13,
            weight: "600",
        },
        text: "Disappearing messages",
    });
    expect(expiryTitle.computedStyle("color"), "expiry title color").toBe(TEXT);

    const expiryHelp = view.$('[data-section="expiry"] [data-happy2-ui="policy-control-help"]');
    expect(expiryHelp.textMetrics(), "expiry help").toMatchObject({
        font: { lineHeight: 16, size: 12, weight: "400" },
        text: "New messages are removed from every device after the timer ends.",
    });
    expect(expiryHelp.computedStyle("color"), "expiry help muted color").toBe(MUTED);

    const retentionTitle = view.$(
        '[data-section="retention"] [data-happy2-ui="policy-control-title"]',
    );
    expect(retentionTitle.textMetrics().text, "retention title").toBe("Message retention");
    const retentionHelp = view.$(
        '[data-section="retention"] [data-happy2-ui="policy-control-help"]',
    );
    expect(retentionHelp.computedStyle("color"), "retention help muted color").toBe(MUTED);

    // Header title/help must actually paint (never trust a blank capture).
    await assertLegibleUnclipped(
        view,
        '[data-section="expiry"] [data-happy2-ui="policy-control-title"]',
    );
    await assertLegibleUnclipped(
        view,
        '[data-section="expiry"] [data-happy2-ui="policy-control-help"]',
    );

    // ---- Hairline rule between the two sections, with symmetric 20px gaps ----
    const rule = view.$('[data-happy2-ui="policy-control-rule"]');
    const ruleBounds = rule.bounds();
    expect(ruleBounds.width, "rule width").toBe(CONTENT_W);
    expect(ruleBounds.height, "rule height").toBe(1);
    expect(rule.computedStyle("background-color"), "rule color").toBe(HAIRLINE);
    const expiryBounds = expiry.bounds();
    const retentionBounds = retention.bounds();
    expect(
        Math.abs(ruleBounds.y - (expiryBounds.y + expiryBounds.height) - 20),
        "gap expiry→rule",
    ).toBeLessThanOrEqual(0.1);
    expect(
        Math.abs(retentionBounds.y - (ruleBounds.y + ruleBounds.height) - 20),
        "gap rule→retention",
    ).toBeLessThanOrEqual(0.1);

    // ---- Expiry SegmentedControl: full-width, medium, after_read selected ----
    const expirySeg = view.$('[data-section="expiry"] [data-happy2-ui="segmented-control"]');
    expect(expirySeg.bounds().width, "expiry segmented width").toBe(CONTENT_W);
    expect(expirySeg.bounds().height, "expiry segmented height").toBe(36);
    expect(expirySeg.computedStyle("--happy2-segmented-index"), "expiry selected index").toBe("2");
    // Equal segment widths and the selected pill landing on "after reading".
    const expiryValues = ["none", "after_send", "after_read"];
    const segBounds = expiryValues.map((value) =>
        view.$(`[data-section="expiry"] [data-value="${value}"]`).bounds(),
    );
    for (const b of segBounds) {
        expect(
            Math.abs(b.width - segBounds[0]!.width),
            "equal expiry segments",
        ).toBeLessThanOrEqual(0.1);
    }
    const expiryPill = view
        .$('[data-section="expiry"] [data-happy2-ui="segmented-control-pill"]')
        .bounds();
    expect(Math.abs(expiryPill.x - segBounds[2]!.x), "expiry pill x").toBeLessThanOrEqual(0.2);
    expect(
        Math.abs(expiryPill.width - segBounds[2]!.width),
        "expiry pill width",
    ).toBeLessThanOrEqual(0.2);
    // Active vs inactive segment foreground tokens.
    expect(
        view
            .$(
                '[data-section="expiry"] [data-value="after_read"] [data-happy2-ui="segmented-control-label"]',
            )
            .computedStyle("color"),
        "active segment color",
    ).toBe(TEXT);
    expect(
        view
            .$(
                '[data-section="expiry"] [data-value="none"] [data-happy2-ui="segmented-control-label"]',
            )
            .computedStyle("color"),
        "inactive segment color",
    ).toBe(SECONDARY);
    // Word labels are asymmetric ink → line-box symmetry, not centroid.
    for (const value of expiryValues) {
        expect(
            labelSymmetry(
                view,
                `[data-section="expiry"] [data-value="${value}"]`,
                `[data-section="expiry"] [data-value="${value}"] [data-happy2-ui="segmented-control-label"]`,
            ),
            `expiry ${value} label symmetry`,
        ).toBeLessThanOrEqual(0.5);
    }

    // ---- Timer FormRow: inline, right-aligned Select, muted description ------
    const timerRow = view.$(".happy2-policy-control__field--timer");
    expect(timerRow.bounds().width, "timer row width").toBe(CONTENT_W);
    expect(
        timerRow.computedStyles([
            "align-items",
            "border-bottom-width",
            "column-gap",
            "display",
            "flex-direction",
            "padding",
        ]),
        "timer row layout",
    ).toEqual({
        "align-items": "center",
        "border-bottom-width": "0px",
        "column-gap": "24px",
        display: "flex",
        "flex-direction": "row",
        padding: "0px",
    });
    const timerLabel = view.$(
        ".happy2-policy-control__field--timer [data-happy2-ui=form-row-label]",
    );
    expect(timerLabel.textMetrics(), "timer label").toMatchObject({
        font: { lineHeight: 20, size: 13, weight: "600" },
        text: "Timer",
    });
    expect(timerLabel.computedStyle("color"), "timer label color").toBe(TEXT);
    const timerDesc = view.$(
        ".happy2-policy-control__field--timer [data-happy2-ui=form-row-description]",
    );
    expect(timerDesc.computedStyle("color"), "timer description muted").toBe(MUTED);
    expect(timerDesc.textMetrics().font, "timer description font").toMatchObject({
        lineHeight: 16,
        size: 12,
        weight: "400",
    });
    const timerControl = view.$(
        ".happy2-policy-control__field--timer [data-happy2-ui=form-row-control]",
    );
    expect(
        Math.abs(timerControl.offsets().right),
        "timer control right-aligned",
    ).toBeLessThanOrEqual(0.1);

    // Timer Select: 160×36 well, selected value text, tuned chevron glyph.
    const timerSelect = view.$(
        ".happy2-policy-control__field--timer [data-happy2-ui=select-control]",
    );
    expect(timerSelect.bounds().width, "timer select width").toBe(160);
    expect(timerSelect.bounds().height, "timer select height").toBe(36);
    expect(
        view.$(".happy2-policy-control__field--timer [data-happy2-ui=select-value]").textMetrics()
            .text,
        "timer select value",
    ).toBe("1 hour");
    const timerChevron = ".happy2-policy-control__field--timer [data-happy2-ui=select-chevron] svg";
    expect(view.$(timerChevron).bounds().width, "timer chevron size").toBe(16);
    // The chevron-down glyph is horizontally symmetric ink — the tuned Icon path
    // (Icon.test proves ≤0.6px at size 16) must stay centered in its own box.
    const chevronDrift = await boxCentroid(view, timerChevron);
    expect(Math.abs(chevronDrift.dx), "timer chevron centroid x").toBeLessThanOrEqual(0.6);
    expect(Math.abs(chevronDrift.dy), "timer chevron centroid y").toBeLessThanOrEqual(0.6);

    // ---- Scope FormRow: right-aligned Switch, checked = all_readers ----------
    const scopeRow = view.$(".happy2-policy-control__field--scope");
    expect(scopeRow.bounds().width, "scope row width").toBe(CONTENT_W);
    expect(
        view.$(".happy2-policy-control__field--scope [data-happy2-ui=form-row-label]").textMetrics()
            .text,
        "scope label",
    ).toBe("Wait for all readers");
    const scopeControl = view.$(
        ".happy2-policy-control__field--scope [data-happy2-ui=form-row-control]",
    );
    expect(
        Math.abs(scopeControl.offsets().right),
        "scope control right-aligned",
    ).toBeLessThanOrEqual(0.1);
    const scopeTrack = view.$(".happy2-policy-control__field--scope [data-happy2-ui=switch-track]");
    const scopeThumb = view.$(".happy2-policy-control__field--scope [data-happy2-ui=switch-thumb]");
    expect(scopeTrack.bounds(), "scope track box").toMatchObject({ width: 36, height: 20 });
    expect(scopeTrack.computedStyle("background-color"), "scope on track fill").toBe(ACCENT);
    // Medium checked thumb: inset 2 + travel 16 = local left 18.
    expect(scopeThumb.bounds().x - scopeTrack.bounds().x, "scope thumb travel (checked)").toBe(18);
    // The thumb is a symmetric filled white circle inscribed in its own box, so
    // its ink reaches the box edges by design (no unclipped-edge guard here):
    // just require it paints and that its alpha centroid sits on the box center.
    const thumb = view.$(".happy2-policy-control__field--scope [data-happy2-ui=switch-thumb]");
    const thumbBox = thumb.bounds();
    const thumbInk = await thumb.visibleMetrics();
    expect(thumbInk.pixelCount, "scope thumb paints").toBeGreaterThan(0);
    expect(
        Math.abs(thumbInk.center.x - thumbBox.width / 2),
        "scope thumb centroid x",
    ).toBeLessThanOrEqual(0.4);
    expect(
        Math.abs(thumbInk.center.y - thumbBox.height / 2),
        "scope thumb centroid y",
    ).toBeLessThanOrEqual(0.4);

    // ---- Retention SegmentedControl + duration Select -----------------------
    const retSeg = view.$('[data-section="retention"] [data-happy2-ui="segmented-control"]');
    expect(retSeg.bounds().width, "retention segmented width").toBe(CONTENT_W);
    expect(retSeg.bounds().height, "retention segmented height").toBe(36);
    expect(retSeg.computedStyle("--happy2-segmented-index"), "retention selected index").toBe("2");
    expect(
        view
            .$(
                '[data-section="retention"] [data-value="duration"] [data-happy2-ui="segmented-control-label"]',
            )
            .computedStyle("color"),
        "retention active color",
    ).toBe(TEXT);
    expect(
        view
            .$(".happy2-policy-control__field--retention [data-happy2-ui=select-value]")
            .textMetrics().text,
        "retention select value",
    ).toBe("30 days");
    const retChevron =
        ".happy2-policy-control__field--retention [data-happy2-ui=select-chevron] svg";
    const retChevronDrift = await boxCentroid(view, retChevron);
    expect(Math.abs(retChevronDrift.dx), "retention chevron centroid x").toBeLessThanOrEqual(0.6);
    expect(Math.abs(retChevronDrift.dy), "retention chevron centroid y").toBeLessThanOrEqual(0.6);

    expect(["chromium", "firefox", "webkit"], "engine tag resolves").toContain(engine());

    await view.screenshot("PolicyControl.test");
}, 120_000);

it("reveals conditional rows only for the matching expiry and retention modes", async () => {
    const view = createRenderer();

    // Off: segmented only — no timer Select, no scope Switch, no retention.
    view.render(
        () => (
            <div style={{ width: `${CARD_W}px` }}>
                <PolicyControl afterReadScope="any_reader" data-testid="p-off" expiryMode="none" />
            </div>
        ),
        { width: 460, height: 200, padding: 24 },
    );
    // After sending + retention "forever": timer shows, scope hidden, retention
    // section shows but its duration Select stays hidden (mode ≠ duration).
    view.render(
        () => (
            <div style={{ width: `${CARD_W}px` }}>
                <PolicyControl
                    afterReadScope="any_reader"
                    data-testid="p-send"
                    expiryMode="after_send"
                    retentionMode="forever"
                    selfDestructSeconds={300}
                />
            </div>
        ),
        { width: 460, height: 420, padding: 24 },
    );
    // After reading + retention "duration": every conditional row is present.
    view.render(
        () => (
            <div style={{ width: `${CARD_W}px` }}>
                <PolicyControl
                    afterReadScope="all_readers"
                    data-testid="p-read"
                    expiryMode="after_read"
                    retentionMode="duration"
                    retentionSeconds={7776000}
                    selfDestructSeconds={604800}
                />
            </div>
        ),
        { width: 460, height: 580, padding: 24 },
    );
    await view.ready();

    const has = (testid: string, selector: string) =>
        view.container.querySelector(`[data-testid="${testid}"] ${selector}`) !== null;

    // Off: no conditional rows and no retention section/rule at all.
    expect(has("p-off", '[data-happy2-ui="select"]'), "off has no Select").toBe(false);
    expect(has("p-off", '[data-happy2-ui="switch"]'), "off has no Switch").toBe(false);
    expect(has("p-off", '[data-section="retention"]'), "off has no retention").toBe(false);
    expect(has("p-off", '[data-happy2-ui="policy-control-rule"]'), "off has no rule").toBe(false);
    expect(
        view
            .$('[data-testid="p-off"] [data-happy2-ui="segmented-control"]')
            .computedStyle("--happy2-segmented-index"),
        "off segmented index",
    ).toBe("0");

    // After sending: timer Select present, scope Switch absent.
    expect(
        has("p-send", '[data-section="expiry"] [data-happy2-ui="select"]'),
        "send has timer Select",
    ).toBe(true);
    expect(has("p-send", '[data-happy2-ui="switch"]'), "send has no scope Switch").toBe(false);
    // Retention section present, but duration Select hidden for "forever".
    expect(has("p-send", '[data-section="retention"]'), "send has retention section").toBe(true);
    expect(
        has("p-send", '[data-section="retention"] [data-happy2-ui="select"]'),
        "send retention has no duration Select",
    ).toBe(false);
    expect(
        view
            .$(
                '[data-testid="p-send"] [data-section="retention"] [data-happy2-ui="segmented-control"]',
            )
            .computedStyle("--happy2-segmented-index"),
        "send retention index (forever)",
    ).toBe("1");

    // After reading: timer + scope + retention duration all present.
    expect(
        has("p-read", '[data-section="expiry"] [data-happy2-ui="select"]'),
        "read has timer Select",
    ).toBe(true);
    expect(
        has("p-read", '[data-section="expiry"] [data-happy2-ui="switch"]'),
        "read has scope Switch",
    ).toBe(true);
    expect(
        has("p-read", '[data-section="retention"] [data-happy2-ui="select"]'),
        "read has retention duration Select",
    ).toBe(true);
    // The scope switch reflects all_readers = checked.
    expect(
        view
            .$('[data-testid="p-read"] [data-happy2-ui="switch"]')
            .element.getAttribute("aria-checked"),
        "read scope switch checked",
    ).toBe("true");

    await view.screenshot("PolicyControl.states.test");
}, 120_000);
