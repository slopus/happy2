import { expect, it } from "vitest";
import { Icon, iconNames, type IconName } from "./Icon";
import { createRenderer } from "./testing";
import "./styles.css";
const SIZES = [12, 14, 16, 18, 20] as const;
/* Sizes the optical-centering contract is enforced at (px). */
const OPTICAL_SIZES = [14, 16, 20] as const;
/*
 * Alpha-weighted ink centroid must sit on the box center within this many CSS
 * px on both axes, at every optical size, in every engine. Measured drift
 * after tuning is <= 0.4px everywhere; the extra headroom absorbs
 * engine-specific stroke rasterization at small sizes.
 */
const CENTER_TOLERANCE = 0.6;
/*
 * Directional glyphs deliberately carry off-center ink on the named axis, so
 * the centroid assertion is skipped there (visible-bounds sanity still runs).
 * Every axis not listed here is asserted at CENTER_TOLERANCE.
 */
const DIRECTIONAL: Partial<
    Record<
        IconName,
        {
            skip: "x" | "xy";
            reason: string;
        }
    >
> = {
    "arrow-right": {
        skip: "x",
        reason: "arrowhead mass pulls the centroid right; the shaft is bounds-centered",
    },
    play: {
        skip: "x",
        reason: "right-pointing triangle keeps a deliberate rightward centroid bias",
    },
    reply: {
        skip: "x",
        reason: "return-arrow head and curve stack ink on the left by design",
    },
    send: {
        skip: "xy",
        reason: "diagonal paper plane points up-right; ink is corner-weighted by design",
    },
    terminal: {
        skip: "xy",
        reason: "prompt chevron + baseline underscore are corner-weighted like a text label",
    },
};
/*
 * A plain filled square centered in an icon-sized box, rendered at the exact
 * fixture position each glyph is measured at. Its measured centroid calibrates
 * away the element-capture origin error (the tester iframe can be scaled and
 * fractionally offset inside the outer page, which shifts and quantizes every
 * capture identically), so glyph drift is asserted differentially against it.
 */
