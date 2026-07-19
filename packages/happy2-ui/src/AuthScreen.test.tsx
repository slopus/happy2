import { expect, it } from "vitest";
import { server } from "vitest/browser";
import "./theme.css";
import "./styles/auth-screen.css";
import "./styles/icon.css";
import { AuthScreen } from "./AuthScreen";
import { Icon } from "./Icon";
import { createRenderer, type RenderedElement } from "./testing";

type Renderer = ReturnType<typeof createRenderer>;

const fontFamily = () =>
    server.browser === "webkit"
        ? "happy2 Figtree, system-ui, sans-serif"
        : '"happy2 Figtree", system-ui, sans-serif';

/*
 * Alpha-weighted ink centroid of `partSelector` (a painted glyph with no
 * optical nudge of its own), expressed as an offset from the center of
 * `hostSelector` (positive = right / low). Refuses a blank or clipped capture:
 * the part must paint pixels and its ink may not touch any edge of the captured
 * box, so a truncated screenshot can never pass silently.
 */
async function glyphDrift(view: Renderer, hostSelector: string, partSelector: string) {
    const host = view.$(hostSelector);
    const part = view.$(partSelector);
    const visible = await part.visibleMetrics();
    expect(visible.pixelCount, `${partSelector} paints no pixels`).toBeGreaterThan(0);
    const pb = part.bounds();
    expect(visible.bounds.x, `${partSelector} ink clipped left`).toBeGreaterThan(0);
    expect(visible.bounds.y, `${partSelector} ink clipped top`).toBeGreaterThan(0);
    expect(
        visible.bounds.x + visible.bounds.width,
        `${partSelector} ink clipped right`,
    ).toBeLessThan(pb.width);
    expect(
        visible.bounds.y + visible.bounds.height,
        `${partSelector} ink clipped bottom`,
    ).toBeLessThan(pb.height);
    const hb = host.bounds();
    return {
        dx: visible.center.x + pb.x - hb.x - hb.width / 2,
        dy: visible.center.y + pb.y - hb.y - hb.height / 2,
    };
}

/* Asserts a text part paints and its ink stays inside its own line box (never a
 * blank or vertically clipped capture). */
async function paints(part: RenderedElement<Element>, name: string) {
    const vis = await part.visibleMetrics();
    expect(vis.pixelCount, `${name} paints no pixels`).toBeGreaterThan(0);
    const box = part.bounds();
    expect(vis.bounds.y, `${name} ink clipped at top`).toBeGreaterThan(0);
    expect(vis.bounds.y + vis.bounds.height, `${name} ink clipped at bottom`).toBeLessThanOrEqual(
        box.height,
    );
    return vis;
}

