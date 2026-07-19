import { onTestFinished } from "vitest";
import { page, server, userEvent } from "vitest/browser";

export type Bounds = {
    height: number;
    width: number;
    x: number;
    y: number;
};

export type EdgeOffsets = {
    bottom: number;
    left: number;
    right: number;
    top: number;
};

export type RenderedTextMetrics = {
    baseline: {
        /** Baseline relative to the measured element's top border edge. */
        fromElementTop: number;
        /** Baseline relative to the render surface's top border edge. */
        fromSurfaceTop: number;
    };
    bounds: Bounds;
    font: {
        family: string;
        letterSpacing: number;
        lineHeight: number;
        size: number;
        weight: string;
    };
    /**
     * Raw metrics returned by CanvasRenderingContext2D.measureText(). These
     * describe the browser's font metric model, not rasterized visible pixels.
     */
    fontMetrics: {
        actualBoundingBox: {
            ascent: number;
            descent: number;
            height: number;
            left: number;
            right: number;
            width: number;
        };
        advanceWidth: number;
        alphabeticBaseline: number;
        emHeight: {
            ascent: number;
            descent: number;
            height: number;
        };
        fontBoundingBox: {
            ascent: number;
            descent: number;
            height: number;
        };
        hangingBaseline: number;
        ideographicBaseline: number;
    };
    /**
     * Canvas actualBoundingBox metrics projected onto the DOM baseline.
     * This is not a visible-pixel measurement; use visibleMetrics() for ink.
     */
    ink: {
        ascent: number;
        baseline: number;
        bottom: number;
        descent: number;
        height: number;
        top: number;
        width: number;
    };
    offsets: EdgeOffsets;
    text: string;
    /** The browser-laid-out first-line baseline, relative to the render surface. */
    verticalOffset: number;
};

export type VisiblePixelMetrics = {
    /** Sum of per-pixel alpha coverage in backing-pixel units. */
    alphaMass: number;
    bounds: Bounds;
    center: {
        x: number;
        y: number;
    };
    pixelCount: number;
};

export type VisiblePixelMetricBatch = ReadonlyMap<RenderedElement<Element>, VisiblePixelMetrics>;

export type RendererOptions = {
    height: number;
    padding?: number;
    width: number;
};

export type MountComponent<Component> = (
    component: () => Component,
    surface: HTMLElement,
) => (() => void) | void;

type RenderedSurface = {
    dispose: () => void;
};

function rounded(value: number) {
    return Math.round(value * 1_000) / 1_000;
}

function readBounds(element: Element): Bounds {
    const rect = element.getBoundingClientRect();
    return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
    };
}

function roundedBounds(bounds: Bounds): Bounds {
    return {
        x: rounded(bounds.x),
        y: rounded(bounds.y),
        width: rounded(bounds.width),
        height: rounded(bounds.height),
    };
}

function relativeBounds(element: Element, origin: Element): Bounds {
    const elementBounds = readBounds(element);
    const originBounds = readBounds(origin);
    return roundedBounds({
        x: elementBounds.x - originBounds.x,
        y: elementBounds.y - originBounds.y,
        width: elementBounds.width,
        height: elementBounds.height,
    });
}

function pixels(value: string) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function assertRetina() {
    if (window.devicePixelRatio !== 2) {
        throw new Error(
            `Playwright screenshots require devicePixelRatio 2; received ${window.devicePixelRatio}.`,
        );
    }
}

async function imageData(base64: string) {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () =>
            reject(new Error("Unable to decode the rendered element screenshot."));
    });
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas pixel analysis is unavailable.");
    context.drawImage(image, 0, 0);
    return context.getImageData(0, 0, canvas.width, canvas.height);
}

function emptyVisiblePixelMetrics(): VisiblePixelMetrics {
    return {
        alphaMass: 0,
        bounds: { x: 0, y: 0, width: 0, height: 0 },
        center: { x: 0, y: 0 },
        pixelCount: 0,
    };
}

