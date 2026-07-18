import "./styles.css";
import { expect, it } from "vitest";
import { page, server } from "vitest/browser";
import { KeyCap } from "./Badge";
import { Button } from "./Button";
import { createRenderer } from "./testing";
import { SearchField, TitleBar, WindowDragRegion } from "./TitleBar";

/*
 * The title bar is desktop window chrome, so this suite verifies it at the
 * reference 1360px window width. The viewport is pinned explicitly so the
 * fixtures (and the element captures optical assertions depend on) can never
 * be clipped by a viewport another test file left behind.
 */
async function pinViewport() {
    await page.viewport(1600, 1600);
}

function appRegion(style: (property: string) => string) {
    const unprefixed = style("app-region");
    return unprefixed === "" ? style("-webkit-app-region") : unprefixed;
}

function userSelect(style: (property: string) => string) {
    const unprefixed = style("user-select");
    return unprefixed === "" ? style("-webkit-user-select") : unprefixed;
}

it("holds TitleBar geometry: 38px contract, grid lanes, drag chrome", async () => {
    await pinViewport();
    const view = createRenderer();

    view.render(
        () => (
            <TitleBar
                leading={<span data-testid="crumb">Acme Studio</span>}
                onSearchChange={() => {}}
                searchPlaceholder="Search messages, issues, runs…"
                searchValue=""
                trailing={
                    <Button
                        aria-label="History"
                        data-testid="trail-btn"
                        icon="clock"
                        iconOnly
                        size="small"
                        variant="ghost"
                    />
                }
            />
        ),
        { width: 1360, height: 38 },
    );
    view.render(
        () => (
            <TitleBar
                onSearchChange={() => {}}
                searchValue=""
                showWindowControls
                trailing={<span data-testid="trail-mark">SK</span>}
            />
        ),
        { width: 640, height: 38 },
    );
    await view.ready();

    /* ---- Bar contract ------------------------------------------------- */

    const bar = view.$('[data-testid="crumb"]').element.closest("[data-happy2-ui='title-bar']")!;
    const root = view.$('[data-happy2-ui="title-bar"]:not([data-window-controls])');
    expect(root.element).toBe(bar);
    expect(root.element.tagName).toBe("HEADER");
    expect(root.bounds()).toEqual({ x: 0, y: 0, width: 1360, height: 38 });
    expect(
        root.computedStyles([
            "background-color",
            "border-bottom-width",
            "border-top-width",
            "box-sizing",
            "column-gap",
            "display",
            "font-size",
            "height",
            "line-height",
            "padding-bottom",
            "padding-left",
            "padding-right",
            "padding-top",
        ]),
    ).toEqual({
        // Transparent chrome over the window backdrop; no bottom hairline —
        // the title bar reads as one frame with the rail.
        "background-color": "rgba(0, 0, 0, 0)",
        "border-bottom-width": "0px",
        "border-top-width": "0px",
        "box-sizing": "border-box",
        "column-gap": "12px",
        // Three flex lanes: 1fr | 0 1 420px | 1fr. At 1360 the sides resolve to
        // 446px each (1360 - 24 padding - 24 gaps - 420 center = 892 → 446),
        // proven by the leading/center/trailing bounds asserted below.
        display: "flex",
        /* Deterministic chrome text metrics: bare slotted text must not ride
           each engine's `line-height: normal` guess (Gecko floated it ~1.2px
           lower than Blink before this was pinned). */
        "font-size": "13px",
        height: "38px",
        "line-height": "16px",
        "padding-bottom": "0px",
        "padding-left": "12px",
        "padding-right": "12px",
        "padding-top": "0px",
    });
    expect(root.textMetrics().font.family).toBe("happy2 Figtree, system-ui, sans-serif");

    const leading = view.$(
        '[data-happy2-ui="title-bar"]:not([data-window-controls]) [data-happy2-ui="title-bar-leading"]',
    );
    const trailing = view.$(
        '[data-happy2-ui="title-bar"]:not([data-window-controls]) [data-happy2-ui="title-bar-trailing"]',
    );
    expect(leading.bounds()).toEqual({ x: 12, y: 0, width: 446, height: 38 });
    expect(trailing.bounds()).toEqual({ x: 902, y: 0, width: 446, height: 38 });

    /* Bare slotted crumb text: the pinned 13px/16px line makes its box
       deterministic, and the lane centers that box exactly — 16px line in the
       38px lane → y 11. "Acme Studio" is a word label (asymmetric ink), so
       line-box symmetry is asserted exactly and the ink centroid only at the
       0.75px audit ceiling. Raw true-2x dy: cr +0.17, ff +0.67, wk +0.62 —
       Gecko/WebKit snap the baseline ~0.5px below Blink inside the pinned
       line; a per-engine nudge is not possible without styling arbitrary
       slotted user content, and no line-height pins all three tighter (17px
       fixes caps-heavy ink but pushes x-height-heavy ink past the ceiling
       in Gecko). */
    const crumb = view.$('[data-testid="crumb"]');
    expect(crumb.bounds().height).toBe(16);
    expect(crumb.bounds().y).toBe(11);
    expect(crumb.offsets().top + crumb.bounds().height / 2).toBe(19); // lane center
    const crumbInk = await crumb.visibleMetrics();
    expect(crumbInk.pixelCount).toBeGreaterThan(0);
    expect(
        Math.abs(crumbInk.center.y + crumb.bounds().y - 19),
        "crumb ink optical y",
    ).toBeLessThanOrEqual(0.75);

    /* Trailing content right-aligns against the 12px edge padding. */
    const trailButton = view.$('[data-testid="trail-btn"]');
    expect(trailButton.bounds().x + trailButton.bounds().width).toBe(1348);
    expect(trailButton.bounds().y).toBe(5); // (38 - 28) / 2 centered in the lane
    expect((await trailButton.visibleMetrics()).pixelCount).toBeGreaterThan(0);

    /* ---- Centered SearchField ----------------------------------------- */

    const field = view.$(
        '[data-happy2-ui="title-bar"]:not([data-window-controls]) [data-happy2-ui="search-field"]',
    );
    expect(field.bounds()).toEqual({ x: 470, y: 6, width: 420, height: 26 });
    const input = view.$(
        '[data-happy2-ui="title-bar"]:not([data-window-controls]) [data-happy2-ui="search-field-input"]',
    );
    expect(input.element.getAttribute("placeholder")).toBe("Search messages, issues, runs…");
    expect(input.element.getAttribute("aria-label")).toBe("Search messages, issues, runs…");

    /* ---- Drag regions (Chromium exposes app-region) -------------------- */

    if (server.browser === "chromium") {
        expect(appRegion((p) => root.computedStyle(p))).toBe("drag");
        expect(appRegion((p) => field.computedStyle(p))).toBe("no-drag");
        expect(appRegion((p) => trailButton.computedStyle(p))).toBe("no-drag");
    }

    /* ---- Traffic-light inset variant ----------------------------------- */

    const insetRoot = view.$('[data-happy2-ui="title-bar"][data-window-controls]');
    expect(insetRoot.bounds()).toEqual({ x: 0, y: 0, width: 640, height: 38 });
    expect(insetRoot.computedStyle("padding-left")).toBe("0px");
    /* 640 - 12 right padding - 24 gaps - 420 center = 184 → 92 per side. The
       flex lanes resolve to those widths (leading at x 0, trailing ending at the
       12px right pad), with the 420px center between them. */
    const insetLeading = view.$(
        '[data-happy2-ui="title-bar"][data-window-controls] [data-happy2-ui="title-bar-leading"]',
    );
    const insetCenter = view.$(
        '[data-happy2-ui="title-bar"][data-window-controls] [data-happy2-ui="title-bar-center"]',
    );
    const insetTrailing = view.$(
        '[data-happy2-ui="title-bar"][data-window-controls] [data-happy2-ui="title-bar-trailing"]',
    );
    expect(insetLeading.bounds()).toMatchObject({ x: 0, width: 92 });
    expect(insetCenter.bounds()).toMatchObject({ x: 104, width: 420 });
    expect(insetTrailing.bounds()).toMatchObject({ x: 536, width: 92 });

    const controls = view.$('[data-happy2-ui="title-bar-controls"]');
    expect(controls.bounds()).toEqual({ x: 0, y: 0, width: 78, height: 38 });
    expect(controls.element.getAttribute("aria-hidden")).toBe("true");
    if (server.browser === "chromium") {
        /* The reserved traffic-light strip must stay draggable. */
        expect(appRegion((p) => controls.computedStyle(p))).toBe("drag");
    }

    const insetField = view.$(
        '[data-happy2-ui="title-bar"][data-window-controls] [data-happy2-ui="search-field"]',
    );
    expect(insetField.bounds()).toEqual({ x: 104, y: 6, width: 420, height: 26 });

    /* Bare slotted text centers in the inset trailing lane the same way.
       "SK" is all-caps ink (baseline to cap height), so its centroid rides
       high of the box center by nature; raw true-2x dy: cr -0.65, ff -0.15,
       wk -0.19 — inside the audit ceiling in every engine. */
    const trailMark = view.$('[data-testid="trail-mark"]');
    expect(trailMark.bounds().height).toBe(16);
    expect(trailMark.offsets().top + trailMark.bounds().height / 2).toBe(19);
    const trailInk = await trailMark.visibleMetrics();
    expect(trailInk.pixelCount).toBeGreaterThan(0);
    expect(
        Math.abs(trailInk.center.y + trailMark.bounds().y - 19),
        "trail mark ink optical y",
    ).toBeLessThanOrEqual(0.75);

    await view.screenshot("TitleBar.test");
});