it("holds AuthScreen split geometry, panel layout, typography, and optical brand glyph", async () => {
    const view = createRenderer();

    view.render(
        () => (
            <AuthScreen
                brand={{ name: "Relay" }}
                copy="Reach your channels, agents, and threads across the workspace."
                data-testid="auth"
                footer={<span data-testid="auth-foot">Need an invite?</span>}
                kicker="Welcome back"
                title="Sign in to Relay"
            >
                <div data-testid="auth-form-child" style={{ height: "44px" }}>
                    form
                </div>
            </AuthScreen>
        ),
        { width: 1024, height: 704 },
    );
    await view.ready();

    /* ---- Root: full-window dark shell ---------------------------------- */

    const root = view.$('[data-testid="auth"]');
    expect(root.element.tagName).toBe("DIV");
    expect(root.bounds()).toMatchObject({ x: 0, y: 0, width: 1024, height: 704 });
    expect(root.element.getAttribute("data-state")).toBe("form");
    expect(
        root.computedStyles([
            "background-color",
            "box-sizing",
            "color",
            "display",
            "font-family",
            "overflow-x",
            "overflow-y",
        ]),
    ).toEqual({
        "background-color": "rgb(255, 255, 255)",
        "box-sizing": "border-box",
        color: "rgb(0, 0, 0)",
        display: "flex",
        "font-family": fontFamily(),
        "overflow-x": "hidden",
        "overflow-y": "hidden",
    });

    /* ---- Two-column split: fluid hero + fixed 480 panel ---------------- */

    const hero = view.$('[data-happy2-ui="auth-hero"]');
    const panel = view.$('[data-happy2-ui="auth-panel"]');
    expect(hero.bounds()).toMatchObject({ x: 0, y: 0, width: 544, height: 704 });
    expect(panel.bounds()).toMatchObject({ x: 544, y: 0, width: 480, height: 704 });
    expect(hero.offsets()).toMatchObject({ left: 0, top: 0, bottom: 0 });
    expect(panel.offsets()).toMatchObject({ left: 544, right: 0, top: 0, bottom: 0 });

    /* Hero paints the brand-gradient fallback (no backgroundUrl), a transparent
     * base color, and carries the 1px seam hairline on its right edge. */
    expect(hero.element.getAttribute("data-has-image")).toBeNull();
    const heroBg = hero.computedStyle("background-image");
    expect(heroBg).not.toBe("none");
    expect(heroBg).toContain("linear-gradient");
    expect(
        hero.computedStyles([
            "background-color",
            "background-size",
            "border-right-color",
            "border-right-width",
        ]),
    ).toEqual({
        "background-color": "rgba(0, 0, 0, 0)",
        "background-size": "cover",
        "border-right-color": "rgb(234, 234, 234)",
        "border-right-width": "1px",
    });

    /* Panel: fixed 480 column, 48px inset, solid app surface. */
    expect(
        panel.computedStyles([
            "background-color",
            "box-sizing",
            "display",
            "flex-direction",
            "padding-bottom",
            "padding-left",
            "padding-right",
            "padding-top",
            "width",
        ]),
    ).toEqual({
        "background-color": "rgb(245, 245, 245)",
        "box-sizing": "border-box",
        display: "flex",
        "flex-direction": "column",
        "padding-bottom": "48px",
        "padding-left": "48px",
        "padding-right": "48px",
        "padding-top": "48px",
        width: "480px",
    });

    /* ---- Brand mast ---------------------------------------------------- */

    const brand = view.$('[data-happy2-ui="auth-brand"]');
    const mark = view.$('[data-happy2-ui="auth-mark"]');
    const brandName = view.$('[data-happy2-ui="auth-brand-name"]');
    expect(brand.offsets()).toMatchObject({ left: 48, top: 48 });
    expect(brand.height()).toBe(28); /* tallest child = 28px mark */
    expect(mark.bounds()).toMatchObject({ width: 28, height: 28 });
    expect(mark.offsets().left).toBe(0);
    expect(mark.computedStyles(["border-radius", "box-sizing", "color", "display"])).toEqual({
        "border-radius": "8px",
        "box-sizing": "border-box",
        color: "rgb(255, 255, 255)",
        display: "flex",
    });
    expect(mark.computedStyle("background-image")).toContain("linear-gradient");
    /* Wordmark sits after the 28px mark + 12px gap. */
    expect(brandName.offsets().left).toBe(40);
    expect(brandName.computedStyle("color")).toBe("rgb(0, 0, 0)");
    const nameMetrics = brandName.textMetrics();
    expect(nameMetrics.text).toBe("Relay");
    expect(nameMetrics.font).toMatchObject({
        family: "happy2 Figtree, system-ui, sans-serif",
        letterSpacing: -0.15,
        lineHeight: 20,
        size: 15,
        weight: "700",
    });
    await paints(brandName, "brand name");

    /* Brand mark glyph (default spark) optically centered in the 28px chip. The
     * spark is bilaterally symmetric, so it holds the tuned 0.4px. */
    const markGlyph = await glyphDrift(
        view,
        '[data-happy2-ui="auth-mark"]',
        '[data-happy2-ui="auth-mark"] svg',
    );
    expect(Math.abs(markGlyph.dx), "mark glyph horizontal centroid").toBeLessThanOrEqual(0.4);
    expect(Math.abs(markGlyph.dy), "mark glyph vertical centroid").toBeLessThanOrEqual(0.4);

    /* ---- Content block: 384 measure, vertically centered --------------- */

    const content = view.$('[data-happy2-ui="auth-content"]');
    const kicker = view.$('[data-happy2-ui="auth-kicker"]');
    const title = view.$('[data-happy2-ui="auth-title"]');
    const copy = view.$('[data-happy2-ui="auth-copy"]');
    const form = view.$('[data-happy2-ui="auth-form"]');
    expect(content.offsets().left).toBe(48);
    expect(content.width()).toBe(384);
    expect(kicker.width()).toBe(384);
    expect(title.width()).toBe(384);
    expect(form.width()).toBe(384);
    expect(kicker.offsets().left).toBe(0);
    expect(title.offsets().left).toBe(0);
    expect(form.offsets().left).toBe(0);

    /* Kicker: uppercase accent eyebrow. */
    expect(
        kicker.computedStyles([
            "color",
            "font-size",
            "font-weight",
            "letter-spacing",
            "line-height",
            "text-transform",
        ]),
    ).toEqual({
        color: "rgb(0, 122, 255)",
        "font-size": "12px",
        "font-weight": "700",
        "letter-spacing": "0.96px",
        "line-height": "16px",
        "text-transform": "uppercase",
    });
    await paints(kicker, "kicker");

    /* Title: large Figtree, single line box = line-height 34. Left-aligned, so
     * centering is proven by baseline + unclipped ink (not a centroid). */
    expect(title.element.tagName).toBe("H1");
    expect(title.height()).toBe(34);
    expect(title.computedStyle("color")).toBe("rgb(0, 0, 0)");
    const titleMetrics = title.textMetrics();
    expect(titleMetrics.text).toBe("Sign in to Relay");
    expect(titleMetrics.font).toMatchObject({
        family: "happy2 Figtree, system-ui, sans-serif",
        letterSpacing: -0.56,
        lineHeight: 34,
        size: 28,
        weight: "700",
    });
    /* Baseline lands inside the line box, sharing the same box for every engine. */
    expect(titleMetrics.baseline.fromElementTop).toBeGreaterThan(0);
    expect(titleMetrics.baseline.fromElementTop).toBeLessThan(34);
    await paints(title, "title");

    /* Copy: secondary body, capped to a 320px measure. */
    expect(copy.width()).toBe(320);
    expect(copy.computedStyles(["color", "font-size", "font-weight", "line-height"])).toEqual({
        color: "rgb(142, 142, 147)",
        "font-size": "15px",
        "font-weight": "400",
        "line-height": "22px",
    });
    await paints(copy, "copy");

    /* Vertical rhythm inside the content stack: kicker→title 12px, title→copy
     * 14px, copy→form 32px (margins do not collapse in a flex column). */
    expect(title.offsets().top - (kicker.offsets().top + kicker.height())).toBe(12);
    expect(copy.offsets().top - (title.offsets().top + title.height())).toBe(14);
    expect(form.offsets().top - (copy.offsets().top + copy.height())).toBe(32);

    /* Content stack is vertically centered between the 32px content pads. */
    const topGap = kicker.offsets().top - 32;
    const bottomGap = content.height() - (form.offsets().top + form.height()) - 32;
    expect(Math.abs(topGap - bottomGap), "content vertical centering").toBeLessThanOrEqual(0.6);

    /* Form slot hosts the app children and stretches to the 384 measure. */
    const formChild = view.$('[data-testid="auth-form-child"]');
    expect(formChild.height()).toBe(44);
    expect(form.computedStyle("margin-top")).toBe("32px");

    /* ---- Footer pinned to the bottom inset ----------------------------- */

    const footer = view.$('[data-happy2-ui="auth-footer"]');
    expect(footer.offsets()).toMatchObject({ left: 48, right: 48, bottom: 48 });
    expect(footer.computedStyles(["color", "font-size", "line-height"])).toEqual({
        color: "rgb(142, 142, 147)",
        "font-size": "13px",
        "line-height": "18px",
    });
    await paints(footer, "footer");

    await view.screenshot("AuthScreen.test");
}, 120_000);

