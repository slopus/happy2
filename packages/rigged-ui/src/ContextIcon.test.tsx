import { expect, it } from "vitest";
import { ContextIcon, type ContextKind } from "./ContextIcon";
import { createRenderer } from "./testing";

it("holds ContextIcon geometry and optical alignment for every kind", async () => {
    const kinds: ContextKind[] = ["file", "run", "thread"];
    const visibleBounds = {
        file: { x: 2.5, y: 1, width: 9, height: 12 },
        run: { x: 4.5, y: 2.5, width: 7.5, height: 9 },
        thread: { x: 0.5, y: 2, width: 13, height: 11.5 },
    } satisfies Record<ContextKind, { x: number; y: number; width: number; height: number }>;
    const view = createRenderer();

    for (const kind of kinds) {
        view.render(
            () => <ContextIcon data-testid={`context-icon-${kind}`} color="#44384a" kind={kind} />,
            { width: 38, height: 38, padding: 12 },
        );
    }
    await view.ready();

    for (const kind of kinds) {
        const icon = view.$(`[data-testid="context-icon-${kind}"]`);
        expect(icon.bounds()).toEqual({ x: 12, y: 12, width: 14, height: 14 });
        expect(
            icon.computedStyles([
                "box-sizing",
                "color",
                "display",
                "height",
                "overflow-x",
                "overflow-y",
                "width",
            ]),
        ).toEqual({
            "box-sizing": "border-box",
            color: "rgb(68, 56, 74)",
            display: "block",
            height: "14px",
            "overflow-x": "visible",
            "overflow-y": "visible",
            width: "14px",
        });

        const visible = await icon.visibleMetrics();
        expect(visible.pixelCount).toBeGreaterThan(0);
        expect(visible.bounds).toEqual(visibleBounds[kind]);
        expect(Math.round(visible.center.x * 2)).toBe(14);
        expect(Math.round(visible.center.y * 2)).toBe(14);

        const artwork = view.$(
            `[data-testid="context-icon-${kind}"] [data-rigged-ui="context-icon-artwork"]`,
        );
        expect(artwork.computedStyles(["fill", "stroke", "stroke-width", "vector-effect"])).toEqual(
            {
                fill: kind === "run" ? "rgb(68, 56, 74)" : "none",
                stroke: kind === "run" ? "none" : "rgb(68, 56, 74)",
                "stroke-width": "1.8px",
                "vector-effect": "non-scaling-stroke",
            },
        );
    }

    await view.screenshot("ContextIcon.test");
});
