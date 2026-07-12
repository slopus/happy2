import { expect, it } from "vitest";
import "./theme.css";
import "./styles/icon.css";
import "./styles/checkbox.css";
import { Checkbox } from "./Checkbox";
import { createRenderer } from "./testing";

type Renderer = ReturnType<typeof createRenderer>;

/* Dark stage the Relay theme actually sits on, so the subtle white-alpha box
 * fill and hairline of an unchecked control are visible and measurable. */
const STAGE = "#1c1b22";

/*
 * Alpha-weighted ink centroid of the glyph inside `boxSelector`, expressed as
 * an offset from that box's geometric center (positive = right / low). Refuses
 * blank or clipped captures: the glyph must paint pixels and its ink must sit
 * fully inside the box, so a truncated screenshot can never pass silently.
 */
async function glyphDrift(view: Renderer, boxSelector: string, glyphSelector: string) {
    const box = view.$(boxSelector);
    const glyph = view.$(glyphSelector);
    const visible = await glyph.visibleMetrics();
    expect(visible.pixelCount, `${glyphSelector} paints no pixels`).toBeGreaterThan(0);
    const glyphBounds = glyph.bounds();
    const boxBounds = box.bounds();
    const inkLeft = glyphBounds.x - boxBounds.x + visible.bounds.x;
    const inkTop = glyphBounds.y - boxBounds.y + visible.bounds.y;
    expect(inkLeft, `${glyphSelector} ink clipped at box left`).toBeGreaterThan(0);
    expect(inkTop, `${glyphSelector} ink clipped at box top`).toBeGreaterThan(0);
    expect(
        inkLeft + visible.bounds.width,
        `${glyphSelector} ink clipped at box right`,
    ).toBeLessThan(boxBounds.width);
    expect(
        inkTop + visible.bounds.height,
        `${glyphSelector} ink clipped at box bottom`,
    ).toBeLessThan(boxBounds.height);
    return {
        dx: visible.center.x + glyphBounds.x - boxBounds.x - boxBounds.width / 2,
        dy: visible.center.y + glyphBounds.y - boxBounds.y - boxBounds.height / 2,
        visible,
    };
}

const LABEL = "Enable notifications";

