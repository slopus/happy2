import { expect, it } from "vitest";
import { server } from "vitest/browser";
import "./theme.css";
import "./styles/form-row.css";
import "./styles/button.css";
import "./styles/icon.css";
import "./styles/badge.css";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { FormRow } from "./FormRow";
import { createRenderer } from "./testing";
type Engine = "chromium" | "firefox" | "webkit";
/* Fixed text colors so every engine reports the same rgb(). */
const TEXT = "rgb(0, 0, 0)"; // --text  #000000
const MUTED = "rgb(142, 142, 147)"; // --text-secondary #8e8e93
const HAIRLINE = "rgb(234, 234, 234)"; // --divider
type Renderer = ReturnType<typeof createRenderer>;
/*
 * Alpha-weighted ink centroid of `partSelector`, expressed as an offset from
 * the center of `hostSelector` (positive = right/low). Refuses blank or
 * clipped captures: the part must paint pixels and its ink may not touch the
 * captured element's box edges, so a truncated screenshot cannot pass quietly.
 */
async function inkDrift(view: Renderer, hostSelector: string, partSelector: string) {
    const host = view.$(hostSelector);
    const part = view.$(partSelector);
    const visible = await part.visibleMetrics();
    expect(visible.pixelCount, `${partSelector} paints no pixels`).toBeGreaterThan(0);
    const partBounds = part.bounds();
    expect(visible.bounds.x, `${partSelector} ink clipped at box left`).toBeGreaterThan(0);
    expect(visible.bounds.y, `${partSelector} ink clipped at box top`).toBeGreaterThan(0);
    expect(
        visible.bounds.x + visible.bounds.width,
        `${partSelector} ink clipped at box right`,
    ).toBeLessThan(partBounds.width);
    expect(
        visible.bounds.y + visible.bounds.height,
        `${partSelector} ink clipped at box bottom`,
    ).toBeLessThan(partBounds.height);
    const hostBounds = host.bounds();
    return {
        dx: visible.center.x + partBounds.x - hostBounds.x - hostBounds.width / 2,
        dy: visible.center.y + partBounds.y - hostBounds.y - hostBounds.height / 2,
    };
}
/* A left-aligned word label paints asymmetric ink, so its centroid is not
 * chased. Instead assert the capture is non-blank and unclipped inside its own
 * line box: a truncated or empty render then fails loudly. */
