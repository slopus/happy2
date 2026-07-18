import { type ReactNode } from "react";
import { expect, it } from "vitest";
import { server } from "vitest/browser";
import "./theme.css";
import "./styles/toolbar.css";
import "./styles/button.css";
import "./styles/icon.css";
import { Button } from "./Button";
import { createRenderer } from "./testing";
import { Toolbar } from "./Toolbar";
type Engine = "chromium" | "firefox" | "webkit";
const engine = () => server.browser as Engine;
/*
 * Per-engine ink lifts declared in styles/toolbar.css (see the correction
 * comment there). All values are exact 0.5px-at-2x device-pixel multiples;
 * this map guards that the @supports scopes resolve on the right engine and
 * nowhere else, and that CSS and test agree.
 */
const titleOpticalY: Record<Engine, string> = {
    chromium: "-1px",
    firefox: "-1.5px",
    webkit: "-0.5px",
};
const subtitleOpticalY: Record<Engine, string> = {
    chromium: "-1px",
    firefox: "-1.5px",
    webkit: "-0.5px",
};
/* Dark surface the toolbar is contracted against. Fills the padded render
   surface; visibleMetrics() overrides this ancestor to isolate ink, so it
   never colors a measurement. */
function stage(testid: string, children: ReactNode) {
    return (
        <div
            data-testid={testid}
            style={{
                background: "var(--happy2-bg-surface)",
                boxSizing: "border-box",
                height: "100%",
                width: "100%",
            }}
        >
            {children}
        </div>
    );
}
function trailing() {
    return (
        <>
            <Button aria-label="Filter" icon="filter" iconOnly size="small" variant="ghost" />
            <Button aria-label="More" icon="more" iconOnly size="small" variant="ghost" />
        </>
    );
}
type Renderer = ReturnType<typeof createRenderer>;
/*
 * Alpha-weighted ink centroid of a part, as a signed offset from its own
 * border-box center (positive dx = right, positive dy = low). visibleMetrics()
 * captures the stable render surface and scans the part's region, so a
 * fractional box origin never leaks half a pixel into the result.
 */