it("holds Checkbox geometry, colors, glyph centering, and typography across states", async () => {
    const view = createRenderer();

    // Labeled states, stacked so every root is a flex item (blockified to
    // display:flex like Button) sharing one dark stage.
    view.render(
        () => (
            <div
                style={{
                    display: "flex",
                    "flex-direction": "column",
                    "align-items": "flex-start",
                    gap: "16px",
                    padding: "20px",
                    background: STAGE,
                }}
            >
                <Checkbox checked={false} data-testid="cb-unchecked" label={LABEL} />
                <Checkbox checked data-testid="cb-checked" label={LABEL} />
                <Checkbox
                    checked={false}
                    data-testid="cb-indeterminate"
                    indeterminate
                    label={LABEL}
                />
                <Checkbox checked={false} data-testid="cb-disabled" disabled label={LABEL} />
                <Checkbox checked data-testid="cb-disabled-checked" disabled label={LABEL} />
            </div>
        ),
        { width: 300, height: 200, padding: 0 },
    );
    // Box-only controls (DataTable selection column): no label span.
    view.render(
        () => (
            <div
                style={{
                    display: "flex",
                    "align-items": "center",
                    gap: "16px",
                    padding: "20px",
                    background: STAGE,
                }}
            >
                <Checkbox aria-label="Select row" checked={false} data-testid="box-unchecked" />
                <Checkbox aria-label="Select all" checked data-testid="box-checked" />
                <Checkbox
                    aria-label="Select all"
                    checked={false}
                    data-testid="box-indeterminate"
                    indeterminate
                />
            </div>
        ),
        { width: 220, height: 78, padding: 0 },
    );
    // Standalone (not a flex item) so the root keeps its natural inline-flex.
    view.render(
        () => (
            <div style={{ padding: "20px", background: STAGE }}>
                <Checkbox checked data-testid="cb-solo" label="Accept terms" />
            </div>
        ),
        { width: 220, height: 60, padding: 0 },
    );
    await view.ready();

    /* ---- Root contract (standalone: natural inline-flex) ------------------ */

    const solo = view.$('[data-testid="cb-solo"]');
    expect(solo.element.tagName).toBe("LABEL");
    expect(
        solo.computedStyles([
            "align-items",
            "box-sizing",
            "column-gap",
            "cursor",
            "display",
            "font-family",
        ]),
    ).toMatchObject({
        "align-items": "center",
        "box-sizing": "border-box",
        "column-gap": "8px",
        cursor: "pointer",
        display: "inline-flex",
    });

    /* ---- Box geometry + per-state colors ---------------------------------- */

    const boxSpec = {
        unchecked: {
            "background-color": "rgba(255, 255, 255, 0.05)",
            "border-top-color": "rgba(255, 255, 255, 0.13)",
        },
        active: {
            "background-color": "rgb(139, 124, 247)",
            "border-top-color": "rgb(139, 124, 247)",
        },
    } as const;

    const boxCases = [
        { id: "cb-unchecked", colors: boxSpec.unchecked },
        { id: "cb-checked", colors: boxSpec.active },
        { id: "cb-indeterminate", colors: boxSpec.active },
        { id: "box-unchecked", colors: boxSpec.unchecked },
        { id: "box-checked", colors: boxSpec.active },
        { id: "box-indeterminate", colors: boxSpec.active },
    ] as const;

    for (const { id, colors } of boxCases) {
        const box = view.$(`[data-testid="${id}"] [data-rigged-ui="checkbox-box"]`);
        expect(box.bounds().width, `${id} box width`).toBe(18);
        expect(box.bounds().height, `${id} box height`).toBe(18);
        expect(
            box.computedStyles([
                "background-color",
                "border-top-color",
                "border-top-width",
                "border-radius",
                "box-sizing",
                "display",
                "height",
                "width",
            ]),
            `${id} box styles`,
        ).toEqual({
            "background-color": colors["background-color"],
            "border-top-color": colors["border-top-color"],
            "border-top-width": "1px",
            "border-radius": "6px",
            "box-sizing": "border-box",
            display: "flex",
            height: "18px",
            width: "18px",
        });
    }

    /* ---- Box vertical centering + label gap/centering (labeled case) ------ */

    for (const id of ["cb-unchecked", "cb-checked", "cb-indeterminate"]) {
        const root = view.$(`[data-testid="${id}"]`);
        const box = view.$(`[data-testid="${id}"] [data-rigged-ui="checkbox-box"]`);
        const label = view.$(`[data-testid="${id}"] [data-rigged-ui="checkbox-label"]`);
        const rootBounds = root.bounds();
        const boxBounds = box.bounds();
        const labelBounds = label.bounds();
        // 20px label line box sets the row height; the 18px box centers in it.
        expect(rootBounds.height, `${id} row height`).toBe(20);
        expect(box.offsets().left, `${id} box at row left`).toBe(0);
        expect(box.offsets().top, `${id} box vertical centering`).toBe(1);
        // 8px gap between the box and the label.
        expect(labelBounds.x - (boxBounds.x + boxBounds.width), `${id} box→label gap`).toBe(8);
        // Box center and label line-box center coincide.
        expect(
            Math.abs(boxBounds.y + boxBounds.height / 2 - (labelBounds.y + labelBounds.height / 2)),
            `${id} box/label center`,
        ).toBeLessThanOrEqual(0.5);
    }

    /* ---- Label typography -------------------------------------------------- */

    const label = view.$('[data-testid="cb-checked"] [data-rigged-ui="checkbox-label"]');
    expect(label.computedStyle("color")).toBe("rgb(237, 234, 242)");
    expect(label.textMetrics()).toMatchObject({
        font: {
            family: "Rigged Figtree, system-ui, sans-serif",
            letterSpacing: 0,
            lineHeight: 20,
            size: 13,
            weight: "500",
        },
        text: LABEL,
    });

    /* ---- Checked check glyph: reused Icon, optically centered -------------- */

    // The check is Icon's already-tuned glyph (Icon.test holds its centroid
    // ≤0.6px of its own box center), and the box centers the 14px icon on an
    // exact 2px integer inset. Measured true-2× drift is |dx| ≤ 0.038,
    // |dy| ≤ 0.036 across all three engines, so the tuned 0.4px target holds
    // (well inside the 0.75px contract ceiling for a single centered glyph).
    for (const id of ["cb-checked", "box-checked"]) {
        const drift = await glyphDrift(
            view,
            `[data-testid="${id}"] [data-rigged-ui="checkbox-box"]`,
            `[data-testid="${id}"] [data-rigged-ui="checkbox-box"] svg`,
        );
        expect(Math.abs(drift.dx), `${id} check optical x = ${drift.dx}`).toBeLessThanOrEqual(0.4);
        expect(Math.abs(drift.dy), `${id} check optical y = ${drift.dy}`).toBeLessThanOrEqual(0.4);
    }

    /* ---- Indeterminate bar: symmetric, exact box + tight centroid ---------- */

    for (const id of ["cb-indeterminate", "box-indeterminate"]) {
        const dash = view.$(`[data-testid="${id}"] [data-rigged-ui="checkbox-mark"]`);
        expect(dash.bounds().width, `${id} dash width`).toBe(8);
        expect(dash.bounds().height, `${id} dash height`).toBe(2);
        const drift = await glyphDrift(
            view,
            `[data-testid="${id}"] [data-rigged-ui="checkbox-box"]`,
            `[data-testid="${id}"] [data-rigged-ui="checkbox-mark"]`,
        );
        // Bilaterally symmetric painted content (measured |dx| ≤ 0.004,
        // |dy| ≤ 0.001 across engines): held to 0.1px, far under the 0.4 target.
        expect(Math.abs(drift.dx), `${id} dash optical x = ${drift.dx}`).toBeLessThanOrEqual(0.1);
        expect(Math.abs(drift.dy), `${id} dash optical y = ${drift.dy}`).toBeLessThanOrEqual(0.1);
    }

    /* ---- Unchecked has no glyph; box still paints its hairline ------------- */

    for (const id of ["cb-unchecked", "box-unchecked"]) {
        const box = view.$(`[data-testid="${id}"] [data-rigged-ui="checkbox-box"]`);
        expect(box.element.querySelector("svg"), `${id} no check`).toBeNull();
        expect(
            box.element.querySelector('[data-rigged-ui="checkbox-mark"]'),
            `${id} no dash`,
        ).toBeNull();
        expect((await box.visibleMetrics()).pixelCount, `${id} box ink`).toBeGreaterThan(0);
    }

    /* ---- Box-only roots carry no label ------------------------------------ */

    for (const id of ["box-unchecked", "box-checked", "box-indeterminate"]) {
        const root = view.$(`[data-testid="${id}"]`);
        expect(
            root.element.querySelector('[data-rigged-ui="checkbox-label"]'),
            `${id} label absent`,
        ).toBeNull();
        expect(root.bounds().width, `${id} root width`).toBe(18);
    }

    /* ---- Indeterminate DOM property mirrored ------------------------------- */

    expect(
        (
            view.$('[data-testid="cb-indeterminate"] [data-rigged-ui="checkbox-control"]')
                .element as HTMLInputElement
        ).indeterminate,
    ).toBe(true);
    expect(
        (
            view.$('[data-testid="cb-checked"] [data-rigged-ui="checkbox-control"]')
                .element as HTMLInputElement
        ).indeterminate,
    ).toBe(false);

    /* ---- Disabled: dimmed, not-allowed, control disabled, glyph intact ----- */

    for (const id of ["cb-disabled", "cb-disabled-checked"]) {
        const root = view.$(`[data-testid="${id}"]`);
        expect(root.computedStyles(["cursor", "opacity"]), `${id}`).toMatchObject({
            cursor: "not-allowed",
            opacity: "0.48",
        });
        expect(
            (
                view.$(`[data-testid="${id}"] [data-rigged-ui="checkbox-control"]`)
                    .element as HTMLInputElement
            ).disabled,
        ).toBe(true);
    }
    // Disabled-checked still paints its check (dimmed by the root's opacity).
    expect(
        (
            await view
                .$('[data-testid="cb-disabled-checked"] [data-rigged-ui="checkbox-box"] svg')
                .visibleMetrics()
        ).pixelCount,
    ).toBeGreaterThan(0);

    await view.screenshot("Checkbox.test");
}, 120_000);

