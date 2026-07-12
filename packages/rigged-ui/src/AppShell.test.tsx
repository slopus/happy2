import "./styles.css";
import type { JSX } from "solid-js";
import { expect, it } from "vitest";
import { page, server } from "vitest/browser";
import { AppShell } from "./AppShell";
import { createRenderer, type RenderedElement } from "./testing";

/*
 * Deterministic slot placeholders. Each slot paints a flat color so the
 * pixel probes and screenshots show exactly which region every slot occupies;
 * the rail and sidebar placeholders carry the contract widths that the real
 * Rail (76px) and Sidebar (288px) components own themselves.
 *
 * Luminance landmarks (averaged RGB) used by the probes below:
 *   window chrome  --rg-bg-chrome rgb(19,18,23)            ≈ 20
 *   card fill      slot content #1c1b22 rgb(28,27,34)      ≈ 30
 *   card hairline  rgba(255,255,255,0.07) over rgb(23,22,28) ≈ 40
 */
function slot(testid: string, style: JSX.CSSProperties = {}) {
    return (
        <div
            data-testid={testid}
            style={{
                "box-sizing": "border-box",
                height: "100%",
                width: "100%",
                ...style,
            }}
        />
    );
}

const titleBarSlot = (testid: string) => slot(testid, { background: "#131217", height: "38px" });
const railSlot = (testid: string) => slot(testid, { background: "#131217", width: "76px" });
const sidebarSlot = (testid: string) => slot(testid, { background: "#131217", width: "288px" });

const cardStyles = [
    "background-color",
    "border-bottom-color",
    "border-bottom-left-radius",
    "border-bottom-right-radius",
    "border-bottom-style",
    "border-bottom-width",
    "border-left-color",
    "border-left-style",
    "border-left-width",
    "border-right-color",
    "border-right-style",
    "border-right-width",
    "border-top-color",
    "border-top-left-radius",
    "border-top-right-radius",
    "border-top-style",
    "border-top-width",
    "box-sizing",
    "display",
    "flex-direction",
    "overflow-x",
    "overflow-y",
] as const;

const expectedCardStyles = {
    "background-color": "rgb(23, 22, 28)",
    "border-bottom-color": "rgba(255, 255, 255, 0.07)",
    "border-bottom-left-radius": "14px",
    "border-bottom-right-radius": "14px",
    "border-bottom-style": "solid",
    "border-bottom-width": "1px",
    "border-left-color": "rgba(255, 255, 255, 0.07)",
    "border-left-style": "solid",
    "border-left-width": "1px",
    "border-right-color": "rgba(255, 255, 255, 0.07)",
    "border-right-style": "solid",
    "border-right-width": "1px",
    "border-top-color": "rgba(255, 255, 255, 0.07)",
    "border-top-left-radius": "14px",
    "border-top-right-radius": "14px",
    "border-top-style": "solid",
    "border-top-width": "1px",
    "box-sizing": "border-box",
    display: "flex",
    "flex-direction": "column",
    "overflow-x": "hidden",
    "overflow-y": "hidden",
};

/* The card corner radius from the shell contract (--rg-radius-shell). */
const CARD_RADIUS = 14;

/* Element captures must be exact 2x — CaptureSanity.test.tsx guards this. */
const DEVICE_SCALE = 2;

/* Decodes an unclipped element capture into a device-pixel luminance probe. */
async function capturePixels(element: Element) {
    const base64 = await page.screenshot({ element, save: false });
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Unable to decode the element capture."));
    });
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas pixel analysis is unavailable.");
    context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, canvas.width, canvas.height);
    return {
        height: data.height,
        luminance(x: number, y: number) {
            const index = (y * data.width + x) * 4;
            return (data.data[index]! + data.data[index + 1]! + data.data[index + 2]!) / 3;
        },
        width: data.width,
    };
}

/*
 * Alpha-diff full-paint proof (visibleMetrics paints the ancestors black and
 * white and keeps only pixels the element itself painted).
 *
 * 1. The capture must be exactly 2x the CSS box — a viewport-clipped or
 *    iframe-downscaled capture (both past failure modes of this suite) fails
 *    immediately instead of corrupting the measurements downstream.
 * 2. Ink must exist (pixelCount > 0) and its bounding box must reach all
 *    four box edges.
 * 3. The unpainted-pixel budget is exact: square chrome surfaces paint wall
 *    to wall, radius-14 cards miss only the four corner cuts —
 *    4·(1−π/4)·(r·2)² ≈ 2692 device pixels, minus the partial-alpha arc ring
 *    that the alpha-diff still counts as painted.
 * 4. Solid fills are symmetric ink, so the alpha-weighted centroid must sit
 *    on the geometric box center; any interior blank region drags it off.
 *    (AppShell renders no glyphs — surface centroids are its optical truth.)
 */