it("holds a transparent 38px drag overlay for full-window authentication states", async () => {
    await pinViewport();
    const view = createRenderer();

    view.render(
        () => (
            <div
                data-testid="auth-surface"
                style={{
                    background: "#17161c",
                    height: "120px",
                    position: "relative",
                    width: "720px",
                }}
            >
                <WindowDragRegion data-testid="auth-drag" />
            </div>
        ),
        { width: 720, height: 120 },
    );
    await view.ready();

    const surface = view.$('[data-testid="auth-surface"]');
    const drag = view.$('[data-testid="auth-drag"]');
    expect(surface.bounds()).toEqual({ x: 0, y: 0, width: 720, height: 120 });
    expect(drag.bounds()).toEqual({ x: 0, y: 0, width: 720, height: 38 });
    expect(drag.element.getAttribute("aria-hidden")).toBe("true");
    expect(
        drag.computedStyles([
            "background-color",
            "box-sizing",
            "height",
            "left",
            "position",
            "top",
            "width",
            "z-index",
        ]),
    ).toEqual({
        "background-color": "rgba(0, 0, 0, 0)",
        "box-sizing": "border-box",
        height: "38px",
        left: "0px",
        position: "absolute",
        top: "0px",
        width: "720px",
        "z-index": "1",
    });
    expect(userSelect((property) => drag.computedStyle(property))).toBe("none");
    if (server.browser === "chromium") {
        expect(appRegion((property) => drag.computedStyle(property))).toBe("drag");
    }

    await view.screenshot("WindowDragRegion.test");
});

