import { type ReactNode } from "react";
import "./styles.css";
import { expect, it } from "vitest";
import { AutomatedTag } from "./AutomatedTag";
import { createRenderer, type RenderedElement } from "./testing";
/*
 * AutomatedTag has no enclosing box to center ink within (no pill fill or
 * border), so it carries NO per-engine centroid correction. Its only optical
 * contract is that the 12px chip glyph and the mono caption share one row. This
 * test measures the alpha-weighted ink centroid of the icon and the label in
 * Chromium, Firefox, and WebKit at 2x and asserts they sit on the same band
 * with no translate applied — proving the flex + line-box centering is enough.
 *
 * Fixtures sit at integer page coordinates carrying the `ink` class (transparent
 * background) so element captures never round the edge and the captured pixels
 * are the glyph ink alone. pixelCount > 0 is asserted for every capture so a
 * clipped or blank capture can never pass.
 */
const TOLERANCE = 1;
const INK_FIXTURE_CSS = `
    .ink { background: transparent !important; }
    .ink * { background: transparent !important; }
`;
function cell(x: number, y: number, children: ReactNode) {
    return (
        <span
            style={{
                alignItems: "flex-start",
                display: "flex",
                left: `${x}px`,
                position: "absolute",
                top: `${y}px`,
            }}
        >
            {children}
        </span>
    );
}
/** Alpha-weighted ink centroid of `part`, in the host tag's coordinate frame. */
async function inkCenter(name: string, part: RenderedElement<Element>) {
    const visible = await part.visibleMetrics();
    expect(visible.pixelCount, `${name} ink`).toBeGreaterThan(0);
    const p = part.bounds();
    return { x: p.x + visible.center.x, y: p.y + visible.center.y };
}
it("renders the automated marker structure and accessible role", { timeout: 90000 }, async () => {
    const view = createRenderer();
    view.render(() => <AutomatedTag />, { width: 200, height: 60 });
    await view.ready();
    const tag = view.$('[data-happy2-ui="automated-tag"]');
    expect(tag.element.getAttribute("role")).toBe("note");
    expect(tag.element.getAttribute("aria-label")).toBe(
        "Posted automatically on the author’s behalf",
    );
    /* The glyph and caption are decorative once the sentence is read aloud. */
    const icon = view.$('[data-happy2-ui="automated-tag-icon"]');
    const label = view.$('[data-happy2-ui="automated-tag-label"]');
    expect(icon.element.getAttribute("aria-hidden")).toBe("true");
    expect(label.element.getAttribute("aria-hidden")).toBe("true");
    expect(label.element.textContent).toBe("Automated");
    /* A 16px inline row is the layout contract the meta row composes against. */
    expect(tag.height()).toBe(16);
});
it("styles the caption as a muted mono uppercase label", { timeout: 90000 }, async () => {
    const view = createRenderer();
    view.render(
        () => (
            <div style={{ display: "flex", gap: "12px" }}>
                <AutomatedTag />
                {/* Reference ink in the exact secondary token so the color
                    assertion holds under any active theme. */}
                <span data-testid="secondary-ref" style={{ color: "var(--text-secondary)" }}>
                    ref
                </span>
            </div>
        ),
        { width: 240, height: 60 },
    );
    await view.ready();
    const label = view.$('[data-happy2-ui="automated-tag-label"]');
    const styles = label.computedStyles([
        "font-size",
        "font-weight",
        "text-transform",
        "letter-spacing",
    ]);
    expect(styles["font-size"]).toBe("10px");
    expect(styles["font-weight"]).toBe("700");
    expect(styles["text-transform"]).toBe("uppercase");
    expect(label.computedStyle("font-family")).toContain("happy2 Mono");
    /* Muted: the caption reads at the same weight as secondary metadata, not
       the primary author face. */
    expect(label.computedStyle("color")).toBe(
        view.$('[data-testid="secondary-ref"]').computedStyle("color"),
    );
});
it(
    "keeps the glyph and caption ink on one optical row in every engine",
    { timeout: 120000 },
    async () => {
        const view = createRenderer();
        view.render(
            () => (
                <div style={{ height: "100%", position: "relative", width: "100%" }}>
                    <style>{INK_FIXTURE_CSS}</style>
                    {cell(20, 20, <AutomatedTag className="ink" />)}
                </div>
            ),
            { width: 200, height: 80 },
        );
        await view.ready();
        const iconInk = await inkCenter("icon", view.$('[data-happy2-ui="automated-tag-icon"]'));
        const labelInk = await inkCenter("label", view.$('[data-happy2-ui="automated-tag-label"]'));
        /* No translate is applied anywhere in the component; the two ink masses
           must already share a row. If this drifts, the fix is a measured,
           documented correction here — never a fabricated one in the CSS. */
        expect(Math.abs(iconInk.y - labelInk.y), "glyph/caption optical row").toBeLessThanOrEqual(
            TOLERANCE,
        );
        await view.screenshot("automated-tag");
    },
);