async function expectFullyPainted(part: RenderedElement<Element>, label: string, cornerRadius = 0) {
    const bounds = part.bounds();
    const probe = await capturePixels(part.element);
    expect(probe.width, `${label}: unclipped 2x capture width`).toBe(
        Math.round(bounds.width * DEVICE_SCALE),
    );
    expect(probe.height, `${label}: unclipped 2x capture height`).toBe(
        Math.round(bounds.height * DEVICE_SCALE),
    );

    const visible = await part.visibleMetrics();
    expect(visible.pixelCount, `${label}: painted pixel count`).toBeGreaterThan(0);
    const ink = visible.bounds;
    expect(ink.x, `${label}: left edge painted`).toBeLessThanOrEqual(0.5);
    expect(ink.y, `${label}: top edge painted`).toBeLessThanOrEqual(0.5);
    expect(ink.width, `${label}: painted width`).toBeGreaterThanOrEqual(bounds.width - 1);
    expect(ink.height, `${label}: painted height`).toBeGreaterThanOrEqual(bounds.height - 1);

    const total = probe.width * probe.height;
    const missing = total - visible.pixelCount;
    if (cornerRadius > 0) {
        const cut = 4 * (1 - Math.PI / 4) * (cornerRadius * DEVICE_SCALE) ** 2;
        expect(missing, `${label}: corner-cut pixels`).toBeGreaterThan(cut * 0.55);
        expect(missing, `${label}: corner-cut pixels`).toBeLessThan(cut * 1.45);
    } else {
        expect(missing, `${label}: unpainted pixels`).toBeLessThanOrEqual(
            Math.max(16, total * 0.0005),
        );
    }

    const dx = visible.center.x - bounds.width / 2;
    const dy = visible.center.y - bounds.height / 2;
    expect(Math.abs(dx), `${label}: optical dx ${dx.toFixed(3)}`).toBeLessThanOrEqual(0.4);
    expect(Math.abs(dy), `${label}: optical dy ${dy.toFixed(3)}`).toBeLessThanOrEqual(0.4);
}

/*
 * Direct luminance proof of one inset card at exact 2x: the 1px
 * rgba(255,255,255,0.07) hairline occupies precisely the outermost two
 * device rows/columns of the card box (≈lum 40), the slot fill inside reads
 * ≈lum 30, and just inside each box corner — but outside the 14px arc — the
 * darker window chrome (≈lum 20) shows through the radius cut. Each edge is
 * sampled along the middle half of the edge so the corner arcs never bias
 * the profile. A blank (unpainted or clipped) region decodes as lum 0 and
 * fails every window below.
 */
async function expectCardHairline(card: RenderedElement<Element>, label: string) {
    const bounds = card.bounds();
    const pixels = await capturePixels(card.element);
    expect(pixels.width, `${label}: unclipped 2x capture width`).toBe(
        Math.round(bounds.width * DEVICE_SCALE),
    );

    const columnAverage = (x: number) => {
        const from = Math.round(pixels.height * 0.25);
        const to = Math.round(pixels.height * 0.75);
        let sum = 0;
        for (let y = from; y < to; y += 1) sum += pixels.luminance(x, y);
        return sum / (to - from);
    };
    const rowAverage = (y: number) => {
        const from = Math.round(pixels.width * 0.25);
        const to = Math.round(pixels.width * 0.75);
        let sum = 0;
        for (let x = from; x < to; x += 1) sum += pixels.luminance(x, y);
        return sum / (to - from);
    };

    const fill = pixels.luminance(Math.round(pixels.width / 2), Math.round(pixels.height / 2));
    expect(fill, `${label}: interior fill`).toBeGreaterThan(25);
    expect(fill, `${label}: interior fill`).toBeLessThan(35);

    // Hairline: outermost two device rows bright, interior back at fill.
    const edges = {
        bottom: {
            inner: (rowAverage(pixels.height - 4) + rowAverage(pixels.height - 5)) / 2,
            outer: (rowAverage(pixels.height - 1) + rowAverage(pixels.height - 2)) / 2,
        },
        left: {
            inner: (columnAverage(3) + columnAverage(4)) / 2,
            outer: (columnAverage(0) + columnAverage(1)) / 2,
        },
        right: {
            inner: (columnAverage(pixels.width - 4) + columnAverage(pixels.width - 5)) / 2,
            outer: (columnAverage(pixels.width - 1) + columnAverage(pixels.width - 2)) / 2,
        },
        top: {
            inner: (rowAverage(3) + rowAverage(4)) / 2,
            outer: (rowAverage(0) + rowAverage(1)) / 2,
        },
    };
    for (const [edge, profile] of Object.entries(edges)) {
        const detail = `${label}: ${edge} hairline outer ${profile.outer.toFixed(1)} inner ${profile.inner.toFixed(1)}`;
        expect(profile.outer, detail).toBeGreaterThan(34);
        expect(profile.outer, detail).toBeLessThan(47);
        expect(profile.outer, detail).toBeGreaterThan(profile.inner + 5);
        expect(profile.inner, `${detail} (interior not blank)`).toBeGreaterThan(25);
        expect(profile.inner, `${detail} (interior not blank)`).toBeLessThan(35);
    }

    // Radius cut: 2 CSS px inside each box corner is ~3px outside the 14px
    // arc, so the darker window chrome must show through at all four corners.
    const inset = 2 * DEVICE_SCALE;
    const corners = {
        "bottom-left": pixels.luminance(inset, pixels.height - 1 - inset),
        "bottom-right": pixels.luminance(pixels.width - 1 - inset, pixels.height - 1 - inset),
        "top-left": pixels.luminance(inset, inset),
        "top-right": pixels.luminance(pixels.width - 1 - inset, inset),
    };
    for (const [corner, lum] of Object.entries(corners)) {
        expect(lum, `${label}: ${corner} radius cut shows chrome`).toBeGreaterThan(15);
        expect(lum, `${label}: ${corner} radius cut shows chrome`).toBeLessThan(25);
        expect(lum, `${label}: ${corner} radius cut darker than fill`).toBeLessThan(fill - 4);
    }
}