it("holds SearchField geometry, colors, and optical centering", async () => {
    await pinViewport();
    const view = createRenderer();

    const well = (width: number): Record<string, string> => ({
        background: "#131217",
        boxSizing: "border-box",
        height: "100%",
        padding: "12px",
        width: `${width}px`,
    });
    view.render(
        () => (
            <div data-testid="fixed" style={well(444)}>
                <SearchField onChange={() => {}} value="ENG-482" width={420} />
            </div>
        ),
        { width: 444, height: 50 },
    );
    view.render(
        () => (
            <div data-testid="fluid" style={well(260)}>
                <SearchField
                    onChange={() => {}}
                    placeholder="Search runs…"
                    shortcutHint="⇧⌘P"
                    value=""
                />
            </div>
        ),
        { width: 260, height: 50 },
    );
    /* Parity pair: the same descender-heavy string once as the placeholder
       and once as the committed value, to prove the placeholder pipeline
       paints on the same baseline as real input text. Both fields share one
       surface row so their baselines sit at the same absolute device-pixel
       phase — otherwise per-row baseline snapping would leak into the
       comparison. */
    view.render(
        () => (
            <div style={{ ...well(884), display: "flex", gap: "20px" }}>
                <div data-testid="pair-ph">
                    <SearchField
                        onChange={() => {}}
                        placeholder="Search messages, issues, runs…"
                        value=""
                        width={420}
                    />
                </div>
                <div data-testid="pair-val">
                    <SearchField
                        onChange={() => {}}
                        value="Search messages, issues, runs…"
                        width={420}
                    />
                </div>
            </div>
        ),
        { width: 884, height: 50 },
    );
    /* Standalone KeyCap controls at the exact vertical phase of the in-field
       caps (cap top = 16px from the surface top: 12px well + 4px in-field
       inset) so the in-field glyph can be asserted differentially against
       the component that owns its tuning. */
    view.render(
        () => (
            <div
                style={{
                    alignItems: "flex-start",
                    background: "#131217",
                    boxSizing: "border-box",
                    display: "flex",
                    gap: "20px",
                    height: "100%",
                    padding: "16px 12px 12px",
                    width: "160px",
                }}
            >
                <div data-testid="cap-control-k" style={{ display: "flex" }}>
                    <KeyCap keys="⌘K" />
                </div>
                <div data-testid="cap-control-p" style={{ display: "flex" }}>
                    <KeyCap keys="⇧⌘P" />
                </div>
            </div>
        ),
        { width: 160, height: 50 },
    );
    await view.ready();

    /* ---- Fixed-width field --------------------------------------------- */

    const field = view.$('[data-testid="fixed"] [data-happy2-ui="search-field"]');
    expect(field.bounds()).toEqual({ x: 12, y: 12, width: 420, height: 26 });
    expect(
        field.computedStyles([
            "background-color",
            "border-bottom-width",
            "border-radius",
            "border-top-color",
            "border-top-width",
            "box-sizing",
            "column-gap",
            "display",
            "height",
            "padding-left",
            "padding-right",
        ]),
    ).toEqual({
        "background-color": "rgba(255, 255, 255, 0.05)",
        "border-bottom-width": "1px",
        "border-radius": "6px",
        "border-top-color": "rgba(255, 255, 255, 0.07)",
        "border-top-width": "1px",
        "box-sizing": "border-box",
        "column-gap": "8px",
        display: "flex",
        height: "26px",
        "padding-left": "8px",
        "padding-right": "3px",
    });

    /* Leading 14px search icon: 9px in, optically on the 13px center line
       and the 16px vertical (1 border + 8 pad + 14/2). Raw true-2x drift:
       cr (+0.04, +0.07), ff (+0.04, +0.07), wk (+0.04, +0.04) — no
       correction needed, so the tolerance stays at the audit ceiling. */
    const icon = view.$('[data-testid="fixed"] [data-happy2-ui="search-field-icon"]');
    const iconGlyph = view.$('[data-testid="fixed"] [data-happy2-ui="search-field-icon"] svg');
    expect(icon.bounds().x - field.bounds().x).toBe(9);
    expect(icon.bounds().y - field.bounds().y).toBe(6);
    expect(iconGlyph.bounds().width).toBe(14);
    expect(iconGlyph.bounds().height).toBe(14);
    expect(icon.computedStyle("color")).toBe("rgb(117, 112, 133)");
    const iconVisible = await iconGlyph.visibleMetrics();
    expect(iconVisible.pixelCount).toBeGreaterThan(0);
    expect(
        Math.abs(iconVisible.center.x + (iconGlyph.bounds().x - field.bounds().x) - 16),
        "search icon optical x",
    ).toBeLessThanOrEqual(0.75);
    expect(
        Math.abs(iconVisible.center.y + (iconGlyph.bounds().y - field.bounds().y) - 13),
        "search icon optical y",
    ).toBeLessThanOrEqual(0.75);

    /* Real input, 12px ui text on the 24px inner lane. */
    const input = view.$('[data-testid="fixed"] [data-happy2-ui="search-field-input"]');
    expect(input.element.tagName).toBe("INPUT");
    expect((input.element as HTMLInputElement).value).toBe("ENG-482");
    expect(input.bounds().height).toBe(24);
    expect(input.bounds().y - field.bounds().y).toBe(1); // 24px lane centered in 26
    expect(input.bounds().x - field.bounds().x).toBe(31); // 1 + 8 + 14 + 8
    expect(
        input.computedStyles([
            "background-color",
            "border-top-width",
            "color",
            "font-size",
            "font-weight",
            "letter-spacing",
            "line-height",
            "padding-left",
            "padding-top",
        ]),
    ).toEqual({
        "background-color": "rgba(0, 0, 0, 0)",
        "border-top-width": "0px",
        color: "rgb(237, 234, 242)",
        "font-size": "12px",
        "font-weight": "500",
        "letter-spacing": "normal",
        "line-height": "24px",
        "padding-left": "0px",
        "padding-top": "0px",
    });
    expect(input.textMetrics().font.family).toBe("happy2 Figtree, system-ui, sans-serif");
    /* Vertical-only centroid: input text is left-aligned by design, so the
       horizontal centroid is meaningless. Caps/digits content is vertically
       symmetric; raw true-2x dy: cr -0.18, ff +0.32, wk -0.26 — all inside
       the 0.4px tuning target, no correction needed. */
    const inputVisible = await input.visibleMetrics();
    expect(inputVisible.pixelCount).toBeGreaterThan(0);
    expect(
        Math.abs(inputVisible.center.y + (input.bounds().y - field.bounds().y) - 13),
        "value text optical y",
    ).toBeLessThanOrEqual(0.75);

    /* Trailing KeyCap hint: 18px cap, 5px from the right edge, cap box
       centered on the field's 13px line. */
    const cap = view.$('[data-testid="fixed"] [data-happy2-ui="key-cap"]');
    expect(cap.bounds().height).toBe(18);
    expect(cap.bounds().y - field.bounds().y).toBe(4);
    /* WebKit reports the cap's intrinsic width fractionally (4.999); the
       contract is the 5px inset, so round the measurement. */
    expect(
        Math.round(field.bounds().x + field.bounds().width - (cap.bounds().x + cap.bounds().width)),
    ).toBe(4);
    expect(cap.element.getAttribute("aria-label")).toBe("⌘K");
    /* Cap glyph ink. Intra-cap glyph centering is owned and tuned by
       Badge.test.tsx (KeyCap's own optical corrections live in badge.css),
       so asserting an absolute centroid here would double-own that tuning.
       The field-level contract is differential: the in-field cap must paint
       its glyph exactly where a standalone KeyCap at the same vertical
       phase paints it — SearchField adds zero drift of its own. Both cap
       line boxes are 18px, so raw centroids compare directly. Raw true-2x
       in-field dy vs the 13px line (with Badge corrections zeroed):
       cr -0.78, ff +0.23, wk -0.16 — the chromium figure is Blink's mono
       baseline inside the 18px cap line, Badge's to correct. A 1.5px gross
       ceiling still catches catastrophic misplacement field-side. The
       parity is vertical-only: the cap's intrinsic mono width is fractional
       (22.031px), so the right-aligned in-field label starts at fractional
       x while the control starts at integer x — element captures clip at
       device pixels, which shifts the apparent horizontal centroid by the
       fractional part (~0.93px of pure capture phase, measured against
       identical ink). The field's horizontal contract is the exact 5px cap
       inset asserted above; intra-cap horizontal ink is Badge-owned. */
    const capLabel = view.$('[data-testid="fixed"] [data-happy2-ui="key-cap-label"]');
    const capControl = view.$('[data-testid="cap-control-k"] [data-happy2-ui="key-cap-label"]');
    expect(capControl.bounds().height).toBe(10);
    expect(capControl.bounds().y).toBe(capLabel.bounds().y); // same vertical phase
    const capInk = await capLabel.visibleMetrics();
    const capControlInk = await capControl.visibleMetrics();
    expect(capInk.pixelCount).toBeGreaterThan(0);
    expect(capControlInk.pixelCount).toBeGreaterThan(0);
    expect(
        Math.abs(capInk.center.y - capControlInk.center.y),
        "key-cap glyph parity y vs standalone KeyCap",
    ).toBeLessThanOrEqual(0.4);
    expect(
        Math.abs(capInk.center.y + (capLabel.bounds().y - field.bounds().y) - 13),
        "key-cap glyph gross optical y",
    ).toBeLessThanOrEqual(1.5);

    /* ---- Fluid field, custom hint, painted placeholder ------------------ */

    const fluid = view.$('[data-testid="fluid"] [data-happy2-ui="search-field"]');
    expect(fluid.bounds()).toEqual({ x: 12, y: 12, width: 236, height: 26 });
    const fluidCapLabel = view.$('[data-testid="fluid"] [data-happy2-ui="key-cap-label"]');
    expect(
        view
            .$('[data-testid="fluid"] [data-happy2-ui="key-cap"]')
            .element.getAttribute("aria-label"),
    ).toBe("⇧⌘P");
    /* Custom hint glyphs get the same vertical-only differential parity
       check against a standalone ⇧⌘P KeyCap at the same vertical phase
       (raw true-2x in-field dy with Badge corrections zeroed: cr -0.92,
       ff +0.05, wk -0.33; horizontal skipped for the same fractional-width
       capture-phase reason as the ⌘K cap above). */
    const fluidCapControl = view.$(
        '[data-testid="cap-control-p"] [data-happy2-ui="key-cap-label"]',
    );
    expect(fluidCapControl.bounds().y).toBe(fluidCapLabel.bounds().y);
    const fluidCapInk = await fluidCapLabel.visibleMetrics();
    const fluidCapControlInk = await fluidCapControl.visibleMetrics();
    expect(fluidCapInk.pixelCount).toBeGreaterThan(0);
    expect(fluidCapControlInk.pixelCount).toBeGreaterThan(0);
    expect(
        Math.abs(fluidCapInk.center.y - fluidCapControlInk.center.y),
        "custom key-cap glyph parity y vs standalone KeyCap",
    ).toBeLessThanOrEqual(0.4);
    const placeholderInput = view.$('[data-testid="fluid"] [data-happy2-ui="search-field-input"]');
    expect(placeholderInput.element.getAttribute("placeholder")).toBe("Search runs…");
    expect((await placeholderInput.visibleMetrics()).pixelCount).toBeGreaterThan(0);

    /* ---- Placeholder baseline parity ------------------------------------ */

    /* The placeholder string is a word label with descenders and low
       punctuation, so its ink centroid sits naturally below the box center
       (~+1.2px) — that is typographically correct, not drift. The honest
       assertion is parity: the placeholder must paint on exactly the same
       baseline as the identical committed value. Raw true-2x delta:
       cr 0.006, ff 0.008, wk 0.049. */
    const pairPh = view.$('[data-testid="pair-ph"] [data-happy2-ui="search-field-input"]');
    const pairVal = view.$('[data-testid="pair-val"] [data-happy2-ui="search-field-input"]');
    const pairPhInk = await pairPh.visibleMetrics();
    const pairValInk = await pairVal.visibleMetrics();
    expect(pairPhInk.pixelCount).toBeGreaterThan(0);
    expect(pairValInk.pixelCount).toBeGreaterThan(0);
    expect(
        Math.abs(
            pairPhInk.center.y + pairPh.bounds().y - (pairValInk.center.y + pairVal.bounds().y),
        ),
        "placeholder vs value baseline parity",
    ).toBeLessThanOrEqual(0.4);

    await view.screenshot("SearchField.test");
});