async function inkCentroid(view: Renderer, selector: string) {
    const part = view.$(selector);
    const visible = await part.visibleMetrics();
    const box = part.bounds();
    return {
        dx: visible.center.x - box.width / 2,
        dy: visible.center.y - box.height / 2,
        visible,
        box,
    };
}
it(
    "holds Toolbar geometry, typography, colors, and optical alignment",
    { timeout: 120000 },
    async () => {
        const view = createRenderer();
        view.render(
            () =>
                stage(
                    "s-full",
                    <Toolbar
                        search={{ value: "", onChange: () => {}, placeholder: "Filter members" }}
                        subtitle="24 people · 3 admins"
                        title="Members"
                        trailing={trailing()}
                    />,
                ),
            { width: 760, height: 80, padding: 16 },
        );
        view.render(() => stage("s-title", <Toolbar title="Audit log" />), {
            width: 420,
            height: 80,
            padding: 16,
        });
        view.render(
            () => stage("s-trailing", <Toolbar title="Integrations" trailing={trailing()} />),
            { width: 520, height: 80, padding: 16 },
        );
        view.render(
            () =>
                stage(
                    "s-search",
                    <Toolbar
                        search={{ value: "", onChange: () => {}, placeholder: "Search roles" }}
                        subtitle="Manage roles and access"
                        title="Members"
                    />,
                ),
            { width: 640, height: 80, padding: 16 },
        );
        view.render(
            () =>
                stage(
                    "s-leading",
                    <Toolbar
                        leading={
                            <Button
                                aria-label="Back"
                                icon="chevron-right"
                                iconOnly
                                size="small"
                                variant="ghost"
                            />
                        }
                        subtitle="Filtered view"
                        title="General"
                        trailing={trailing()}
                    />,
                ),
            { width: 520, height: 80, padding: 16 },
        );
        view.render(
            () =>
                stage(
                    "s-tall",
                    <Toolbar height={56} subtitle="Custom 56px height" title="Big header" />,
                ),
            { width: 420, height: 96, padding: 16 },
        );
        await view.ready();
        const root = (s: string) => view.$(`[data-testid="${s}"] [data-happy2-ui="toolbar"]`);
        const sel = (s: string, name: string) =>
            `[data-testid="${s}"] [data-happy2-ui="toolbar-${name}"]`;
        const part = (s: string, name: string) => view.$(sel(s, name));
        const fontFamily =
            server.browser === "webkit"
                ? "happy2 Figtree, system-ui, sans-serif"
                : '"happy2 Figtree", system-ui, sans-serif';
        /* Text ink: reject blank or clipped captures, then return centroid drift.
   The line boxes are comfortably taller than the ink, so its top and
   bottom must sit strictly inside the captured box. */
        async function textInk(s: string, name: string) {
            const c = await inkCentroid(view, sel(s, name));
            expect(c.visible.pixelCount, `${s} ${name} paints pixels`).toBeGreaterThan(0);
            expect(c.visible.bounds.y, `${s} ${name} ink clipped at top`).toBeGreaterThan(0);
            expect(
                c.visible.bounds.y + c.visible.bounds.height,
                `${s} ${name} ink clipped at bottom`,
            ).toBeLessThan(c.box.height);
            return c;
        }
        /* ---- Root contract (s-full, default 48px) --------------------------- */
        const rFull = root("s-full");
        expect(rFull.element.tagName).toBe("HEADER");
        expect(rFull.bounds()).toEqual({ x: 16, y: 16, width: 728, height: 48 });
        expect(
            rFull.computedStyles([
                "align-items",
                "background-color",
                "border-bottom-color",
                "border-bottom-style",
                "border-bottom-width",
                "box-sizing",
                "color",
                "display",
                "font-family",
                "height",
                "padding-left",
                "padding-right",
            ]),
        ).toEqual({
            "align-items": "center",
            "background-color": "rgba(0, 0, 0, 0)",
            "border-bottom-color": "rgba(255, 255, 255, 0.07)",
            "border-bottom-style": "solid",
            "border-bottom-width": "1px",
            "box-sizing": "border-box",
            color: "rgb(237, 234, 242)",
            display: "flex",
            "font-family": fontFamily,
            height: "48px",
            "padding-left": "16px",
            "padding-right": "16px",
        });
        /* Engine-scoped optical vars resolve on exactly this engine. */
        expect(rFull.computedStyle("--happy2-toolbar-title-optical-y")).toBe(
            titleOpticalY[engine()],
        );
        expect(rFull.computedStyle("--happy2-toolbar-subtitle-optical-y")).toBe(
            subtitleOpticalY[engine()],
        );
        /* ---- Title typography + optical centering --------------------------- */
        const title = part("s-full", "title");
        expect(title.element.textContent).toBe("Members");
        /* Left-aligned against the 16px content edge (no leading slot). */
        expect(title.bounds().x - rFull.bounds().x, "s-full title left edge").toBe(16);
        expect(title.bounds().height, "s-full title line box").toBe(20);
        /* Heading (20 + 16) is centered in the 47px lane: title top at 5.5. */
        expect(title.bounds().y - rFull.bounds().y, "s-full title top").toBe(5.5);
        expect(
            title.computedStyles([
                "color",
                "font-family",
                "font-size",
                "font-weight",
                "letter-spacing",
                "line-height",
            ]),
        ).toEqual({
            color: "rgb(237, 234, 242)",
            "font-family": fontFamily,
            "font-size": "15px",
            "font-weight": "700",
            "letter-spacing": "-0.15px",
            "line-height": "20px",
        });
        const titleMetrics = title.textMetrics();
        expect(titleMetrics.font.family).toBe("happy2 Figtree, system-ui, sans-serif");
        expect(titleMetrics.font.size).toBe(15);
        expect(titleMetrics.font.weight).toBe("700");
        expect(titleMetrics.font.lineHeight).toBe(20);
        /* "Members" is an asymmetric word run along x, so horizontal truth is the
   16px left edge above; only the vertical centroid is held to tolerance. */
        const titleInk = await textInk("s-full", "title");
        expect(Math.abs(titleInk.dy), "s-full title vertical centroid").toBeLessThanOrEqual(0.75);
        /* ---- Subtitle typography + optical centering ------------------------ */
        const subtitle = part("s-full", "subtitle");
        expect(subtitle.element.textContent).toBe("24 people · 3 admins");
        expect(subtitle.bounds().x - rFull.bounds().x, "s-full subtitle left edge").toBe(16);
        expect(subtitle.bounds().height, "s-full subtitle line box").toBe(16);
        expect(subtitle.bounds().y - rFull.bounds().y, "s-full subtitle top").toBe(25.5);
        expect(
            subtitle.computedStyles(["color", "font-size", "font-weight", "line-height"]),
        ).toEqual({
            color: "rgb(117, 112, 133)",
            "font-size": "12px",
            "font-weight": "500",
            "line-height": "16px",
        });
        const subtitleInk = await textInk("s-full", "subtitle");
        expect(Math.abs(subtitleInk.dy), "s-full subtitle vertical centroid").toBeLessThanOrEqual(
            0.75,
        );
        /* ---- Search well: geometry, tokens, and glyph centroid -------------- */
        const searchWell = part("s-full", "search");
        expect(searchWell.bounds().width, "search well width").toBe(220);
        expect(searchWell.bounds().height, "search well height").toBe(28);
        expect(
            searchWell.computedStyles([
                "background-color",
                "border-radius",
                "border-top-color",
                "border-top-width",
                "box-sizing",
            ]),
        ).toEqual({
            "background-color": "rgba(255, 255, 255, 0.05)",
            "border-radius": "6px",
            "border-top-color": "rgba(255, 255, 255, 0.07)",
            "border-top-width": "1px",
            "box-sizing": "border-box",
        });
        const searchIcon = part("s-full", "search-icon");
        expect(searchIcon.bounds().width, "search icon box").toBe(14);
        expect(searchIcon.bounds().height, "search icon box").toBe(14);
        expect(searchIcon.computedStyle("color")).toBe("rgb(117, 112, 133)");
        /* The search glyph is Icon-owned and must not be re-tuned here. Its true
   drift is <=0.4px, proven differentially against a calibration square in
   Icon.test.tsx; this absolute (un-calibrated) capture additionally carries
   the tester's element-origin quantization (~0.15px, measures dy 0.57),
   so — like the composed icons in ChannelHeader.test.tsx — it is held to
   the 0.75px composed-glyph ceiling on both axes. */
        const iconInk = await inkCentroid(view, sel("s-full", "search-icon"));
        expect(iconInk.visible.pixelCount, "search icon paints pixels").toBeGreaterThan(0);
        expect(Math.abs(iconInk.dx), "search icon optical x").toBeLessThanOrEqual(0.75);
        expect(Math.abs(iconInk.dy), "search icon optical y").toBeLessThanOrEqual(0.75);
        const searchInput = view.$(sel("s-full", "search-input"));
        expect((searchInput.element as HTMLInputElement).placeholder).toBe("Filter members");
        expect(
            searchInput.computedStyles(["color", "font-family", "font-size", "font-weight"]),
        ).toEqual({
            color: "rgb(237, 234, 242)",
            "font-family": fontFamily,
            "font-size": "13px",
            "font-weight": "500",
        });
        /* ---- Actions pinned right; trailing flush to the 16px content edge --- */
        const actions = part("s-full", "actions");
        const trailingSlot = part("s-full", "trailing");
        expect(
            trailingSlot.bounds().x + trailingSlot.bounds().width,
            "s-full trailing right edge",
        ).toBeCloseTo(rFull.bounds().x + rFull.bounds().width - 16, 3);
        /* Search sits left of the trailing slot inside the actions cluster. */
        expect(
            trailingSlot.bounds().x - (searchWell.bounds().x + searchWell.bounds().width),
            "search -> trailing gap",
        ).toBeCloseTo(8, 3);
        const fullButtons = view.container.querySelectorAll(
            `${sel("s-full", "trailing")} [data-happy2-ui="button"]`,
        );
        expect(fullButtons.length, "s-full trailing has two buttons").toBe(2);
        const firstButton = view.$(`${sel("s-full", "trailing")} [data-happy2-ui="button"]`);
        expect(firstButton.bounds().width).toBe(28);
        expect(firstButton.bounds().height).toBe(28);
        /* Actions cluster is vertically centered in the lane (28px control). */
        expect(actions.bounds().height).toBe(28);
        expect(actions.bounds().y - rFull.bounds().y).toBeCloseTo((47 - 28) / 2, 3);
        /* ---- Title only: title rides the exact lane center ------------------ */
        const rTitle = root("s-title");
        expect(rTitle.bounds()).toEqual({ x: 16, y: 16, width: 388, height: 48 });
        const soloTitle = part("s-title", "title");
        expect(soloTitle.element.textContent).toBe("Audit log");
        /* Single 20px line box centered in the 47px lane: (47 - 20) / 2. */
        expect(soloTitle.bounds().y - rTitle.bounds().y, "s-title title top").toBe(13.5);
        expect(soloTitle.bounds().x - rTitle.bounds().x, "s-title title left edge").toBe(16);
        expect(
            view.container.querySelectorAll(sel("s-title", "subtitle")).length,
            "s-title has no subtitle",
        ).toBe(0);
        expect(
            view.container.querySelectorAll(sel("s-title", "actions")).length,
            "s-title has no actions cluster",
        ).toBe(0);
        const soloTitleInk = await textInk("s-title", "title");
        expect(Math.abs(soloTitleInk.dy), "s-title title vertical centroid").toBeLessThanOrEqual(
            0.75,
        );
        /* ---- Trailing only: no search well, actions pin right --------------- */
        const rTrailing = root("s-trailing");
        const trailingOnly = part("s-trailing", "trailing");
        expect(
            trailingOnly.bounds().x + trailingOnly.bounds().width,
            "s-trailing right edge",
        ).toBeCloseTo(rTrailing.bounds().x + rTrailing.bounds().width - 16, 3);
        expect(
            view.container.querySelectorAll(sel("s-trailing", "search")).length,
            "s-trailing has no search well",
        ).toBe(0);
        /* ---- Search only: no trailing, well pins right --------------------- */
        const rSearch = root("s-search");
        const searchOnlyWell = part("s-search", "search");
        expect(searchOnlyWell.bounds().width).toBe(220);
        expect(
            searchOnlyWell.bounds().x + searchOnlyWell.bounds().width,
            "s-search well right edge",
        ).toBeCloseTo(rSearch.bounds().x + rSearch.bounds().width - 16, 3);
        expect(
            view.container.querySelectorAll(sel("s-search", "trailing")).length,
            "s-search has no trailing slot",
        ).toBe(0);
        const searchOnlyIconInk = await inkCentroid(view, sel("s-search", "search-icon"));
        expect(searchOnlyIconInk.visible.pixelCount, "s-search icon paints pixels").toBeGreaterThan(
            0,
        );
        expect(Math.abs(searchOnlyIconInk.dx), "s-search icon optical x").toBeLessThanOrEqual(0.75);
        expect(Math.abs(searchOnlyIconInk.dy), "s-search icon optical y").toBeLessThanOrEqual(0.75);
        /* ---- Leading slot: heading starts after the leading control -------- */
        const rLeading = root("s-leading");
        const leadingSlot = part("s-leading", "leading");
        expect(leadingSlot.bounds().x - rLeading.bounds().x, "s-leading left edge").toBe(16);
        const leadingButton = view.$(`${sel("s-leading", "leading")} [data-happy2-ui="button"]`);
        expect(leadingButton.bounds().width).toBe(28);
        const leadingTitle = part("s-leading", "title");
        /* Title clears the leading control (28px) plus the 12px header gap. */
        expect(
            leadingTitle.bounds().x - (leadingSlot.bounds().x + leadingSlot.bounds().width),
            "leading -> heading gap",
        ).toBeCloseTo(12, 3);
        const leadingTrailing = part("s-leading", "trailing");
        expect(
            leadingTrailing.bounds().x + leadingTrailing.bounds().width,
            "s-leading trailing right edge",
        ).toBeCloseTo(rLeading.bounds().x + rLeading.bounds().width - 16, 3);
        /* ---- Custom height: the `height` prop drives the box + lane --------- */
        const rTall = root("s-tall");
        expect(rTall.bounds().height, "s-tall height").toBe(56);
        expect(rTall.computedStyle("height")).toBe("56px");
        const tallTitle = part("s-tall", "title");
        const tallSubtitle = part("s-tall", "subtitle");
        /* Heading (36) centered in the 55px lane: title top (55 - 36) / 2 = 9.5. */
        expect(tallTitle.bounds().y - rTall.bounds().y, "s-tall title top").toBe(9.5);
        expect(tallSubtitle.bounds().y - rTall.bounds().y, "s-tall subtitle top").toBe(29.5);
        const tallTitleInk = await textInk("s-tall", "title");
        expect(Math.abs(tallTitleInk.dy), "s-tall title vertical centroid").toBeLessThanOrEqual(
            0.75,
        );
        window.scrollTo(0, 0);
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        await view.screenshot("Toolbar.test");
    },
);