/* Full pixel truth for one card: paint coverage, corner cuts, hairline. */
async function expectCardPixels(card: RenderedElement<Element>, label: string) {
    await expectFullyPainted(card, label, CARD_RADIUS);
    await expectCardHairline(card, label);
}

it("holds the inset main and panel card geometry at the 1024×704 window contract", async () => {
    const view = createRenderer()
        .render(
            () => (
                <AppShell
                    data-testid="shell-full"
                    panel={slot("full-panel", { background: "#1c1b22" })}
                    rail={railSlot("full-rail")}
                    sidebar={sidebarSlot("full-sidebar")}
                    titleBar={titleBarSlot("full-title-bar")}
                >
                    {slot("full-main", { background: "#1c1b22" })}
                </AppShell>
            ),
            { width: 1024, height: 704 },
        )
        .render(
            () => (
                <AppShell
                    data-testid="shell-bare"
                    rail={railSlot("bare-rail")}
                    titleBar={titleBarSlot("bare-title-bar")}
                >
                    {slot("bare-main", { background: "#1c1b22" })}
                </AppShell>
            ),
            { width: 1024, height: 704 },
        );
    await view.ready();

    const fontFamily =
        server.browser === "webkit"
            ? "Rigged Figtree, system-ui, sans-serif"
            : '"Rigged Figtree", system-ui, sans-serif';

    // Root fills the exact minimum window and is chrome-colored.
    const root = view.$('[data-testid="shell-full"]');
    expect(root.bounds()).toEqual({ x: 0, y: 0, width: 1024, height: 704 });
    expect(
        root.computedStyles([
            "background-color",
            "box-sizing",
            "color",
            "display",
            "flex-direction",
            "font-family",
            "min-height",
            "min-width",
            "overflow-x",
        ]),
    ).toEqual({
        "background-color": "rgb(19, 18, 23)",
        "box-sizing": "border-box",
        color: "rgb(237, 234, 242)",
        display: "flex",
        "flex-direction": "column",
        "font-family": fontFamily,
        "min-height": "704px",
        "min-width": "1024px",
        "overflow-x": "hidden",
    });

    // Row composition: title bar, then rail | sidebar | content.
    expect(view.$('[data-rigged-ui="app-shell-title-bar"]').bounds()).toEqual({
        x: 0,
        y: 0,
        width: 1024,
        height: 38,
    });
    expect(view.$('[data-rigged-ui="app-shell-body"]').bounds()).toEqual({
        x: 0,
        y: 38,
        width: 1024,
        height: 666,
    });
    expect(view.$('[data-rigged-ui="app-shell-rail"]').bounds()).toEqual({
        x: 0,
        y: 38,
        width: 76,
        height: 666,
    });
    expect(view.$('[data-rigged-ui="app-shell-sidebar"]').bounds()).toEqual({
        x: 76,
        y: 38,
        width: 288,
        height: 666,
    });

    // The content region owns the 8px inset contract: 8px outer edges and an
    // 8px gap between the two cards.
    const content = view.$('[data-rigged-ui="app-shell-content"]');
    expect(content.bounds()).toEqual({ x: 364, y: 38, width: 660, height: 666 });
    expect(
        content.computedStyles([
            "column-gap",
            "padding-bottom",
            "padding-left",
            "padding-right",
            "padding-top",
        ]),
    ).toEqual({
        "column-gap": "8px",
        "padding-bottom": "8px",
        "padding-left": "8px",
        "padding-right": "8px",
        "padding-top": "8px",
    });

    // Main card: inset 8px on every side, panel + gap reserved at the right.
    const main = view.$('[data-testid="shell-full"] [data-rigged-ui="app-shell-main"]');
    expect(main.bounds()).toEqual({ x: 372, y: 46, width: 296, height: 650 });
    expect(main.offsets()).toEqual({ top: 8, right: 356, bottom: 8, left: 8 });
    expect(main.computedStyles(cardStyles)).toEqual(expectedCardStyles);

    // Panel card: default 340px wide, same treatment, 8px off the right edge.
    const panel = view.$('[data-testid="shell-full"] [data-rigged-ui="app-shell-panel"]');
    expect(panel.bounds()).toEqual({ x: 676, y: 46, width: 340, height: 650 });
    expect(panel.offsets()).toEqual({ top: 8, right: 8, bottom: 8, left: 312 });
    expect(panel.computedStyles(cardStyles)).toEqual(expectedCardStyles);

    // Slot content mounts inside the card, clipped past the 1px hairline.
    expect(view.$('[data-testid="full-main"]').bounds()).toEqual({
        x: 373,
        y: 47,
        width: 294,
        height: 648,
    });
    expect(view.$('[data-testid="full-panel"]').bounds()).toEqual({
        x: 677,
        y: 47,
        width: 338,
        height: 648,
    });

    // Without sidebar and panel the single card takes the full 8px-inset area.
    const bareMain = view.$('[data-testid="shell-bare"] [data-rigged-ui="app-shell-main"]');
    expect(
        view.$('[data-testid="shell-bare"] [data-rigged-ui="app-shell-content"]').bounds(),
    ).toEqual({ x: 76, y: 38, width: 948, height: 666 });
    expect(bareMain.bounds()).toEqual({ x: 84, y: 46, width: 932, height: 650 });
    expect(bareMain.offsets()).toEqual({ top: 8, right: 8, bottom: 8, left: 8 });

    // Pixel truth: both whole 1024×704 windows and every chrome slot paint
    // wall to wall, and each card paints its full box with the corner cut
    // and a live hairline on all four sides — including the bottom edges at
    // y=696 that the old 400×600 viewport captured blank.
    await expectFullyPainted(root, "full shell root");
    await expectFullyPainted(view.$('[data-testid="shell-bare"]'), "bare shell root");
    await expectFullyPainted(view.$('[data-testid="full-title-bar"]'), "title bar slot");
    await expectFullyPainted(view.$('[data-testid="full-rail"]'), "rail slot");
    await expectFullyPainted(view.$('[data-testid="full-sidebar"]'), "sidebar slot");
    await expectCardPixels(main, "full main card");
    await expectCardPixels(panel, "full panel card");
    await expectCardPixels(bareMain, "bare main card");

    await view.screenshot("AppShell.test");
});