function metricsFromPixels(
    blackPixels: ImageData,
    whitePixels: ImageData,
    captureBounds: DOMRect,
    elementBounds: DOMRect,
): VisiblePixelMetrics {
    const scaleX = captureBounds.width / blackPixels.width;
    const scaleY = captureBounds.height / blackPixels.height;
    const elementX = elementBounds.x - captureBounds.x;
    const elementY = elementBounds.y - captureBounds.y;
    const firstX = Math.max(0, Math.floor(elementX / scaleX));
    const firstY = Math.max(0, Math.floor(elementY / scaleY));
    const lastX = Math.min(
        blackPixels.width - 1,
        Math.ceil((elementX + elementBounds.width) / scaleX) - 1,
    );
    const lastY = Math.min(
        blackPixels.height - 1,
        Math.ceil((elementY + elementBounds.height) / scaleY) - 1,
    );
    let minX = blackPixels.width;
    let minY = blackPixels.height;
    let maxX = -1;
    let maxY = -1;
    let totalAlpha = 0;
    let weightedX = 0;
    let weightedY = 0;
    let pixelCount = 0;
    for (let y = firstY; y <= lastY; y += 1) {
        for (let x = firstX; x <= lastX; x += 1) {
            const index = (y * blackPixels.width + x) * 4;
            // Cwhite - Cblack = 255 * (1 - alpha), independently of
            // foreground color. Averaging RGB suppresses channel-level
            // quantization while retaining every partially covered pixel.
            const backgroundShare =
                (whitePixels.data[index]! -
                    blackPixels.data[index]! +
                    (whitePixels.data[index + 1]! - blackPixels.data[index + 1]!) +
                    (whitePixels.data[index + 2]! - blackPixels.data[index + 2]!)) /
                (3 * 255);
            const alpha = Math.min(1, Math.max(0, 1 - backgroundShare));
            if (alpha <= 0) continue;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
            totalAlpha += alpha;
            weightedX += (x + 0.5) * alpha;
            weightedY += (y + 0.5) * alpha;
            pixelCount += 1;
        }
    }
    if (pixelCount === 0 || totalAlpha === 0) return emptyVisiblePixelMetrics();

    return {
        alphaMass: rounded(totalAlpha),
        bounds: {
            x: rounded(minX * scaleX - elementX),
            y: rounded(minY * scaleY - elementY),
            width: rounded((maxX - minX + 1) * scaleX),
            height: rounded((maxY - minY + 1) * scaleY),
        },
        center: {
            x: rounded((weightedX / totalAlpha) * scaleX - elementX),
            y: rounded((weightedY / totalAlpha) * scaleY - elementY),
        },
        pixelCount,
    };
}

/**
 * Reconstructs visible pixels for independent elements on one render surface
 * from a shared black/white capture pair. The selected elements must not
 * contain one another: changing the ancestor backgrounds for such a pair
 * would make one measurement alter the other's paint.
 */
async function captureVisiblePixelMetrics(
    elements: readonly RenderedElement<Element>[],
    container: HTMLElement,
): Promise<VisiblePixelMetricBatch> {
    assertRetina();
    await document.fonts.ready;
    const unique = [...new Set(elements)];
    if (unique.some((element) => element.element.closest("[data-gym-surface]") !== container)) {
        throw new Error("Visible-pixel batch elements must belong to one render surface.");
    }
    if (
        unique.some((element, index) =>
            unique.some(
                (other, otherIndex) =>
                    index !== otherIndex && element.element.contains(other.element),
            ),
        )
    ) {
        throw new Error("Visible-pixel batch elements must not contain one another.");
    }

    const bounds = new Map(
        unique.map((element) => [element, element.element.getBoundingClientRect()] as const),
    );
    const captureBounds = container.getBoundingClientRect();
    const ancestors = new Map<HTMLElement, string>();
    for (const item of unique) {
        let ancestor = item.element.parentElement;
        while (ancestor) {
            if (!ancestors.has(ancestor)) ancestors.set(ancestor, ancestor.style.cssText);
            if (ancestor === container) break;
            ancestor = ancestor.parentElement;
        }
    }
    const paintBackground = (color: string) => {
        for (const element of ancestors.keys()) {
            element.style.setProperty("background", color, "important");
            element.style.setProperty("transition", "none", "important");
        }
    };

    try {
        paintBackground("#000000");
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const black = await page.screenshot({ element: container, save: false });
        paintBackground("#ffffff");
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const white = await page.screenshot({ element: container, save: false });
        const [blackPixels, whitePixels] = await Promise.all([imageData(black), imageData(white)]);
        if (blackPixels.width !== whitePixels.width || blackPixels.height !== whitePixels.height) {
            throw new Error("Visible pixel captures have mismatched dimensions.");
        }
        return new Map(
            unique.map((element) => [
                element,
                metricsFromPixels(blackPixels, whitePixels, captureBounds, bounds.get(element)!),
            ]),
        );
    } finally {
        for (const [element, style] of ancestors) {
            element.style.cssText = style;
            element.style.setProperty("transition", "none", "important");
        }
        void document.body.offsetHeight;
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        for (const [element, style] of ancestors) element.style.cssText = style;
    }
}

