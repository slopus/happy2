import { expect, it } from "vitest";
import "./theme.css";
import "./styles/icon.css";
import "./styles/button.css";
import "./styles/empty-state.css";
import { EmptyState } from "./EmptyState";
import { createRenderer, RenderedElement } from "./testing";

/*
 * EmptyState is a centered composition: a symmetric icon medallion (the only
 * strictly-centroid-tested part, since the composed Icon glyph is bilaterally
 * balanced by its own path data) plus a title / description / action that are
 * word labels. Per the optical policy, word labels are asserted for line-box
 * symmetry and clean (unclipped, painting) ink, NOT forced to a vertical
 * centroid target — their painted mass follows the specific glyphs. Geometry,
 * computed-style contract, and colors are asserted exactly in all three
 * engines; the medallion glyph centroid is held to the tuned 0.4px budget.
 */

const noop = () => {};

/* Tuned centroid budget for the balanced medallion glyph (contract ceiling
 * 0.75); Icon path data already measures |drift| <= 0.4px in every engine. */
const ICON_TOL = 0.4;

/*
 * Alpha-weighted ink centroid of `part`, expressed in `box`-relative CSS px.
 * Refuses blank or clipped captures: the part must paint pixels, and its ink
 * must sit inside its own border box (a truncated capture can never pass).
 */
