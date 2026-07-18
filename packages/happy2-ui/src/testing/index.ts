import { createElement, type FunctionComponent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import {
    createRenderer as createPlaywrightRenderer,
    type RendererOptions,
} from "happy2-gym/playwright";
export { RenderedElement } from "happy2-gym/playwright";
export type {
    Bounds,
    EdgeOffsets,
    RenderedTextMetrics,
    RendererOptions,
    VisiblePixelMetricBatch,
    VisiblePixelMetrics,
} from "happy2-gym/playwright";
type CornerName = "bottom-left" | "bottom-right" | "top-left" | "top-right";
type CornerRadius = {
    x: number;
    y: number;
};
type ElementCornerGeometry = {
    bounds: DOMRect;
    radii: Record<CornerName, CornerRadius>;
};
const CORNERS: readonly CornerName[] = ["top-left", "top-right", "bottom-right", "bottom-left"];
const PARALLEL_CORNER_TOLERANCE = 0.05;
function pixels(value: string, percentageBase: number) {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) return 0;
    return value.trim().endsWith("%") ? (parsed / 100) * percentageBase : parsed;
}
function declaredCornerRadius(value: string, bounds: DOMRect): CornerRadius {
    const [horizontal = "0", vertical = horizontal] = value.trim().split(/\s+/);
    return {
        x: pixels(horizontal, bounds.width),
        y: pixels(vertical, bounds.height),
    };
}
/**
 * Applies the CSS Backgrounds radius-overlap reduction so pills, circles, and
 * oversized radii are compared by the curve the browser actually renders.
 */
function cornerGeometry(element: Element): ElementCornerGeometry | undefined {
    const bounds = element.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return undefined;
    const style = getComputedStyle(element);
    const radii: Record<CornerName, CornerRadius> = {
        "top-left": declaredCornerRadius(style.borderTopLeftRadius, bounds),
        "top-right": declaredCornerRadius(style.borderTopRightRadius, bounds),
        "bottom-right": declaredCornerRadius(style.borderBottomRightRadius, bounds),
        "bottom-left": declaredCornerRadius(style.borderBottomLeftRadius, bounds),
    };
    const ratios = [
        bounds.width / (radii["top-left"].x + radii["top-right"].x),
        bounds.width / (radii["bottom-left"].x + radii["bottom-right"].x),
        bounds.height / (radii["top-left"].y + radii["bottom-left"].y),
        bounds.height / (radii["top-right"].y + radii["bottom-right"].y),
    ].filter(Number.isFinite);
    const scale = Math.min(1, ...ratios);
    for (const radius of Object.values(radii)) {
        radius.x *= scale;
        radius.y *= scale;
    }
    return { bounds, radii };
}
function edgeInsets(outer: DOMRect, inner: DOMRect, corner: CornerName): CornerRadius {
    return {
        x: corner.endsWith("left") ? inner.left - outer.left : outer.right - inner.right,
        y: corner.startsWith("top") ? inner.top - outer.top : outer.bottom - inner.bottom,
    };
}
function identifier(element: Element) {
    const part = element.getAttribute("data-happy2-ui");
    const testId = element.getAttribute("data-testid");
    return [
        element.tagName.toLowerCase(),
        part && `[data-happy2-ui="${part}"]`,
        testId && `[data-testid="${testId}"]`,
    ]
        .filter(Boolean)
        .join("");
}
function closeTo(actual: number, expected: number) {
    return Math.abs(actual - expected) <= PARALLEL_CORNER_TOLERANCE;
}
/**
 * Audits every rounded happy2-ui part below `root`. When a descendant corner
 * occupies an ancestor's rounded-corner field, their curves must be true
 * parallels: equal horizontal/vertical inset and inner radius = outer radius
 * - inset. Rounded descendants away from an ancestor corner are independent.
 */
export function assertParallelRoundedCorners(root: ParentNode) {
    const elements = Array.from(root.querySelectorAll("[data-happy2-ui]"));
    const geometries = new Map(
        elements.map((element) => [element, cornerGeometry(element)] as const),
    );
    const failures: string[] = [];
    for (const inner of elements) {
        const innerGeometry = geometries.get(inner);
        if (!innerGeometry) continue;
        for (const corner of CORNERS) {
            const innerRadius = innerGeometry.radii[corner];
            if (innerRadius.x <= 0 && innerRadius.y <= 0) continue;
            let ancestor = inner.parentElement;
            while (ancestor && ancestor !== root) {
                const outerGeometry = geometries.get(ancestor);
                if (!outerGeometry) {
                    ancestor = ancestor.parentElement;
                    continue;
                }
                const inset = edgeInsets(outerGeometry.bounds, innerGeometry.bounds, corner);
                const contained =
                    inset.x >= -PARALLEL_CORNER_TOLERANCE &&
                    inset.y >= -PARALLEL_CORNER_TOLERANCE &&
                    innerGeometry.bounds.left >=
                        outerGeometry.bounds.left - PARALLEL_CORNER_TOLERANCE &&
                    innerGeometry.bounds.top >=
                        outerGeometry.bounds.top - PARALLEL_CORNER_TOLERANCE &&
                    innerGeometry.bounds.right <=
                        outerGeometry.bounds.right + PARALLEL_CORNER_TOLERANCE &&
                    innerGeometry.bounds.bottom <=
                        outerGeometry.bounds.bottom + PARALLEL_CORNER_TOLERANCE;
                const outerRadius = outerGeometry.radii[corner];
                const occupiesCornerField =
                    contained && inset.x < outerRadius.x && inset.y < outerRadius.y;
                if (!occupiesCornerField) {
                    ancestor = ancestor.parentElement;
                    continue;
                }
                const label = `${identifier(ancestor)} -> ${identifier(inner)} (${corner})`;
                if (!closeTo(inset.x, inset.y)) {
                    failures.push(
                        `${label}: horizontal inset ${inset.x.toFixed(3)}px and vertical inset ${inset.y.toFixed(3)}px must match`,
                    );
                }
                const expected = {
                    x: Math.max(0, outerRadius.x - inset.x),
                    y: Math.max(0, outerRadius.y - inset.y),
                };
                if (!closeTo(innerRadius.x, expected.x) || !closeTo(innerRadius.y, expected.y)) {
                    failures.push(
                        `${label}: inner radius ${innerRadius.x.toFixed(3)}px × ${innerRadius.y.toFixed(3)}px must equal outer radius ${outerRadius.x.toFixed(3)}px × ${outerRadius.y.toFixed(3)}px minus inset ${inset.x.toFixed(3)}px × ${inset.y.toFixed(3)}px (expected ${expected.x.toFixed(3)}px × ${expected.y.toFixed(3)}px)`,
                    );
                }
                break;
            }
        }
    }
    if (failures.length > 0) {
        throw new Error(`Nested rounded-corner contract failed:\n${failures.join("\n")}`);
    }
}
export function createRenderer(defaultOptions?: RendererOptions) {
    const renderer = createPlaywrightRenderer<ReactNode | (() => ReactNode)>(
        (component, surface) => {
            const root = createRoot(surface);
            flushSync(() =>
                root.render(
                    typeof component === "function"
                        ? createElement(component as FunctionComponent)
                        : component,
                ),
            );
            return () => root.unmount();
        },
        defaultOptions,
    );
    const ready = renderer.ready.bind(renderer);
    renderer.ready = async () => {
        await ready();
        assertParallelRoundedCorners(renderer.container);
    };
    return renderer;
}