function firstRenderedText(element: Element) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
        const text = walker.currentNode as Text;
        if (text.data.trim()) return text;
    }
    throw new Error("Text measurement requires an element containing rendered text.");
}

function renderedText(element: Element) {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        return element.value || element.placeholder;
    }
    return element.textContent ?? "";
}

function renderedTextStyle(element: Element) {
    if (
        (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) &&
        !element.value &&
        element.placeholder
    ) {
        return getComputedStyle(element, "::placeholder");
    }
    return getComputedStyle(element);
}

/**
 * Measures the real first-line baseline chosen by the browser's inline layout
 * engine. A zero-height inline block's bottom margin edge is its baseline, so
 * its top/bottom coordinate is an exact baseline probe. It contributes no
 * width, height, font strut, or paint and is removed synchronously.
 */
function inlineBaseline(element: Element) {
    const text = firstRenderedText(element);
    const parent = text.parentNode;
    if (!parent) throw new Error("Rendered text does not have a parent node.");

    const display = getComputedStyle(text.parentElement ?? element).display;
    if (display === "flex" || display === "inline-flex" || display === "grid") {
        throw new Error(
            "Text baseline measurement requires text in an inline formatting context, not a direct flex or grid text node.",
        );
    }

    const probe = document.createElement("span");
    probe.ariaHidden = "true";
    probe.dataset.gymBaselineProbe = "";
    probe.style.cssText = [
        "all: initial !important",
        "border: 0 !important",
        "display: inline-block !important",
        "font-size: 0 !important",
        "height: 0 !important",
        "line-height: 0 !important",
        "margin: 0 !important",
        "opacity: 0 !important",
        "padding: 0 !important",
        "position: static !important",
        "vertical-align: baseline !important",
        "width: 0 !important",
    ].join(";");

    parent.insertBefore(probe, text);
    try {
        return probe.getBoundingClientRect().top;
    } finally {
        probe.remove();
    }
}

function formControlBaseline(element: HTMLInputElement | HTMLTextAreaElement) {
    const boxStyle = getComputedStyle(element);
    const textStyle = renderedTextStyle(element);
    const elementBounds = element.getBoundingClientRect();
    const mirror = document.createElement("span");
    mirror.style.cssText = [
        "all: initial",
        "border: 0",
        "display: inline-block",
        "margin: 0",
        "padding: 0",
        "position: fixed",
        "visibility: hidden",
        "white-space: pre",
    ].join(";");
    Object.assign(mirror.style, {
        fontFamily: textStyle.fontFamily,
        fontFeatureSettings: textStyle.fontFeatureSettings,
        fontKerning: textStyle.fontKerning,
        fontSize: textStyle.fontSize,
        fontStretch: textStyle.fontStretch,
        fontStyle: textStyle.fontStyle,
        fontVariant: textStyle.fontVariant,
        fontVariationSettings: textStyle.fontVariationSettings,
        fontWeight: textStyle.fontWeight,
        left: `${elementBounds.x}px`,
        letterSpacing: textStyle.letterSpacing,
        lineHeight: textStyle.lineHeight,
        textTransform: textStyle.textTransform,
        top: `${elementBounds.y}px`,
    });
    mirror.textContent = renderedText(element) || "M";
    document.body.append(mirror);
    try {
        const mirrorHeight = mirror.getBoundingClientRect().height;
        const borderTop = pixels(boxStyle.borderTopWidth);
        const borderBottom = pixels(boxStyle.borderBottomWidth);
        const paddingTop = pixels(boxStyle.paddingTop);
        const paddingBottom = pixels(boxStyle.paddingBottom);
        const contentHeight = Math.max(
            0,
            elementBounds.height - borderTop - borderBottom - paddingTop - paddingBottom,
        );
        const lineTop =
            borderTop +
            paddingTop +
            (element instanceof HTMLInputElement ? (contentHeight - mirrorHeight) / 2 : 0);
        mirror.style.top = `${elementBounds.y + lineTop}px`;
        return inlineBaseline(mirror);
    } finally {
        mirror.remove();
    }
}