function ControlSquare(props: { size: number }) {
    const inset = `${Math.round(props.size * 0.35 * 100) / 100}px`;
    return (
        <div
            style={{
                width: `${props.size}px`,
                height: `${props.size}px`,
                position: "relative",
            }}
        >
            <div style={{ position: "absolute", inset, background: "#ffffff" }} />
        </div>
    );
}
it("holds Icon box geometry across sizes", async () => {
    const view = createRenderer();
    for (const size of SIZES) {
        view.render(
            () => (
                <div data-testid={`icon-size-${size}`} style={{ display: "flex" }}>
                    <Icon name="inbox" size={size} />
                </div>
            ),
            { width: 44, height: 44, padding: 12 },
        );
    }
    view.render(
        () => (
            <div data-testid="icon-default" style={{ display: "flex" }}>
                <Icon name="check" />
            </div>
        ),
        { width: 44, height: 44, padding: 12 },
    );
    view.render(
        () => (
            <div data-testid="icon-inherit" style={{ display: "flex", color: "#8e8e93" }}>
                <Icon name="bell" size={20} />
            </div>
        ),
        { width: 44, height: 44, padding: 12 },
    );
    view.render(
        () => (
            <div data-testid="icon-colored" style={{ display: "flex", color: "#8e8e93" }}>
                <Icon name="bell" size={20} color="#007aff" aria-label="Notifications" />
            </div>
        ),
        { width: 44, height: 44, padding: 12 },
    );
    await view.ready();
    for (const size of SIZES) {
        const icon = view.$(`[data-testid="icon-size-${size}"] [data-happy2-ui="icon"]`);
        expect(icon.bounds()).toEqual({ x: 12, y: 12, width: size, height: size });
        expect(
            icon.computedStyles([
                "box-sizing",
                "display",
                "fill",
                "flex-grow",
                "flex-shrink",
                "stroke-linecap",
                "stroke-linejoin",
                "stroke-width",
            ]),
        ).toEqual({
            "box-sizing": "border-box",
            display: "block",
            fill: "none",
            "flex-grow": "0",
            "flex-shrink": "0",
            "stroke-linecap": "round",
            "stroke-linejoin": "round",
            "stroke-width": "1.7px",
        });
        expect(icon.element.getAttribute("viewBox")).toBe("0 0 20 20");
    }
    const fallback = view.$('[data-testid="icon-default"] [data-happy2-ui="icon"]');
    expect(fallback.bounds()).toEqual({ x: 12, y: 12, width: 16, height: 16 });
    expect(fallback.element.getAttribute("aria-hidden")).toBe("true");
    expect(fallback.element.getAttribute("role")).toBeNull();
    expect(fallback.element.getAttribute("data-name")).toBe("check");
    const inherit = view.$('[data-testid="icon-inherit"] [data-happy2-ui="icon"]');
    expect(inherit.computedStyles(["color", "stroke"])).toEqual({
        color: "rgb(142, 142, 147)",
        stroke: "rgb(142, 142, 147)",
    });
    const colored = view.$('[data-testid="icon-colored"] [data-happy2-ui="icon"]');
    expect(colored.computedStyles(["color", "stroke"])).toEqual({
        color: "rgb(0, 122, 255)",
        stroke: "rgb(0, 122, 255)",
    });
    expect(colored.element.getAttribute("aria-label")).toBe("Notifications");
    expect(colored.element.getAttribute("role")).toBe("img");
    expect(colored.element.getAttribute("aria-hidden")).toBeNull();
});
it("renders the entire pinned glyph set on the 20-unit grid", async () => {
    const view = createRenderer().render(
        () => (
            <div
                data-testid="icon-sheet"
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(7, 28px)",
                    justifyItems: "center",
                    alignItems: "center",
                    gap: "4px",
                    color: "#ffffff",
                }}
            >
                {iconNames.map((name) => (
                    <Icon key={name} name={name} size={20} />
                ))}
            </div>
        ),
        { width: 248, height: 236, padding: 12 },
    );
    await view.ready();
    expect(iconNames.length).toBe(45);
    for (const name of iconNames) {
        const icon = view.$(`[data-name="${name}"]`);
        const bounds = icon.bounds();
        expect(bounds.width, name).toBe(20);
        expect(bounds.height, name).toBe(20);
        expect(icon.element.getAttribute("data-happy2-ui")).toBe("icon");
    }
    await view.screenshot("Icon.test");
});
for (const size of OPTICAL_SIZES) {
    it(`centers glyph ink optically at size ${size}`, async () => {
        const columns = 8;
        const gap = 12;
        const rows = Math.ceil((iconNames.length + 1) / columns);
        const view = createRenderer().render(
            () => (
                <div
                    data-testid="optical-fixtures"
                    style={{
                        alignItems: "flex-start",
                        color: "#ffffff",
                        display: "flex",
                        flexWrap: "wrap",
                        gap: `${gap}px`,
                        width: `${columns * size + (columns - 1) * gap}px`,
                    }}
                >
                    <ControlSquare size={size} />
                    {iconNames.map((name) => (
                        <Icon key={name} name={name} size={size} />
                    ))}
                </div>
            ),
            {
                height: rows * size + (rows - 1) * gap + 24,
                padding: 12,
                width: columns * size + (columns - 1) * gap + 24,
            },
        );
        await view.ready();
        const controlPart = view.$('[data-testid="optical-fixtures"] > :first-child');
        const parts = [controlPart, ...iconNames.map((name) => view.$(`[data-name="${name}"]`))];
        /*
         * All fixtures share one integer-aligned Retina surface. The harness
         * reconstructs each element from its true DOM rectangle after taking
         * one black/white pair, so the control still calibrates the glyphs
         * without 46 independent screenshot pairs.
         */
        const metrics = await view.visibleMetrics(parts);
        const control = metrics.get(controlPart)!;
        /* A blank or catastrophically misaligned capture can never pass. */
        expect(control.pixelCount).toBeGreaterThan(0);
        expect(Math.abs(control.center.x - size / 2)).toBeLessThanOrEqual(2);
        expect(Math.abs(control.center.y - size / 2)).toBeLessThanOrEqual(2);
        const drifted: Array<{
            name: IconName;
            dx: number;
            dy: number;
        }> = [];
        for (const [index, name] of iconNames.entries()) {
            const icon = metrics.get(parts[index + 1]!);
            if (!icon) throw new Error(`Missing visible-pixel metrics for ${name}.`);
            /* Ink must exist and paint fully inside the icon box. */
            expect(icon.pixelCount, name).toBeGreaterThan(0);
            expect(icon.bounds.width, name).toBeGreaterThan(size * 0.2);
            expect(icon.bounds.height, name).toBeGreaterThan(size * 0.1);
            expect(icon.bounds.x, name).toBeGreaterThanOrEqual(0);
            expect(icon.bounds.y, name).toBeGreaterThanOrEqual(0);
            expect(icon.bounds.x + icon.bounds.width, name).toBeLessThanOrEqual(size);
            expect(icon.bounds.y + icon.bounds.height, name).toBeLessThanOrEqual(size);
            const skip = DIRECTIONAL[name]?.skip ?? "";
            const dx = Math.round((icon.center.x - control.center.x) * 1000) / 1000;
            const dy = Math.round((icon.center.y - control.center.y) * 1000) / 1000;
            const xDrifts = !skip.includes("x") && Math.abs(dx) > CENTER_TOLERANCE;
            const yDrifts = !skip.includes("y") && Math.abs(dy) > CENTER_TOLERANCE;
            if (xDrifts || yDrifts) drifted.push({ name, dx, dy });
        }
        expect(drifted).toEqual([]);
    }, 240000);
}
