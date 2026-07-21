import { expect, it } from "vitest";
import { Icon, iconNames } from "./Icon";
import { ioniconsGlyphs } from "./vectorIcons/ioniconsGlyphs";
import { octiconsGlyphs } from "./vectorIcons/octiconsGlyphs";
import { createRenderer } from "./testing";
import "./styles.css";
const SIZES = [12, 14, 16, 18, 20] as const;
/*
 * Icon is now font-backed: each curated name resolves to one Private Use Area
 * glyph in the Ionicons or Octicons font. The geometry contract is the square
 * font box (size sets both font-size and box), the correct per-set font
 * resolution, and the stable data-name/data-happy2-ui parts call sites and
 * other component tests key on. Optical centering belongs to the font, so the
 * old SVG stroke/viewBox/centroid assertions are replaced by a real-ink proof
 * (non-zero visible pixels, which also proves the font actually loaded) for
 * every name in every engine.
 */
it("holds Icon box geometry, font, and PUA glyph across sizes", async () => {
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
            <div data-testid="icon-octicon" style={{ display: "flex" }}>
                <Icon name="branch" size={20} />
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
        expect(icon.bounds(), `icon ${size} box`).toEqual({
            x: 12,
            y: 12,
            width: size,
            height: size,
        });
        expect(
            icon.computedStyles(["box-sizing", "display", "flex-grow", "flex-shrink"]),
            `icon ${size} styles`,
        ).toEqual({
            "box-sizing": "border-box",
            /* inline-flex is blockified to flex here because each fixture wraps
             * the icon in a display:flex parent, making it a flex item. */
            display: "flex",
            "flex-grow": "0",
            "flex-shrink": "0",
        });
        expect(icon.computedStyle("font-family").replaceAll('"', ""), `icon ${size} font`).toBe(
            "happy2 Ionicons",
        );
        expect(icon.element.textContent, `icon ${size} glyph`).toBe(
            String.fromCodePoint(ioniconsGlyphs["file-tray-outline"]),
        );
    }
    const fallback = view.$('[data-testid="icon-default"] [data-happy2-ui="icon"]');
    expect(fallback.bounds()).toEqual({ x: 12, y: 12, width: 16, height: 16 });
    expect(fallback.element.getAttribute("aria-hidden")).toBe("true");
    expect(fallback.element.getAttribute("role")).toBeNull();
    expect(fallback.element.getAttribute("data-name")).toBe("check");
    expect(fallback.element.getAttribute("data-set")).toBe("ionicons");
    const octicon = view.$('[data-testid="icon-octicon"] [data-happy2-ui="icon"]');
    expect(octicon.computedStyle("font-family").replaceAll('"', "")).toBe("happy2 Octicons");
    expect(octicon.element.getAttribute("data-set")).toBe("octicons");
    expect(octicon.element.getAttribute("data-name")).toBe("branch");
    expect(octicon.element.textContent).toBe(String.fromCodePoint(octiconsGlyphs["git-branch"]));
    const inherit = view.$('[data-testid="icon-inherit"] [data-happy2-ui="icon"]');
    expect(inherit.computedStyle("color")).toBe("rgb(142, 142, 147)");
    const colored = view.$('[data-testid="icon-colored"] [data-happy2-ui="icon"]');
    expect(colored.computedStyle("color")).toBe("rgb(0, 122, 255)");
    expect(colored.element.getAttribute("aria-label")).toBe("Notifications");
    expect(colored.element.getAttribute("role")).toBe("img");
    expect(colored.element.getAttribute("aria-hidden")).toBeNull();
});
it("paints real ink for every curated glyph in its box", async () => {
    const size = 20;
    const columns = 8;
    const gap = 12;
    const rows = Math.ceil(iconNames.length / columns);
    const view = createRenderer().render(
        () => (
            <div
                data-testid="icon-sheet"
                style={{
                    alignItems: "flex-start",
                    color: "#111111",
                    background: "#ffffff",
                    display: "flex",
                    flexWrap: "wrap",
                    gap: `${gap}px`,
                    width: `${columns * size + (columns - 1) * gap}px`,
                }}
            >
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
    expect(iconNames.length).toBe(51);
    const parts = iconNames.map((name) => view.$(`[data-name="${name}"]`));
    const metrics = await view.visibleMetrics(parts);
    for (const [index, name] of iconNames.entries()) {
        const part = parts[index]!;
        const visible = metrics.get(part)!;
        /* A blank capture means the font never loaded or the codepoint is wrong. */
        expect(visible.pixelCount, `${name} ink`).toBeGreaterThan(0);
        expect(part.bounds().width, `${name} box`).toBe(size);
        expect(part.bounds().height, `${name} box`).toBe(size);
        expect(part.element.getAttribute("data-happy2-ui")).toBe("icon");
    }
    await view.screenshot("Icon.test");
});