function renderedBaseline(element: Element) {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        return formControlBaseline(element);
    }
    return inlineBaseline(element);
}

export class RenderedElement<T extends Element = HTMLElement> {
    private visiblePixelMetrics?: Promise<VisiblePixelMetrics>;

    constructor(
        readonly element: T,
        readonly container: HTMLElement,
    ) {}

    /** Rendered border-box bounds in CSS pixels, relative to the render surface. */
    bounds(): Bounds {
        return relativeBounds(this.element, this.container);
    }

    computedStyle(property: string) {
        return getComputedStyle(this.element).getPropertyValue(property).trim();
    }

    computedStyles(properties?: readonly string[]) {
        const computed = getComputedStyle(this.element);
        const names = properties ?? Array.from(computed);
        return Object.fromEntries(
            names.map((property) => [property, computed.getPropertyValue(property).trim()]),
        );
    }

    /** Rendered border-box bounds in document coordinates. */
    pageBounds(): Bounds {
        const bounds = readBounds(this.element);
        return roundedBounds({
            ...bounds,
            x: bounds.x + window.scrollX,
            y: bounds.y + window.scrollY,
        });
    }

    height() {
        return this.bounds().height;
    }

    /** Rendered border-box edge offsets from the parent's border box. */
    offsets(): EdgeOffsets {
        const parent = this.element.parentElement;
        if (!parent) throw new Error("Rendered element does not have a parent.");
        const element = readBounds(this.element);
        const parentBounds = readBounds(parent);
        return {
            top: rounded(element.y - parentBounds.y),
            right: rounded(parentBounds.x + parentBounds.width - element.x - element.width),
            bottom: rounded(parentBounds.y + parentBounds.height - element.y - element.height),
            left: rounded(element.x - parentBounds.x),
        };
    }

