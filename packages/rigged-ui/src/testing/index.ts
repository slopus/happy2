import type { JSX } from "solid-js";
import { render as renderSolid } from "solid-js/web";
import { onTestFinished } from "vitest";
import { page, server } from "vitest/browser";

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
    bounds: Bounds;
    font: {
        family: string;
        letterSpacing: number;
        lineHeight: number;
        size: number;
        weight: string;
    };
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
};

export type VisiblePixelMetrics = {
    bounds: Bounds;
    center: {
        x: number;
        y: number;
    };
    pixelCount: number;
};

export type RendererOptions = {
    height: number;
    padding?: number;
    width: number;
};

type RenderedSurface = {
    dispose: () => void;
};

function rounded(value: number) {
    return Math.round(value * 1_000) / 1_000;
}

function readBounds(element: Element): Bounds {
    const rect = element.getBoundingClientRect();
    return {
        x: rounded(rect.x),
        y: rounded(rect.y),
        width: rounded(rect.width),
        height: rounded(rect.height),
    };
}

function pixels(value: string) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function assertRetina() {
    if (window.devicePixelRatio !== 2) {
        throw new Error(
            `rigged-ui screenshots require devicePixelRatio 2; received ${window.devicePixelRatio}.`,
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

export class RenderedElement<T extends Element = HTMLElement> {
    private visiblePixelMetrics?: Promise<VisiblePixelMetrics>;

    constructor(
        readonly element: T,
        private readonly container: HTMLElement,
    ) {}

    bounds(): Bounds {
        const element = readBounds(this.element);
        const container = readBounds(this.container);
        return {
            x: rounded(element.x - container.x),
            y: rounded(element.y - container.y),
            width: element.width,
            height: element.height,
        };
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

    pageBounds(): Bounds {
        const bounds = readBounds(this.element);
        return {
            ...bounds,
            x: rounded(bounds.x + window.scrollX),
            y: rounded(bounds.y + window.scrollY),
        };
    }

    height() {
        return this.bounds().height;
    }

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
        const text = this.element.textContent ?? "";
        const style = getComputedStyle(this.element);
        const size = pixels(style.fontSize);
        const lineHeight = style.lineHeight === "normal" ? size * 1.2 : pixels(style.lineHeight);
        const letterSpacing = style.letterSpacing === "normal" ? 0 : pixels(style.letterSpacing);
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas text measurement is unavailable.");
        context.font = [
            style.fontStyle,
            style.fontVariant,
            style.fontWeight,
            style.fontSize,
            style.fontFamily,
        ].join(" ");
        const measured = context.measureText(text);
        const fontAscent = measured.fontBoundingBoxAscent || measured.actualBoundingBoxAscent;
        const fontDescent = measured.fontBoundingBoxDescent || measured.actualBoundingBoxDescent;
        const leading = Math.max(0, lineHeight - fontAscent - fontDescent) / 2;
        const offsets = this.offsets();
        const baseline = offsets.top + leading + fontAscent;
        const ascent = measured.actualBoundingBoxAscent;
        const descent = measured.actualBoundingBoxDescent;
        const inkWidth = measured.width + Math.max(0, text.length - 1) * letterSpacing;

        return {
            bounds: this.bounds(),
            font: {
                family: style.fontFamily.replaceAll('"', ""),
                letterSpacing: rounded(letterSpacing),
                lineHeight: rounded(lineHeight),
                size: rounded(size),
                weight: style.fontWeight,
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
            offsets,
            text,
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

    private async measureVisiblePixels(): Promise<VisiblePixelMetrics> {
        assertRetina();
        await document.fonts.ready;
        const elementBounds = this.element.getBoundingClientRect();
        if (elementBounds.width === 0 || elementBounds.height === 0) {
            return {
                bounds: { x: 0, y: 0, width: 0, height: 0 },
                center: { x: 0, y: 0 },
                pixelCount: 0,
            };
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
            const black = await page.screenshot({ element: this.element, save: false });
            paintBackground("#ffffff");
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            const white = await page.screenshot({ element: this.element, save: false });
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
            let minX = blackPixels.width;
            let minY = blackPixels.height;
            let maxX = -1;
            let maxY = -1;
            let totalAlpha = 0;
            let weightedX = 0;
            let weightedY = 0;
            let pixelCount = 0;
            for (let y = 0; y < blackPixels.height; y += 1) {
                for (let x = 0; x < blackPixels.width; x += 1) {
                    const index = (y * blackPixels.width + x) * 4;
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
            if (pixelCount === 0 || totalAlpha === 0) {
                return {
                    bounds: { x: 0, y: 0, width: 0, height: 0 },
                    center: { x: 0, y: 0 },
                    pixelCount: 0,
                };
            }

            const scaleX = elementBounds.width / blackPixels.width;
            const scaleY = elementBounds.height / blackPixels.height;
            return {
                bounds: {
                    x: rounded(minX * scaleX),
                    y: rounded(minY * scaleY),
                    width: rounded((maxX - minX + 1) * scaleX),
                    height: rounded((maxY - minY + 1) * scaleY),
                },
                center: {
                    x: rounded((weightedX / totalAlpha) * scaleX),
                    y: rounded((weightedY / totalAlpha) * scaleY),
                },
                pixelCount,
            };
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

export function createRenderer(defaultOptions?: RendererOptions) {
    const container = document.createElement("div");
    container.dataset.riggedUiRenderer = "";
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

    const surfaces: RenderedSurface[] = [];
    const renderer = {
        $(selector: string) {
            const element = container.querySelector(selector);
            if (!element) throw new Error(`No rendered element matches “${selector}”.`);
            const surface = element.closest<HTMLElement>("[data-rigged-ui-surface]");
            return new RenderedElement(element, surface ?? container);
        },
        container,
        destroy() {
            for (const surface of surfaces.splice(0).reverse()) surface.dispose();
            container.remove();
        },
        async ready() {
            assertRetina();
            await document.fonts.ready;
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        },
        async screenshot(name: string) {
            await renderer.ready();
            return page.screenshot({
                element: container,
                path: `./${name}.${server.browser}.${server.platform}.png`,
            });
        },
        render(component: () => JSX.Element, options = defaultOptions) {
            if (!options) {
                throw new Error(
                    "Renderer dimensions are required in createRenderer() or render().",
                );
            }
            const surface = document.createElement("div");
            surface.dataset.riggedUiSurface = "";
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
                surfaces.push({ dispose: renderSolid(component, surface) });
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