it("holds AuthScreen loading, generated-image hero, custom mark, and minimal forms", async () => {
    const view = createRenderer();

    view.render(
        () => (
            <AuthScreen
                brand={{ name: "Relay" }}
                copy="Reach your channels, agents, and threads."
                data-testid="loading"
                kicker="Welcome back"
                loadingLabel="Signing you in…"
                state="loading"
                title="Sign in to Relay"
            >
                <div data-testid="loading-form-child">form</div>
            </AuthScreen>
        ),
        /* Variant surfaces are 400px tall: stacking three 704px full-window
         * surfaces makes the shared render container ~4320 device px, which
         * trips a Playwright tall-capture tiling glitch (blank tiles). The split
         * geometry is height-independent, so a shorter surface keeps the saved
         * PNG clean without weakening any assertion. */
        { width: 1024, height: 400 },
    );
    view.render(
        () => (
            <AuthScreen
                backgroundUrl="data:image/svg+xml;utf8,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='8'%20height='8'%3E%3Crect%20width='8'%20height='8'%20fill='%238b7cf7'/%3E%3C/svg%3E"
                brand={{
                    mark: <Icon color="var(--happy2-text-on-accent)" name="zap" size={16} />,
                    name: "Relay",
                }}
                data-testid="image"
                title="Create your workspace"
            >
                <div data-testid="image-form-child" style={{ height: "40px" }}>
                    form
                </div>
            </AuthScreen>
        ),
        { width: 1024, height: 400 },
    );
    view.render(
        () => (
            <AuthScreen data-testid="minimal" title="Enter your access code">
                <div data-testid="minimal-form-child" style={{ height: "40px" }}>
                    form
                </div>
            </AuthScreen>
        ),
        { width: 1024, height: 400 },
    );
    await view.ready();

    /* ---- Loading: deterministic static ring + label replaces the form --- */

    const loadingRoot = view.$('[data-testid="loading"]');
    expect(loadingRoot.element.getAttribute("data-state")).toBe("loading");
    /* The form slot is replaced by the loader: children are not rendered. */
    expect(
        view.container.querySelector('[data-testid="loading-form-child"]'),
        "form children hidden while loading",
    ).toBeNull();

    const loader = view.$('[data-testid="loading"] [data-happy2-ui="auth-loader"]');
    expect(loader.computedStyles(["align-items", "display"])).toEqual({
        "align-items": "center",
        display: "flex",
    });

    const spinner = view.$('[data-testid="loading"] [data-happy2-ui="auth-spinner"]');
    expect(spinner.bounds()).toMatchObject({ width: 20, height: 20 });
    expect(
        spinner.computedStyles([
            "border-radius",
            "border-top-color",
            "border-top-width",
            "border-left-color",
            "box-sizing",
        ]),
    ).toEqual({
        "border-radius": "999px",
        "border-top-color": "rgb(0, 122, 255)",
        "border-top-width": "2px",
        "border-left-color": "rgb(209, 209, 214)",
        "box-sizing": "border-box",
    });
    /* Static ring paints an unclipped, geometrically centered contour (the
     * accent arc makes the alpha centroid intentionally asymmetric, so the
     * symmetric outer visible-bounds center is asserted instead). */
    const ring = await spinner.visibleMetrics();
    expect(ring.pixelCount, "spinner paints no pixels").toBeGreaterThan(0);
    const sb = spinner.bounds();
    expect(ring.bounds.x, "ring clipped left").toBeGreaterThanOrEqual(0);
    expect(ring.bounds.y, "ring clipped top").toBeGreaterThanOrEqual(0);
    expect(ring.bounds.x + ring.bounds.width, "ring clipped right").toBeLessThanOrEqual(sb.width);
    expect(ring.bounds.y + ring.bounds.height, "ring clipped bottom").toBeLessThanOrEqual(
        sb.height,
    );
    expect(
        Math.abs(ring.bounds.x + ring.bounds.width / 2 - sb.width / 2),
        "ring x center",
    ).toBeLessThanOrEqual(0.75);
    expect(
        Math.abs(ring.bounds.y + ring.bounds.height / 2 - sb.height / 2),
        "ring y center",
    ).toBeLessThanOrEqual(0.75);

    const loadingLabel = view.$('[data-testid="loading"] [data-happy2-ui="auth-loading-label"]');
    expect(loadingLabel.offsets().left).toBe(32); /* 20px ring + 12px gap */
    expect(
        loadingLabel.computedStyles(["color", "font-size", "font-weight", "line-height"]),
    ).toEqual({
        color: "rgb(142, 142, 147)",
        "font-size": "14px",
        "font-weight": "500",
        "line-height": "20px",
    });
    expect(loadingLabel.textMetrics().text).toBe("Signing you in…");
    await paints(loadingLabel, "loading label");

    /* ---- Generated-image hero + custom brand mark ---------------------- */

    const imageHero = view.$('[data-testid="image"] [data-happy2-ui="auth-hero"]');
    expect(imageHero.element.getAttribute("data-has-image")).toBe("");
    const imageBg = imageHero.computedStyle("background-image");
    expect(imageBg).toContain("data:image");
    expect(imageBg).not.toContain("linear-gradient"); /* the URL overrides the gradient fallback */
    expect(imageHero.computedStyle("background-size")).toBe("cover");

    /* Custom mark: the app-supplied glyph renders in place of the default spark,
     * still inside the 28px chip. */
    const customMark = view.$('[data-testid="image"] [data-happy2-ui="auth-mark"]');
    expect(customMark.bounds()).toMatchObject({ width: 28, height: 28 });
    const customSvg = customMark.element.querySelector("svg");
    expect(customSvg?.getAttribute("data-name")).toBe("zap");

    /* ---- Minimal: title + form slot only ------------------------------- */

    const minimal = view.$('[data-testid="minimal"]');
    expect(
        minimal.element.querySelector('[data-happy2-ui="auth-brand"]'),
        "no brand mast",
    ).toBeNull();
    expect(minimal.element.querySelector('[data-happy2-ui="auth-kicker"]'), "no kicker").toBeNull();
    expect(minimal.element.querySelector('[data-happy2-ui="auth-copy"]'), "no copy").toBeNull();
    expect(minimal.element.querySelector('[data-happy2-ui="auth-footer"]'), "no footer").toBeNull();
    const minimalTitle = view.$('[data-testid="minimal"] [data-happy2-ui="auth-title"]');
    expect(minimalTitle.textMetrics().text).toBe("Enter your access code");
    expect(minimalTitle.width()).toBe(384);
    await paints(minimalTitle, "minimal title");
    /* Minimal panel keeps the fixed 480 split. */
    expect(view.$('[data-testid="minimal"] [data-happy2-ui="auth-panel"]').width()).toBe(480);

    await view.screenshot("AuthScreen.variants.test");
}, 120_000);