    textMetrics(): RenderedTextMetrics {
        const text = renderedText(this.element);
        const style = renderedTextStyle(this.element);
        const size = pixels(style.fontSize);
        const lineHeight = style.lineHeight === "normal" ? size * 1.2 : pixels(style.lineHeight);
        const letterSpacing = style.letterSpacing === "normal" ? 0 : pixels(style.letterSpacing);
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas text measurement is unavailable.");
        context.font = [style.fontStyle, style.fontWeight, style.fontSize, style.fontFamily].join(
            " ",
        );
        const measured = context.measureText(text);
        const elementBounds = readBounds(this.element);
        const baseline = renderedBaseline(this.element) - elementBounds.y;
        const ascent = measured.actualBoundingBoxAscent;
        const descent = measured.actualBoundingBoxDescent;
        const spacing = Math.max(0, text.length - 1) * letterSpacing;
        const inkWidth = measured.actualBoundingBoxLeft + measured.actualBoundingBoxRight + spacing;
        const bounds = this.bounds();
        const metric = (value: number | undefined) => rounded(value ?? 0);
        const actualWidth = measured.actualBoundingBoxLeft + measured.actualBoundingBoxRight;
        const actualHeight = measured.actualBoundingBoxAscent + measured.actualBoundingBoxDescent;
        const emAscent = measured.emHeightAscent ?? 0;
        const emDescent = measured.emHeightDescent ?? 0;
        const fontAscent = measured.fontBoundingBoxAscent ?? 0;
        const fontDescent = measured.fontBoundingBoxDescent ?? 0;

        return {
            baseline: {
                fromElementTop: rounded(baseline),
                fromSurfaceTop: rounded(bounds.y + baseline),
            },
            bounds,
            font: {
                family: style.fontFamily.replaceAll('"', ""),
                letterSpacing: rounded(letterSpacing),
                lineHeight: rounded(lineHeight),
                size: rounded(size),
                weight: style.fontWeight,
            },
            fontMetrics: {
                actualBoundingBox: {
                    ascent: metric(measured.actualBoundingBoxAscent),
                    descent: metric(measured.actualBoundingBoxDescent),
                    height: metric(actualHeight),
                    left: metric(measured.actualBoundingBoxLeft),
                    right: metric(measured.actualBoundingBoxRight),
                    width: metric(actualWidth),
                },
                advanceWidth: metric(measured.width),
                alphabeticBaseline: metric(measured.alphabeticBaseline),
                emHeight: {
                    ascent: metric(emAscent),
                    descent: metric(emDescent),
                    height: metric(emAscent + emDescent),
                },
                fontBoundingBox: {
                    ascent: metric(fontAscent),
                    descent: metric(fontDescent),
                    height: metric(fontAscent + fontDescent),
                },
                hangingBaseline: metric(measured.hangingBaseline),
                ideographicBaseline: metric(measured.ideographicBaseline),
            },
            ink: {
                ascent: rounded(ascent),
                baseline: rounded(baseline),
                bottom: rounded(baseline + descent),
                descent: rounded(descent),
                height: rounded(ascent + descent),
                top: rounded(baseline - ascent),
                width: rounded(inkWidth),
            },
            offsets: this.offsets(),
            text,
            verticalOffset: rounded(bounds.y + baseline),
        };
    }

    visibleMetrics(): Promise<VisiblePixelMetrics> {
        this.visiblePixelMetrics ??= this.measureVisiblePixels();
        return this.visiblePixelMetrics;
    }

    async visibleBounds() {
        return (await this.visibleMetrics()).bounds;
    }

    async opticalCenter() {
        return (await this.visibleMetrics()).center;
    }

    width() {
        return this.bounds().width;
    }

    recordVisiblePixelMetrics(metrics: VisiblePixelMetrics) {
        this.visiblePixelMetrics = Promise.resolve(metrics);
    }

    private async measureVisiblePixels(): Promise<VisiblePixelMetrics> {
        assertRetina();
        await document.fonts.ready;
        const elementBounds = this.element.getBoundingClientRect();
        const captureBounds = this.container.getBoundingClientRect();
        if (elementBounds.width === 0 || elementBounds.height === 0) {
            return emptyVisiblePixelMetrics();
        }

        const ancestors: Array<{ element: HTMLElement; style: string }> = [];
        const selected = this.element as Element;
        const boundary =
            selected === this.container ? this.container.parentElement : this.container;
        let ancestor = selected.parentElement;
        while (ancestor) {
            ancestors.push({ element: ancestor, style: ancestor.style.cssText });
            if (ancestor === boundary) break;
            ancestor = ancestor.parentElement;
        }
        const paintBackground = (color: string) => {
            for (const entry of ancestors) {
                entry.element.style.setProperty("background", color, "important");
                entry.element.style.setProperty("transition", "none", "important");
            }
        };

        try {
            paintBackground("#000000");
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            const black = await page.screenshot({ element: this.container, save: false });
            paintBackground("#ffffff");
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            const white = await page.screenshot({ element: this.container, save: false });
            const [blackPixels, whitePixels] = await Promise.all([
                imageData(black),
                imageData(white),
            ]);
            if (
                blackPixels.width !== whitePixels.width ||
                blackPixels.height !== whitePixels.height
            ) {
                throw new Error("Visible pixel captures have mismatched dimensions.");
            }

            return metricsFromPixels(blackPixels, whitePixels, captureBounds, elementBounds);
        } finally {
            for (const entry of ancestors) {
                entry.element.style.cssText = entry.style;
                entry.element.style.setProperty("transition", "none", "important");
            }
            void document.body.offsetHeight;
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            for (const entry of ancestors) entry.element.style.cssText = entry.style;
        }
    }
}