it("holds SearchField focus treatment and long-content truncation", async () => {
    await pinViewport();
    const view = createRenderer();

    const well = (width: number): Record<string, string> => ({
        background: "#131217",
        boxSizing: "border-box",
        height: "100%",
        padding: "12px",
        width: `${width}px`,
    });
    view.render(
        () => (
            <div data-testid="focus" style={well(444)}>
                <SearchField
                    onChange={() => {}}
                    placeholder="Search messages, issues, runs…"
                    value=""
                    width={420}
                />
            </div>
        ),
        { width: 444, height: 50 },
    );
    /* Long committed value in a narrow field: the input must truncate. */
    view.render(
        () => (
            <div data-testid="long-value" style={well(224)}>
                <SearchField
                    onChange={() => {}}
                    value="Umbrella incident retrospective action items for Q3"
                    width={200}
                />
            </div>
        ),
        { width: 224, height: 50 },
    );
    /* Long placeholder in the same narrow field. */
    view.render(
        () => (
            <div data-testid="long-ph" style={well(224)}>
                <SearchField
                    onChange={() => {}}
                    placeholder="Search every message, issue, agent run, and document…"
                    value=""
                    width={200}
                />
            </div>
        ),
        { width: 224, height: 50 },
    );
    await view.ready();

    /* ---- Focused state --------------------------------------------------- */

    const field = view.$('[data-testid="focus"] [data-happy2-ui="search-field"]');
    const input = view.$('[data-testid="focus"] [data-happy2-ui="search-field-input"]');
    /* Resting hairline first… */
    expect(field.computedStyle("border-top-color")).toBe("rgba(255, 255, 255, 0.07)");
    expect(field.computedStyle("outline-style")).toBe("none");

    (input.element as HTMLInputElement).focus();
    /* Keep the regenerated baseline PNG caret-blink-proof. */
    (input.element as HTMLInputElement).style.caretColor = "transparent";
    /* Outlast the 120ms border-color transition before reading styles. */
    await new Promise<void>((resolve) => setTimeout(resolve, 250));

    expect(document.activeElement).toBe(input.element);
    /* Focus swaps the hairline for border-strong plus the accent ring. */
    expect(
        field.computedStyles([
            "border-top-color",
            "outline-color",
            "outline-offset",
            "outline-style",
            "outline-width",
        ]),
    ).toEqual({
        "border-top-color": "rgba(255, 255, 255, 0.13)",
        "outline-color": "rgb(168, 155, 255)",
        "outline-offset": "1px",
        "outline-style": "solid",
        "outline-width": "2px",
    });
    /* The ring is paint-only: geometry must not shift. */
    expect(field.bounds()).toEqual({ x: 12, y: 12, width: 420, height: 26 });
    expect((await input.visibleMetrics()).pixelCount).toBeGreaterThan(0);

    await view.screenshot("SearchField.focus");
    (input.element as HTMLInputElement).blur();
    await new Promise<void>((resolve) => setTimeout(resolve, 250));
    expect(field.computedStyle("outline-style")).toBe("none");
    expect(field.computedStyle("border-top-color")).toBe("rgba(255, 255, 255, 0.07)");

    /* ---- Long value truncates inside the 200px field --------------------- */

    const longField = view.$('[data-testid="long-value"] [data-happy2-ui="search-field"]');
    const longInput = view.$('[data-testid="long-value"] [data-happy2-ui="search-field-input"]');
    const longCap = view.$('[data-testid="long-value"] [data-happy2-ui="key-cap"]');
    expect(longField.bounds()).toEqual({ x: 12, y: 12, width: 200, height: 26 });
    expect(longInput.computedStyle("min-width")).toBe("0px");
    /* The overflow is real: layout clips the value instead of growing. */
    expect(longInput.element.scrollWidth).toBeGreaterThan(longInput.element.clientWidth);
    /* …and the trailing KeyCap keeps its full size and 5px inset. */
    expect(longCap.bounds().height).toBe(18);
    expect(longCap.bounds().width).toBeGreaterThan(20);
    expect(
        Math.round(
            longField.bounds().x +
                longField.bounds().width -
                (longCap.bounds().x + longCap.bounds().width),
        ),
    ).toBe(4);
    expect((await longInput.visibleMetrics()).pixelCount).toBeGreaterThan(0);

    /* ---- Long placeholder stays inside the same envelope ------------------ */

    const phField = view.$('[data-testid="long-ph"] [data-happy2-ui="search-field"]');
    const phInput = view.$('[data-testid="long-ph"] [data-happy2-ui="search-field-input"]');
    expect(phField.bounds()).toEqual({ x: 12, y: 12, width: 200, height: 26 });
    expect(phInput.bounds().height).toBe(24);
    expect(
        phInput.bounds().x + phInput.bounds().width,
        "input stays left of the key cap",
    ).toBeLessThanOrEqual(view.$('[data-testid="long-ph"] [data-happy2-ui="key-cap"]').bounds().x);
    expect((await phInput.visibleMetrics()).pixelCount).toBeGreaterThan(0);

    await view.screenshot("SearchField.truncation");
});