it("holds Checkbox focus ring and reports changes through onChange", async () => {
    const changes: boolean[] = [];
    const view = createRenderer();

    view.render(
        () => (
            <div style={{ padding: "20px", background: STAGE }}>
                <Checkbox
                    checked={false}
                    data-testid="focus-cb"
                    label="Subscribe to updates"
                    onChange={(value) => changes.push(value)}
                />
            </div>
        ),
        { width: 260, height: 60, padding: 0 },
    );
    await view.ready();

    const box = view.$('[data-testid="focus-cb"] [data-rigged-ui="checkbox-box"]');
    const input = view.$('[data-testid="focus-cb"] [data-rigged-ui="checkbox-control"]')
        .element as HTMLInputElement;

    // Resting: no ring.
    expect(box.computedStyle("outline-style")).toBe("none");
    const restingBounds = box.bounds();

    input.focus();
    // Outlast the 120ms transition before reading paint styles.
    await new Promise<void>((resolve) => setTimeout(resolve, 250));
    expect(document.activeElement).toBe(input);
    // :focus-within lights the accent ring on the box.
    expect(
        box.computedStyles(["outline-color", "outline-offset", "outline-style", "outline-width"]),
    ).toEqual({
        "outline-color": "rgb(168, 155, 255)",
        "outline-offset": "2px",
        "outline-style": "solid",
        "outline-width": "2px",
    });
    // The ring is paint-only: geometry must not shift.
    expect(box.bounds()).toEqual(restingBounds);
    expect((await box.visibleMetrics()).pixelCount).toBeGreaterThan(0);

    await view.screenshot("Checkbox.focus");

    input.blur();
    await new Promise<void>((resolve) => setTimeout(resolve, 250));
    expect(box.computedStyle("outline-style")).toBe("none");

    // A click toggles the underlying control and reports the new value.
    input.click();
    expect(changes).toEqual([true]);
}, 120_000);