it("keeps the 8px rhythm at larger windows and honors panelWidth", async () => {
    const view = createRenderer().render(
        () => (
            <AppShell
                data-testid="shell-large"
                panel={slot("large-panel", { background: "#1c1b22" })}
                panelWidth={300}
                rail={railSlot("large-rail")}
                sidebar={sidebarSlot("large-sidebar")}
                titleBar={titleBarSlot("large-title-bar")}
            >
                {slot("large-main", { background: "#1c1b22" })}
            </AppShell>
        ),
        { width: 1280, height: 800 },
    );
    await view.ready();

    expect(view.$('[data-testid="shell-large"]').bounds()).toEqual({
        x: 0,
        y: 0,
        width: 1280,
        height: 800,
    });
    expect(view.$('[data-rigged-ui="app-shell-body"]').bounds()).toEqual({
        x: 0,
        y: 38,
        width: 1280,
        height: 762,
    });
    expect(view.$('[data-rigged-ui="app-shell-content"]').bounds()).toEqual({
        x: 364,
        y: 38,
        width: 916,
        height: 762,
    });

    // The main card absorbs all extra width; the panel stays at panelWidth.
    const main = view.$('[data-rigged-ui="app-shell-main"]');
    expect(main.bounds()).toEqual({ x: 372, y: 46, width: 592, height: 746 });
    expect(main.offsets()).toEqual({ top: 8, right: 316, bottom: 8, left: 8 });
    expect(main.computedStyles(["flex-grow", "min-width"])).toEqual({
        "flex-grow": "1",
        "min-width": "0px",
    });

    const panel = view.$('[data-rigged-ui="app-shell-panel"]');
    expect(panel.bounds()).toEqual({ x: 972, y: 46, width: 300, height: 746 });
    expect(panel.offsets()).toEqual({ top: 8, right: 8, bottom: 8, left: 608 });
    expect(panel.computedStyles(["flex-grow", "width"])).toEqual({
        "flex-grow": "0",
        width: "300px",
    });

    // Pixel truth at 1280×800: full window painted, both cards painted edge
    // to edge with the hairline alive on all four sides.
    await expectFullyPainted(view.$('[data-testid="shell-large"]'), "large shell root");
    await expectCardPixels(main, "large main card");
    await expectCardPixels(panel, "large panel card");

    await view.screenshot("AppShell.large.test");
});