export function createRenderer<Component>(
    mountComponent: MountComponent<Component>,
    defaultOptions?: RendererOptions,
) {
    const container = document.createElement("div");
    container.dataset.gymRenderer = "";
    Object.assign(container.style, {
        alignItems: "flex-start",
        background: "#e8e4df",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        padding: "12px",
        width: "max-content",
    });
    document.body.append(container);

    // Test files that drive userEvent leave the real pointer wherever their
    // last interaction landed, and later files reusing the same page then read
    // :hover styles from whatever fixture happens to render under that stale
    // coordinate. When the new fixture actually lands under that pointer,
    // parking it on this fixed top-right probe during the renderer's FIRST
    // ready() gives the test a hover-clean start. Later ready() calls
    // (screenshot()) leave intentional in-test hover states untouched.
    const pointerPark = document.createElement("div");
    pointerPark.dataset.gymPointerPark = "";
    Object.assign(pointerPark.style, {
        height: "2px",
        position: "fixed",
        right: "0",
        top: "0",
        width: "2px",
        zIndex: "2147483647",
    });
    document.body.append(pointerPark);
    let pointerParked = false;

    const surfaces: RenderedSurface[] = [];
    const renderer = {
        $(selector: string) {
            const element = container.querySelector(selector);
            if (!element) throw new Error(`No rendered element matches “${selector}”.`);
            const surface = element.closest<HTMLElement>("[data-gym-surface]");
            return new RenderedElement(element, surface ?? container);
        },
        container,
        destroy() {
            for (const surface of surfaces.splice(0).reverse()) surface.dispose();
            container.remove();
            pointerPark.remove();
        },
        async ready() {
            assertRetina();
            await document.fonts.ready;
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            if (!pointerParked) {
                if (container.matches(":hover")) {
                    await userEvent.hover(pointerPark);
                    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
                }
                pointerParked = true;
            }
        },
        async screenshot(name: string) {
            await renderer.ready();
            return page.screenshot({
                element: container,
                ...(import.meta.env.VITE_HAPPY2_WRITE_SCREENSHOTS === "1"
                    ? { path: `./${name}.${server.browser}.${server.platform}.png` }
                    : {}),
            });
        },
        /**
         * Measures independent elements from one black/white surface capture
         * pair. This keeps the same true-DOM-rectangle and Retina pixel math as
         * visibleMetrics(), while avoiding repeated screenshots of one fixture.
         */
        async visibleMetrics(elements: readonly RenderedElement<Element>[]) {
            if (elements.length === 0) {
                return new Map<RenderedElement<Element>, VisiblePixelMetrics>();
            }
            const metrics = await captureVisiblePixelMetrics(elements, elements[0]!.container);
            for (const [element, visible] of metrics) element.recordVisiblePixelMetrics(visible);
            return metrics;
        },
        render(component: () => Component, options = defaultOptions) {
            if (!options) {
                throw new Error(
                    "Renderer dimensions are required in createRenderer() or render().",
                );
            }
            const surface = document.createElement("div");
            surface.dataset.gymSurface = "";
            Object.assign(surface.style, {
                boxSizing: "border-box",
                height: `${options.height}px`,
                overflow: "hidden",
                padding: `${options.padding ?? 0}px`,
                position: "relative",
                background: "#ffffff",
                width: `${options.width}px`,
            });
            container.append(surface);
            try {
                const dispose = mountComponent(component, surface);
                surfaces.push({ dispose: dispose ?? (() => surface.replaceChildren()) });
            } catch (error) {
                surface.remove();
                throw error;
            }
            return renderer;
        },
    };

    onTestFinished(() => renderer.destroy());
    return renderer;
}