async function assertLegibleUnclipped(view: Renderer, selector: string) {
    const el = view.$(selector);
    const visible = await el.visibleMetrics();
    const box = el.bounds();
    expect(visible.pixelCount, `${selector} paints no pixels`).toBeGreaterThan(0);
    expect(visible.bounds.x, `${selector} ink clipped at left`).toBeGreaterThanOrEqual(0);
    expect(visible.bounds.y, `${selector} ink clipped at top`).toBeGreaterThan(0);
    expect(
        visible.bounds.x + visible.bounds.width,
        `${selector} ink clipped at right`,
    ).toBeLessThanOrEqual(box.width);
    expect(
        visible.bounds.y + visible.bounds.height,
        `${selector} ink clipped at bottom`,
    ).toBeLessThan(box.height);
}
it("holds FormRow layout, typography, colors, divider, and control alignment", async () => {
    const view = createRenderer();
    // Inline, label + description, control right-aligned in a fixed 420px row.
    view.render(
        () => (
            <FormRow
                control={
                    <Button data-testid="inline-control" size="medium" variant="secondary">
                        Change
                    </Button>
                }
                data-testid="inline"
                description="Applies across every workspace"
                htmlFor="appearance"
                label="Appearance"
                style={{ width: "420px" }}
            />
        ),
        { width: 460, height: 105, padding: 20 },
    );
    // Inline, label only, icon-only control — the symmetric plus glyph is the
    // centroid calibration reference.
    view.render(
        () => (
            <FormRow
                control={
                    <Button
                        aria-label="Edit"
                        data-testid="plain-control"
                        icon="plus"
                        iconOnly
                        size="small"
                        variant="secondary"
                    />
                }
                data-testid="plain"
                label="Display name"
                style={{ width: "420px" }}
            />
        ),
        { width: 460, height: 92, padding: 20 },
    );
    // Stacked, align start — control drops below the text on its own line.
    view.render(
        () => (
            <FormRow
                align="start"
                control={
                    <Button
                        data-testid="stacked-control"
                        size="medium"
                        variant="secondary"
                        width={220}
                    >
                        Upload a new avatar
                    </Button>
                }
                data-testid="stacked"
                description="PNG or JPG, at least 256×256 pixels"
                label="Profile photo"
                layout="stacked"
                style={{ width: "420px" }}
            />
        ),
        { width: 460, height: 160, padding: 20 },
    );
    // Inline vertical-align contract: a short 18px control (Badge) against the
    // 40px label+description text block. align=center centers the control in
    // the block; align=start pins it to the first (label) line. Both cases keep
    // single-line descriptions so the block stays exactly 40px in every engine.
    view.render(
        () => (
            <div style={{ display: "grid", width: "420px", rowGap: "16px" }}>
                <FormRow
                    align="center"
                    control={<Badge label="PRO" variant="accent" />}
                    data-testid="align-center"
                    description="Billed to the workspace"
                    label="Plan"
                />
                <FormRow
                    align="start"
                    control={<Badge label="ADMIN" variant="success" />}
                    data-testid="align-start"
                    description="Full workspace access"
                    label="Role"
                />
            </div>
        ),
        // Tall enough to show both 73px rows + 16px gap fully (no surface clip).
        { width: 460, height: 222, padding: 20 },
    );
    await view.ready();
    const fontFamily =
        (server.browser as Engine) === "webkit"
            ? "happy2 Figtree, system-ui, sans-serif"
            : '"happy2 Figtree", system-ui, sans-serif';
    // ---- Inline row contract ------------------------------------------------
    const inline = view.$('[data-testid="inline"]');
    // text 20 + 4 + 16 = 40 content, + 32 padding + 1 hairline = 73.
    expect(inline.bounds()).toMatchObject({ width: 420, height: 73 });
    expect(
        inline.computedStyles([
            "align-items",
            "border-bottom-color",
            "border-bottom-style",
            "border-bottom-width",
            "border-top-width",
            "box-sizing",
            "color",
            "column-gap",
            "display",
            "flex-direction",
            "font-family",
            "padding",
        ]),
    ).toEqual({
        "align-items": "center",
        "border-bottom-color": HAIRLINE,
        "border-bottom-style": "solid",
        "border-bottom-width": "1px",
        "border-top-width": "0px",
        "box-sizing": "border-box",
        color: TEXT,
        "column-gap": "24px",
        display: "flex",
        "flex-direction": "row",
        "font-family": fontFamily,
        padding: "16px 0px",
    });
    const inlineText = view.$('[data-testid="inline"] [data-happy2-ui="form-row-text"]');
    expect(inlineText.computedStyles(["display", "flex-direction", "gap", "min-width"])).toEqual({
        display: "flex",
        "flex-direction": "column",
        gap: "4px",
        "min-width": "0px",
    });
    // Text block is pinned to the leading content edge and top padding.
    expect(Math.abs(inlineText.offsets().left), "text left inset").toBeLessThanOrEqual(0.1);
    expect(Math.abs(inlineText.offsets().top - 16), "text top padding").toBeLessThanOrEqual(0.1);
    expect(inlineText.height(), "text block height").toBe(40);
    // Control is right-aligned and vertically centered against the text block.
    // offsets().top is relative to the FormRow border box, so content-box
    // center = padding-top 16 + content 40 / 2 = 36.
    const inlineControl = view.$('[data-testid="inline"] [data-happy2-ui="form-row-control"]');
    expect(Math.abs(inlineControl.offsets().right), "control right edge").toBeLessThanOrEqual(0.1);
    const controlCenter = inlineControl.offsets().top + inlineControl.bounds().height / 2;
    expect(Math.abs(controlCenter - 36), "control vertical center").toBeLessThanOrEqual(0.6);
    const textCenter = inlineText.offsets().top + inlineText.height() / 2;
    expect(Math.abs(textCenter - 36), "text vertical center").toBeLessThanOrEqual(0.6);
    // Label typography (13/600/20) and description typography (12/400/16).
    const label = view.$('[data-testid="inline"] [data-happy2-ui="form-row-label"]');
    expect(label.textMetrics()).toMatchObject({
        font: {
            family: "happy2 Figtree, system-ui, sans-serif",
            letterSpacing: 0,
            lineHeight: 20,
            size: 13,
            weight: "600",
        },
        text: "Appearance",
    });
    expect(label.computedStyle("color"), "label color").toBe(TEXT);
    const description = view.$('[data-testid="inline"] [data-happy2-ui="form-row-description"]');
    expect(description.textMetrics()).toMatchObject({
        font: {
            family: "happy2 Figtree, system-ui, sans-serif",
            letterSpacing: 0,
            lineHeight: 16,
            size: 12,
            weight: "400",
        },
        text: "Applies across every workspace",
    });
    expect(description.computedStyle("color"), "description muted color").toBe(MUTED);
    // Label sits above description with the declared 4px gap.
    const labelBounds = label.bounds();
    const descriptionBounds = description.bounds();
    expect(labelBounds.height, "label line box").toBe(20);
    expect(descriptionBounds.height, "description line box").toBe(16);
    expect(
        Math.abs(descriptionBounds.y - (labelBounds.y + labelBounds.height) - 4),
        "label→description gap",
    ).toBeLessThanOrEqual(0.1);
    // Word labels are asymmetric ink: assert non-blank + unclipped, not centroid.
    await assertLegibleUnclipped(view, '[data-testid="inline"] [data-happy2-ui="form-row-label"]');
    await assertLegibleUnclipped(
        view,
        '[data-testid="inline"] [data-happy2-ui="form-row-description"]',
    );
    // ---- Label-only inline row ---------------------------------------------
    const plain = view.$('[data-testid="plain"]');
    // control 28 taller than the single 20px label → content 28, + 33 = 61.
    expect(plain.bounds()).toMatchObject({ width: 420, height: 61 });
    const plainText = view.$('[data-testid="plain"] [data-happy2-ui="form-row-text"]');
    expect(plainText.height(), "label-only text height").toBe(20);
    // No description prop → no description element is rendered.
    expect(
        view.container.querySelector(
            '[data-testid="plain"] [data-happy2-ui="form-row-description"]',
        ),
        "label-only row omits description",
    ).toBeNull();
    const plainControl = view.$('[data-testid="plain"] [data-happy2-ui="form-row-control"]');
    expect(Math.abs(plainControl.offsets().right), "icon control right edge").toBeLessThanOrEqual(
        0.1,
    );
    // Symmetric glyph reference: the plus icon is optically centered in its
    // 28px control square on both axes (reuses the already-tuned Icon glyph).
    const plainButton = '[data-testid="plain"] [data-happy2-ui="button"]';
    const iconBox = view.$(plainButton).bounds();
    expect(iconBox.width, "icon control size").toBe(28);
    expect(iconBox.height, "icon control size").toBe(28);
    const glyph = await inkDrift(view, plainButton, `${plainButton} svg`);
    expect(Math.abs(glyph.dx), "plus glyph horizontal centroid").toBeLessThanOrEqual(0.4);
    expect(Math.abs(glyph.dy), "plus glyph vertical centroid").toBeLessThanOrEqual(0.4);
    // ---- Stacked row --------------------------------------------------------
    const stacked = view.$('[data-testid="stacked"]');
    expect(stacked.computedStyles(["align-items", "display", "flex-direction", "row-gap"])).toEqual(
        {
            "align-items": "flex-start",
            display: "flex",
            "flex-direction": "column",
            "row-gap": "12px",
        },
    );
    // 16 + 40 (text) + 12 (gap) + 36 (control) + 16 + 1 = 121.
    expect(stacked.bounds()).toMatchObject({ width: 420, height: 121 });
    const stackedText = view.$('[data-testid="stacked"] [data-happy2-ui="form-row-text"]');
    const stackedControl = view.$('[data-testid="stacked"] [data-happy2-ui="form-row-control"]');
    expect(Math.abs(stackedText.offsets().left), "stacked text left").toBeLessThanOrEqual(0.1);
    expect(Math.abs(stackedControl.offsets().left), "stacked control left").toBeLessThanOrEqual(
        0.1,
    );
    // Control is below the text with exactly the 12px stack gap.
    expect(
        Math.abs(
            stackedControl.offsets().top - (stackedText.offsets().top + stackedText.height()) - 12,
        ),
        "stacked control below text",
    ).toBeLessThanOrEqual(0.1);
    expect(stackedControl.bounds().height, "stacked control height").toBe(36);
    // ---- Inline vertical-align contract -------------------------------------
    // Both rows are inline with a 40px text block (label 20 + gap 4 + desc 16)
    // and an 18px Badge control, so the row's cross size is 40px. align only
    // moves the control on the cross axis — pure box geometry, engine-identical.
    const alignCenter = view.$('[data-testid="align-center"]');
    const alignStart = view.$('[data-testid="align-start"]');
    expect(alignCenter.computedStyle("align-items"), "align=center cross").toBe("center");
    expect(alignStart.computedStyle("align-items"), "align=start cross").toBe("flex-start");
    // Same content, so both rows resolve to the same height (16 + 40 + 16 + 1).
    expect(alignCenter.bounds(), "align=center row box").toMatchObject({ width: 420, height: 73 });
    expect(alignStart.bounds(), "align=start row box").toMatchObject({ width: 420, height: 73 });
    const centerControl = view.$(
        '[data-testid="align-center"] [data-happy2-ui="form-row-control"]',
    );
    const startControl = view.$('[data-testid="align-start"] [data-happy2-ui="form-row-control"]');
    // The control slot inherits the 18px Badge height in both rows.
    expect(centerControl.bounds().height, "center control height").toBe(18);
    expect(startControl.bounds().height, "start control height").toBe(18);
    // Both controls are right-aligned regardless of vertical align.
    expect(Math.abs(centerControl.offsets().right), "center control right").toBeLessThanOrEqual(
        0.1,
    );
    expect(Math.abs(startControl.offsets().right), "start control right").toBeLessThanOrEqual(0.1);
    // align=center: 18px control centered in the 40px block → 16 + (40 − 18) / 2 = 27 from row top.
    expect(
        Math.abs(centerControl.offsets().top - 27),
        "align=center control top",
    ).toBeLessThanOrEqual(0.1);
    // align=start: control pinned to the block top (= padding-top 16).
    expect(
        Math.abs(startControl.offsets().top - 16),
        "align=start control top",
    ).toBeLessThanOrEqual(0.1);
    // The two align modes must actually differ (guards against a no-op prop).
    expect(startControl.offsets().top, "align=start sits above align=center").toBeLessThan(
        centerControl.offsets().top,
    );
    // Painted, non-blank badges (never trust a blank capture).
    expect(
        (await view.$('[data-testid="align-center"] [data-happy2-ui="badge"]').visibleMetrics())
            .pixelCount,
        "center badge ink",
    ).toBeGreaterThan(0);
    expect(
        (await view.$('[data-testid="align-start"] [data-happy2-ui="badge"]').visibleMetrics())
            .pixelCount,
        "start badge ink",
    ).toBeGreaterThan(0);
    await view.screenshot("FormRow.test");
}, 120000);