it("composes the intermediate slot combinations: sidebar-only and panel-only", async () => {
    const view = createRenderer()
        .render(
            () => (
                <AppShell
                    data-testid="shell-sidebar-only"
                    rail={railSlot("so-rail")}
                    sidebar={sidebarSlot("so-sidebar")}
                    titleBar={titleBarSlot("so-title-bar")}
                >
                    {slot("so-main", { background: "#1c1b22" })}
                </AppShell>
            ),
            { width: 1024, height: 704 },
        )
        .render(
            () => (
                <AppShell
                    data-testid="shell-panel-only"
                    panel={slot("po-panel", { background: "#1c1b22" })}
                    rail={railSlot("po-rail")}
                    titleBar={titleBarSlot("po-title-bar")}
                >
                    {slot("po-main", { background: "#1c1b22" })}
                </AppShell>
            ),
            { width: 1024, height: 704 },
        );
    await view.ready();

    // Sidebar without panel: one card fills the inset content region.
    const sidebarOnlyRoot = view.$('[data-testid="shell-sidebar-only"]');
    expect(sidebarOnlyRoot.bounds()).toEqual({ x: 0, y: 0, width: 1024, height: 704 });
    expect(
        view.$('[data-testid="shell-sidebar-only"] [data-rigged-ui="app-shell-sidebar"]').bounds(),
    ).toEqual({ x: 76, y: 38, width: 288, height: 666 });
    const sidebarOnlyMain = view.$(
        '[data-testid="shell-sidebar-only"] [data-rigged-ui="app-shell-main"]',
    );
    expect(sidebarOnlyMain.bounds()).toEqual({ x: 372, y: 46, width: 644, height: 650 });
    expect(sidebarOnlyMain.offsets()).toEqual({ top: 8, right: 8, bottom: 8, left: 8 });

    // Panel without sidebar: the pair of cards docks right after the rail.
    const panelOnlyRoot = view.$('[data-testid="shell-panel-only"]');
    const panelOnlyMain = view.$(
        '[data-testid="shell-panel-only"] [data-rigged-ui="app-shell-main"]',
    );
    const panelOnlyPanel = view.$(
        '[data-testid="shell-panel-only"] [data-rigged-ui="app-shell-panel"]',
    );
    expect(
        view.$('[data-testid="shell-panel-only"] [data-rigged-ui="app-shell-content"]').bounds(),
    ).toEqual({ x: 76, y: 38, width: 948, height: 666 });
    expect(panelOnlyMain.bounds()).toEqual({ x: 84, y: 46, width: 584, height: 650 });
    expect(panelOnlyMain.offsets()).toEqual({ top: 8, right: 356, bottom: 8, left: 8 });
    expect(panelOnlyPanel.bounds()).toEqual({ x: 676, y: 46, width: 340, height: 650 });
    expect(panelOnlyPanel.offsets()).toEqual({ top: 8, right: 8, bottom: 8, left: 600 });

    // Pixel truth for the intermediate compositions: whole windows painted,
    // every card box painted with corner cuts and four live hairlines.
    await expectFullyPainted(sidebarOnlyRoot, "sidebar-only shell root");
    await expectFullyPainted(panelOnlyRoot, "panel-only shell root");
    await expectCardPixels(sidebarOnlyMain, "sidebar-only main card");
    await expectCardPixels(panelOnlyMain, "panel-only main card");
    await expectCardPixels(panelOnlyPanel, "panel-only panel card");

    await view.screenshot("AppShell.slots.test");
});