it("reports SearchField input and submit through callbacks", async () => {
    await pinViewport();
    const changes: string[] = [];
    const submits: string[] = [];
    const view = createRenderer().render(
        () => (
            <div style={{ background: "#131217", padding: "12px" }}>
                <SearchField
                    onChange={(value) => changes.push(value)}
                    onSubmit={(value) => submits.push(value)}
                    value=""
                    width={300}
                />
            </div>
        ),
        { width: 324, height: 50 },
    );
    await view.ready();

    const input = view.$('[data-happy2-ui="search-field-input"]').element as HTMLInputElement;
    /* Editable wells accept typing. */
    expect(input.readOnly).toBe(false);
    input.value = "deploy checklist";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    expect(changes).toEqual(["deploy checklist"]);

    input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
    expect(submits).toEqual(["deploy checklist"]);

    input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "a" }));
    expect(submits).toEqual(["deploy checklist"]);
});

it("opens as a read-only well through click and Enter/Space in opener mode", async () => {
    await pinViewport();
    const opens: number[] = [];
    const changes: string[] = [];
    const view = createRenderer().render(
        () => (
            <div style={{ background: "#131217", padding: "12px" }}>
                <SearchField
                    onOpen={() => opens.push(1)}
                    placeholder="Search Happy (2)…"
                    value="ENG-482"
                    width={300}
                />
            </div>
        ),
        { width: 324, height: 50 },
    );
    await view.ready();

    const input = view.$('[data-happy2-ui="search-field-input"]').element as HTMLInputElement;
    /* An opener well is read-only chrome — it displays the value but never edits. */
    expect(input.readOnly).toBe(true);
    expect(input.value).toBe("ENG-482");

    /* Click opens; input events never leak a change (there is no onChange). */
    input.click();
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    expect(opens).toEqual([1]);
    expect(changes).toEqual([]);

    /* Enter and Space open; other keys do not. */
    input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
    input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: " " }));
    expect(opens).toEqual([1, 1, 1]);
    input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "a" }));
    expect(opens).toEqual([1, 1, 1]);
});