async function ink(part: RenderedElement<Element>, box: RenderedElement<Element>, name: string) {
    const vis = await part.visibleMetrics();
    const p = part.bounds();
    expect(vis.pixelCount, `${name} paints no pixels`).toBeGreaterThan(0);
    expect(vis.bounds.width, `${name} ink too narrow`).toBeGreaterThan(p.width * 0.2);
    expect(vis.bounds.height, `${name} ink too short`).toBeGreaterThan(p.height * 0.1);
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

/* Absolute difference between a part's left and right gap inside `root`: the
 * deterministic centering proof for content-width word labels. */
function symmetry(part: RenderedElement<Element>, root: RenderedElement<Element>) {
    const p = part.bounds();
    const r = root.bounds();
    const left = p.x - r.x;
    const right = r.x + r.width - p.x - p.width;
    return Math.abs(left - right);
}

it("holds panel EmptyState geometry, medallion centering, and typography", async () => {
    const view = createRenderer();

    view.render(
        () => (
            <EmptyState
                action={{ icon: "edit", label: "Start a conversation", onClick: noop }}
                data-testid="es-panel-full"
                description="Messages you send here will show up in this space."
                icon="inbox"
                size="panel"
                title="No messages yet"
            />
        ),
        // padding 0 so the panel root fills the surface exactly (integer box).
        { width: 420, height: 360, padding: 0 },
    );
    view.render(
        () => (
            <EmptyState
                data-testid="es-panel-min"
                icon="search"
                size="panel"
                title="No results found"
            />
        ),
        { width: 420, height: 360, padding: 0 },
    );
    await view.ready();

    /* ---- Root contract: fills the surface, centered flex column ---------- */

    const root = view.$('[data-testid="es-panel-full"]');
    expect(root.element.tagName).toBe("DIV");
    expect(root.element.getAttribute("data-size")).toBe("panel");
    expect(root.bounds()).toEqual({ x: 0, y: 0, width: 420, height: 360 });
    expect(
        root.computedStyles([
            "align-items",
            "box-sizing",
            "color",
            "display",
            "flex-direction",
            "justify-content",
            "padding",
            "text-align",
        ]),
    ).toEqual({
        "align-items": "center",
        "box-sizing": "border-box",
        color: "rgb(117, 112, 133)",
        display: "flex",
        "flex-direction": "column",
        "justify-content": "center",
        padding: "40px 32px",
        "text-align": "center",
    });

    /* ---- Icon medallion: 48px box, horizontally centered ------------------ */

    const media = view.$('[data-testid="es-panel-full"] [data-rigged-ui="empty-state-media"]');
    expect(media.bounds().width).toBe(48);
    expect(media.bounds().height).toBe(48);
    expect(media.bounds().x - root.bounds().x).toBe(186); /* (420 - 64 - 48) / 2 + 32 */
    expect(symmetry(media, root), "medallion horizontal centering").toBeLessThanOrEqual(0.5);
    expect(
        media.computedStyles([
            "background-color",
            "border-radius",
            "border-top-color",
            "border-top-width",
            "box-sizing",
            "color",
        ]),
    ).toEqual({
        "background-color": "rgba(255, 255, 255, 0.05)",
        "border-radius": "10px",
        "border-top-color": "rgba(255, 255, 255, 0.07)",
        "border-top-width": "1px",
        "box-sizing": "border-box",
        color: "rgb(165, 160, 176)",
    });

    /* Icon box centered in the medallion by integer inset (48 → 20 → 14). */
    const icon = view.$(
        '[data-testid="es-panel-full"] [data-rigged-ui="empty-state-media"] [data-rigged-ui="icon"]',
    );
    expect(icon.bounds().width).toBe(20);
    expect(icon.bounds().height).toBe(20);
    expect(icon.bounds().x - media.bounds().x, "icon box left inset").toBe(14);
    expect(icon.bounds().y - media.bounds().y, "icon box top inset").toBe(14);
    expect(icon.computedStyle("stroke")).toBe("rgb(165, 160, 176)");
    /* Balanced glyph: alpha centroid on the medallion center (24, 24). */
    const iconInk = await ink(icon, media, "panel medallion glyph");
    expect(Math.abs(iconInk.x - 24), "medallion glyph optical x").toBeLessThanOrEqual(ICON_TOL);
    expect(Math.abs(iconInk.y - 24), "medallion glyph optical y").toBeLessThanOrEqual(ICON_TOL);

    /* ---- Title: 15/20 700, bright, centered ------------------------------- */

    const title = view.$('[data-testid="es-panel-full"] [data-rigged-ui="empty-state-title"]');
    expect(title.element.tagName).toBe("H2");
    expect(title.bounds().y - media.bounds().y - media.bounds().height, "title top rhythm").toBe(
        16,
    );
    expect(title.textMetrics()).toMatchObject({
        font: {
            family: "Rigged Figtree, system-ui, sans-serif",
            letterSpacing: -0.15,
            lineHeight: 20,
            size: 15,
            weight: "700",
        },
        text: "No messages yet",
    });
    expect(title.computedStyle("color")).toBe("rgb(237, 234, 242)");
    expect(symmetry(title, root), "title horizontal centering").toBeLessThanOrEqual(0.5);
    expect((await title.visibleMetrics()).pixelCount, "title paints").toBeGreaterThan(0);

    /* ---- Description: 13/18 400, muted, centered -------------------------- */

    const description = view.$(
        '[data-testid="es-panel-full"] [data-rigged-ui="empty-state-description"]',
    );
    expect(description.element.tagName).toBe("P");
    expect(
        description.bounds().y - title.bounds().y - title.bounds().height,
        "description top rhythm",
    ).toBe(6);
    expect(description.textMetrics()).toMatchObject({
        font: { lineHeight: 18, size: 13, weight: "400" },
    });
    expect(description.computedStyle("color")).toBe("rgb(117, 112, 133)");
    expect(description.computedStyle("max-width")).toBe("320px");
    expect(symmetry(description, root), "description horizontal centering").toBeLessThanOrEqual(
        0.5,
    );
    expect((await description.visibleMetrics()).pixelCount, "description paints").toBeGreaterThan(
        0,
    );

    /* ---- Action: secondary medium Button, centered, painting -------------- */

    const actions = view.$('[data-testid="es-panel-full"] [data-rigged-ui="empty-state-actions"]');
    expect(
        actions.bounds().y - description.bounds().y - description.bounds().height,
        "action top rhythm",
    ).toBe(20);
    expect(symmetry(actions, root), "action horizontal centering").toBeLessThanOrEqual(0.5);
    const button = view.$('[data-testid="es-panel-full"] [data-rigged-ui="button"]');
    expect(button.element.tagName).toBe("BUTTON");
    expect(button.height()).toBe(36);
    expect(button.computedStyles(["background-color", "color"])).toEqual({
        "background-color": "rgb(36, 34, 43)",
        color: "rgb(237, 234, 242)",
    });
    expect(button.textMetrics().text).toBe("Start a conversation");
    expect((await button.visibleMetrics()).pixelCount, "button paints").toBeGreaterThan(0);

    /* ---- Vertical centering: the stack is centered in the panel ----------- */

    const topSpace = media.bounds().y - root.bounds().y;
    const bottomSpace =
        root.bounds().y + root.bounds().height - actions.bounds().y - actions.bounds().height;
    expect(Math.abs(topSpace - bottomSpace), "panel vertical centering").toBeLessThanOrEqual(0.6);

    /* ---- Minimal panel: icon + title only, no description/action --------- */

    const minRoot = view.$('[data-testid="es-panel-min"]');
    expect(minRoot.bounds()).toEqual({ x: 0, y: 0, width: 420, height: 360 });
    expect(
        view.container.querySelector(
            '[data-testid="es-panel-min"] [data-rigged-ui="empty-state-description"]',
        ),
        "minimal has no description",
    ).toBeNull();
    expect(
        view.container.querySelector('[data-testid="es-panel-min"] [data-rigged-ui="button"]'),
        "minimal has no action",
    ).toBeNull();
    const minMedia = view.$('[data-testid="es-panel-min"] [data-rigged-ui="empty-state-media"]');
    const minTitle = view.$('[data-testid="es-panel-min"] [data-rigged-ui="empty-state-title"]');
    expect(minMedia.bounds().width).toBe(48);
    expect(minTitle.bounds().y - minMedia.bounds().y - minMedia.bounds().height).toBe(16);
    expect(symmetry(minTitle, minRoot), "minimal title centering").toBeLessThanOrEqual(0.5);
    const minTop = minMedia.bounds().y - minRoot.bounds().y;
    const minBottom =
        minRoot.bounds().y +
        minRoot.bounds().height -
        minTitle.bounds().y -
        minTitle.bounds().height;
    expect(Math.abs(minTop - minBottom), "minimal vertical centering").toBeLessThanOrEqual(0.6);
    const minIcon = view.$(
        '[data-testid="es-panel-min"] [data-rigged-ui="empty-state-media"] [data-rigged-ui="icon"]',
    );
    const minIconInk = await ink(minIcon, minMedia, "minimal medallion glyph");
    expect(Math.abs(minIconInk.x - 24), "minimal glyph optical x").toBeLessThanOrEqual(ICON_TOL);
    expect(Math.abs(minIconInk.y - 24), "minimal glyph optical y").toBeLessThanOrEqual(ICON_TOL);

    await view.screenshot("EmptyState.test");
}, 120_000);

it("holds inline EmptyState sizing, rhythm, and action variants", async () => {
    const view = createRenderer();

    view.render(
        () => (
            <EmptyState
                action={{ icon: "plus", label: "New thread", onClick: noop }}
                data-testid="es-inline-full"
                description="Follow a thread to keep it here."
                icon="thread"
                size="inline"
                // Constrained to an even width so the medallion lands on an
                // integer x and the glyph centroid stays clean.
                style={{ width: "360px" }}
                title="No followed threads"
            />
        ),
        { width: 400, height: 260, padding: 20 },
    );
    view.render(
        () => (
            <EmptyState
                data-testid="es-inline-plain"
                description="Files shared here will appear in this list."
                icon="files"
                size="inline"
                title="No files shared"
            />
        ),
        { width: 400, height: 220, padding: 20 },
    );
    await view.ready();

    /* ---- Inline root: content-height block, 24px padding ------------------ */

    const root = view.$('[data-testid="es-inline-full"]');
    expect(root.element.getAttribute("data-size")).toBe("inline");
    expect(root.bounds().x).toBe(20);
    expect(root.bounds().y).toBe(20);
    expect(root.bounds().width).toBe(360);
    expect(root.computedStyles(["display", "flex-direction", "align-items", "padding"])).toEqual({
        "align-items": "center",
        display: "flex",
        "flex-direction": "column",
        padding: "24px",
    });

    /* ---- Inline medallion: 40px box, 18px glyph, centered ----------------- */

    const media = view.$('[data-testid="es-inline-full"] [data-rigged-ui="empty-state-media"]');
    expect(media.bounds().width).toBe(40);
    expect(media.bounds().height).toBe(40);
    expect(media.bounds().y - root.bounds().y, "medallion top padding").toBe(24);
    expect(media.bounds().x - root.bounds().x).toBe(160); /* (360 - 48 - 40) / 2 + 24 */
    expect(media.computedStyle("border-radius")).toBe("10px");
    const icon = view.$(
        '[data-testid="es-inline-full"] [data-rigged-ui="empty-state-media"] [data-rigged-ui="icon"]',
    );
    expect(icon.bounds().width).toBe(18);
    expect(icon.bounds().x - media.bounds().x, "icon box left inset").toBe(11); /* (40 - 18) / 2 */
    expect(icon.bounds().y - media.bounds().y, "icon box top inset").toBe(11);
    /* Balanced glyph on the 40px medallion center (20, 20). */
    const iconInk = await ink(icon, media, "inline medallion glyph");
    expect(Math.abs(iconInk.x - 20), "inline glyph optical x").toBeLessThanOrEqual(ICON_TOL);
    expect(Math.abs(iconInk.y - 20), "inline glyph optical y").toBeLessThanOrEqual(ICON_TOL);

    /* ---- Inline typography + rhythm --------------------------------------- */

    const title = view.$('[data-testid="es-inline-full"] [data-rigged-ui="empty-state-title"]');
    expect(title.bounds().y - media.bounds().y - media.bounds().height, "inline title rhythm").toBe(
        12,
    );
    expect(title.textMetrics()).toMatchObject({
        font: { lineHeight: 18, size: 14, weight: "700" },
        text: "No followed threads",
    });
    expect(title.computedStyle("color")).toBe("rgb(237, 234, 242)");
    expect(symmetry(title, root), "inline title centering").toBeLessThanOrEqual(0.5);

    const description = view.$(
        '[data-testid="es-inline-full"] [data-rigged-ui="empty-state-description"]',
    );
    expect(
        description.bounds().y - title.bounds().y - title.bounds().height,
        "inline description rhythm",
    ).toBe(4);
    expect(description.computedStyle("max-width")).toBe("280px");
    expect(description.textMetrics()).toMatchObject({ font: { lineHeight: 18, size: 13 } });
    expect(symmetry(description, root), "inline description centering").toBeLessThanOrEqual(0.5);
    expect(
        (await description.visibleMetrics()).pixelCount,
        "inline description paints",
    ).toBeGreaterThan(0);

    /* ---- Inline action: small (28px) Button ------------------------------- */

    const actions = view.$('[data-testid="es-inline-full"] [data-rigged-ui="empty-state-actions"]');
    expect(
        actions.bounds().y - description.bounds().y - description.bounds().height,
        "inline action rhythm",
    ).toBe(16);
    const button = view.$('[data-testid="es-inline-full"] [data-rigged-ui="button"]');
    expect(button.height()).toBe(28);
    expect(button.element.getAttribute("data-variant")).toBe("secondary");
    expect((await button.visibleMetrics()).pixelCount, "inline button paints").toBeGreaterThan(0);

    /* ---- Inline, no action: content-sized, description present, no button - */

    const plain = view.$('[data-testid="es-inline-plain"]');
    expect(plain.element.getAttribute("data-size")).toBe("inline");
    expect(
        view.container.querySelector('[data-testid="es-inline-plain"] [data-rigged-ui="button"]'),
        "no-action variant omits the button",
    ).toBeNull();
    const plainMedia = view.$(
        '[data-testid="es-inline-plain"] [data-rigged-ui="empty-state-media"]',
    );
    const plainTitle = view.$(
        '[data-testid="es-inline-plain"] [data-rigged-ui="empty-state-title"]',
    );
    const plainDesc = view.$(
        '[data-testid="es-inline-plain"] [data-rigged-ui="empty-state-description"]',
    );
    expect(plainMedia.bounds().width).toBe(40);
    expect(plainTitle.bounds().y - plainMedia.bounds().y - plainMedia.bounds().height).toBe(12);
    expect(plainDesc.bounds().y - plainTitle.bounds().y - plainTitle.bounds().height).toBe(4);
    /* Content-width root still centers the medallion above the text block. */
    expect(symmetry(plainMedia, plain), "plain medallion centering").toBeLessThanOrEqual(0.5);
    expect(symmetry(plainTitle, plain), "plain title centering").toBeLessThanOrEqual(0.5);
    const plainIcon = view.$(
        '[data-testid="es-inline-plain"] [data-rigged-ui="empty-state-media"] [data-rigged-ui="icon"]',
    );
    expect((await plainIcon.visibleMetrics()).pixelCount, "plain glyph paints").toBeGreaterThan(0);

    await view.screenshot("EmptyState.variants.test");
}, 120_000);
