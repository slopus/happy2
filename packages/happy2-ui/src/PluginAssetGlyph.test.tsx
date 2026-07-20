import { expect, it } from "vitest";
import "./theme.css";
import "./styles/icon.css";
import "./styles/plugin-glyph.css";
import { PluginAssetGlyph } from "./PluginAssetGlyph";
import { createRenderer } from "./testing";

// A 1×1 transparent PNG, enough to prove the mask paints a currentColor square.
const MASK =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

it("paints an authenticated asset as a fixed-size currentColor mask", async () => {
    const view = createRenderer().render(
        () => (
            <div style={{ color: "rgb(255, 0, 0)", display: "flex" }}>
                <PluginAssetGlyph data-testid="glyph" label="Todos" maskUrl={MASK} size={24} />
            </div>
        ),
        { width: 120, height: 80, padding: 20 },
    );
    const glyph = view.$('[data-testid="glyph"]');
    expect(glyph.bounds()).toEqual({ x: 20, y: 20, width: 24, height: 24 });
    expect(
        glyph.computedStyles(["background-color", "box-sizing", "display", "height", "width"]),
    ).toEqual({
        // currentColor resolves to the inherited ink color.
        "background-color": "rgb(255, 0, 0)",
        "box-sizing": "border-box",
        // The glyph's `inline-flex` blockifies to `flex` as a flex item of the
        // measurement wrapper; the standalone inline-flex contract is asserted by
        // the fallback case below.
        display: "flex",
        height: "24px",
        width: "24px",
    });
    expect(glyph.element.getAttribute("role")).toBe("img");
    expect(glyph.element.getAttribute("aria-label")).toBe("Todos");
    expect(glyph.element.getAttribute("data-state")).toBe("ready");
    await view.screenshot("PluginAssetGlyph.test");
});

it("holds the slot with a neutral fallback icon before the mask loads", async () => {
    const view = createRenderer().render(
        () => <PluginAssetGlyph data-testid="fallback" size={24} />,
        { width: 80, height: 80, padding: 20 },
    );
    const fallback = view.$('[data-testid="fallback"]');
    expect(fallback.bounds()).toEqual({ x: 20, y: 20, width: 24, height: 24 });
    expect(fallback.element.getAttribute("data-state")).toBe("fallback");
    // The fallback holds the same square and renders an Icon glyph inside it.
    expect(fallback.element.querySelector("svg")).not.toBeNull();
    expect(fallback.computedStyles(["display", "width", "height"])).toEqual({
        display: "inline-flex",
        width: "24px",
        height: "24px",
    });
    await view.screenshot("PluginAssetGlyph.fallback.test");
}, 120000);
