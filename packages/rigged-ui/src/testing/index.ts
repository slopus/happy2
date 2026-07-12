import type { JSX } from "solid-js";
import { render as renderSolid } from "solid-js/web";
import { createRenderer as createPlaywrightRenderer, type RendererOptions } from "gym/playwright";

export { RenderedElement } from "gym/playwright";
export type {
    Bounds,
    EdgeOffsets,
    RenderedTextMetrics,
    RendererOptions,
    VisiblePixelMetrics,
} from "gym/playwright";

export function createRenderer(defaultOptions?: RendererOptions) {
    return createPlaywrightRenderer<JSX.Element>(
        (component, surface) => renderSolid(component, surface),
        defaultOptions,
    );
}
