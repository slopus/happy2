import { expect, it } from "vitest";
import "./theme.css";
import "./styles/text-field.css";
import "./styles/icon.css";
import { TextField, type TextFieldSize } from "./TextField";
import { createRenderer } from "./testing";

type Renderer = ReturnType<typeof createRenderer>;

/*
 * Per-size geometry contract (styles/text-field.css). `lane` is the inner
 * single-line box = control height − 2px hairline border; the input fills it
 * and centers its text on that lane. Icon/input horizontal offsets are the
 * hairline (1px) + horizontal padding, then the icon glyph and 8px gap.
 */
const sizeSpecs = {
    small: { height: 28, padH: 10, font: 12, lane: 26, icon: 14 },
    medium: { height: 36, padH: 12, font: 13, lane: 34, icon: 16 },
    large: { height: 44, padH: 14, font: 14, lane: 42, icon: 18 },
} as const satisfies Record<TextFieldSize, unknown>;

const GAP = 8;
const FONT_FAMILY = "happy2 Figtree, system-ui, sans-serif";

const sizes = ["small", "medium", "large"] as const;

/*
 * Alpha-weighted ink centroid of `partSelector`, expressed as a signed offset
 * (positive = right/low) from the center of `refSelector`'s border box.
 * Refuses blank or clipped captures: the part must paint pixels and its ink
 * must not touch the captured box edges, so a truncated screenshot can never
 * pass silently.
 */
async function inkDrift(view: Renderer, refSelector: string, partSelector: string) {
    const ref = view.$(refSelector);
    const part = view.$(partSelector);
    const visible = await part.visibleMetrics();
    expect(visible.pixelCount, `${partSelector} paints no pixels`).toBeGreaterThan(0);
    const partBounds = part.bounds();
    expect(visible.bounds.y, `${partSelector} ink clipped at box top`).toBeGreaterThan(0);
    expect(
        visible.bounds.y + visible.bounds.height,
        `${partSelector} ink clipped at box bottom`,
    ).toBeLessThan(partBounds.height);
    expect(visible.bounds.x, `${partSelector} ink clipped at box left`).toBeGreaterThan(0);
    expect(
        visible.bounds.x + visible.bounds.width,
        `${partSelector} ink clipped at box right`,
    ).toBeLessThan(partBounds.width);
    const refBounds = ref.bounds();
    return {
        dx: visible.center.x + partBounds.x - refBounds.x - refBounds.width / 2,
        dy: visible.center.y + partBounds.y - refBounds.y - refBounds.height / 2,
    };
}

it("holds TextField sizes, typography, label, hint, and leading-icon geometry", async () => {
    const view = createRenderer();

    view.render(
        () => (
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    gap: "20px",
                }}
            >
                <TextField
                    data-testid="tf-small"
                    hint="Shown publicly"
                    label="Name"
                    required
                    size="small"
                    value="Ada Lovelace"
                />
                <TextField
                    data-testid="tf-medium"
                    hint="We never share it"
                    label="Email"
                    placeholder="ada@example.com"
                    size="medium"
                    value="ada@example.com"
                />
                <TextField
                    data-testid="tf-large"
                    label="Employee ID"
                    size="large"
                    value="ENG-2048"
                />
            </div>
        ),
        { width: 360, height: 340, padding: 20 },
    );
    view.render(
        () => (
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    gap: "20px",
                }}
            >
                <TextField
                    data-testid="ic-small"
                    leadingIcon="search"
                    placeholder="Search"
                    size="small"
                    type="search"
                />
                <TextField
                    data-testid="ic-medium"
                    leadingIcon="at"
                    size="medium"
                    type="email"
                    value="ada@example.com"
                />
                <TextField
                    data-testid="ic-large"
                    leadingIcon="search"
                    placeholder="Search"
                    size="large"
                />
            </div>
        ),
        { width: 360, height: 220, padding: 20 },
    );
    await view.ready();

    /* ---- Sizes, control contract, input typography ---------------------- */

    for (const size of sizes) {
        const spec = sizeSpecs[size];
        const id = `tf-${size}`;
        const control = view.$(`[data-testid="${id}"] [data-happy2-ui="text-field-control"]`);
        const input = view.$(`[data-testid="${id}"] [data-happy2-ui="text-field-input"]`);

        expect(control.height(), id).toBe(spec.height);
        expect(
            control.computedStyles([
                "align-items",
                "background-color",
                "border-radius",
                "border-top-color",
                "border-top-style",
                "border-top-width",
                "box-sizing",
                "display",
                "height",
                "padding-bottom",
                "padding-left",
                "padding-right",
                "padding-top",
            ]),
            id,
        ).toEqual({
            "align-items": "center",
            "background-color": "rgba(255, 255, 255, 0.05)",
            "border-radius": "6px",
            "border-top-color": "rgba(255, 255, 255, 0.07)",
            "border-top-style": "solid",
            "border-top-width": "1px",
            "box-sizing": "border-box",
            display: "flex",
            height: `${spec.height}px`,
            "padding-bottom": "0px",
            "padding-left": `${spec.padH}px`,
            "padding-right": `${spec.padH}px`,
            "padding-top": "0px",
        });

        // Single-line lane fills the inner box and centers on it.
        expect(input.bounds().height, `${id} input lane`).toBe(spec.lane);
        expect(
            Math.abs(input.bounds().y - control.bounds().y - 1),
            `${id} input top on hairline`,
        ).toBeLessThanOrEqual(0.1);
        // No icon → input starts at hairline + horizontal padding.
        expect(
            Math.abs(input.bounds().x - control.bounds().x - (1 + spec.padH)),
            `${id} input left inset`,
        ).toBeLessThanOrEqual(0.1);

        expect(
            input.computedStyles([
                "background-color",
                "border-top-width",
                "color",
                "font-size",
                "font-weight",
                "line-height",
                "padding-left",
                "padding-top",
            ]),
            id,
        ).toEqual({
            "background-color": "rgba(0, 0, 0, 0)",
            "border-top-width": "0px",
            color: "rgb(237, 234, 242)",
            "font-size": `${spec.font}px`,
            "font-weight": "500",
            "line-height": `${spec.lane}px`,
            "padding-left": "0px",
            "padding-top": "0px",
        });
        expect(input.textMetrics().font, id).toMatchObject({
            family: FONT_FAMILY,
            letterSpacing: 0,
            lineHeight: spec.lane,
            size: spec.font,
            weight: "500",
        });
        expect((await input.visibleMetrics()).pixelCount, `${id} paints text`).toBeGreaterThan(0);

        // Label typography + programmatic association with the input.
        const label = view.$(`[data-testid="${id}"] [data-happy2-ui="text-field-label"]`);
        expect(
            label.computedStyles([
                "align-items",
                "color",
                "display",
                "font-size",
                "font-weight",
                "line-height",
            ]),
            id,
        ).toEqual({
            "align-items": "center",
            color: "rgb(237, 234, 242)",
            // inline-flex, blockified: the label is a flex item of the field root.
            display: "flex",
            "font-size": "13px",
            "font-weight": "600",
            "line-height": "16px",
        });
        expect((input.element as HTMLInputElement).id, `${id} input id`).toBeTruthy();
        expect(label.element.getAttribute("for"), `${id} label association`).toBe(
            (input.element as HTMLInputElement).id,
        );
    }

    // Default (non-fullWidth) field is the 240px standard width.
    expect(view.$('[data-testid="tf-medium"]').bounds().width).toBe(240);

    // Placeholder paints in the muted token.
    const mediumInput = view.$('[data-testid="tf-medium"] [data-happy2-ui="text-field-input"]');
    expect(getComputedStyle(mediumInput.element, "::placeholder").color).toBe("rgb(117, 112, 133)");

    // Required marker: danger token, actually painted.
    const required = view.$('[data-testid="tf-small"] [data-happy2-ui="text-field-required"]');
    expect(required.computedStyle("color")).toBe("rgb(248, 113, 113)");
    expect((await required.visibleMetrics()).pixelCount).toBeGreaterThan(0);

    // Hint message: muted token, correct hook + tone, painted.
    const hint = view.$('[data-testid="tf-small"] [data-happy2-ui="text-field-hint"]');
    expect(hint.element.getAttribute("data-tone")).toBe("hint");
    expect(hint.computedStyles(["color", "font-size", "line-height"])).toEqual({
        color: "rgb(117, 112, 133)",
        "font-size": "12px",
        "line-height": "16px",
    });
    expect(hint.element.textContent).toBe("Shown publicly");
    expect((await hint.visibleMetrics()).pixelCount).toBeGreaterThan(0);

    // Filled value paints inside the large control. The vertical contract for
    // the input run is its centered line box (input.y − control.y === 1 and
    // input height === lane, asserted per size above): baseline-to-cap-height
    // ink (caps/digits) sits inherently above a symmetric line box's center,
    // and that offset scales with font size, so an absolute alpha centroid is
    // the wrong target for the tall 44px lane (DESIGN: text classes are not a
    // universal centroid target). The strict value-text centroid is anchored
    // on the medium par-val "ORBIT-2048" in the states test instead.
    const largeInput = view.$('[data-testid="tf-large"] [data-happy2-ui="text-field-input"]');
    expect((await largeInput.visibleMetrics()).pixelCount).toBeGreaterThan(0);

    /* ---- Leading icon geometry + glyph centering ------------------------ */

    for (const size of sizes) {
        const spec = sizeSpecs[size];
        const id = `ic-${size}`;
        const control = view.$(`[data-testid="${id}"] [data-happy2-ui="text-field-control"]`);
        const iconBox = view.$(`[data-testid="${id}"] [data-happy2-ui="text-field-icon"]`);
        const glyph = view.$(`[data-testid="${id}"] [data-happy2-ui="text-field-icon"] svg`);
        const input = view.$(`[data-testid="${id}"] [data-happy2-ui="text-field-input"]`);

        expect(control.height(), id).toBe(spec.height);
        expect(glyph.bounds().width, `${id} icon width`).toBe(spec.icon);
        expect(glyph.bounds().height, `${id} icon height`).toBe(spec.icon);
        expect(iconBox.computedStyle("color"), `${id} icon color`).toBe("rgb(117, 112, 133)");

        // Icon box: hairline + padding in, vertically centered in the lane.
        expect(
            Math.abs(iconBox.bounds().x - control.bounds().x - (1 + spec.padH)),
            `${id} icon left inset`,
        ).toBeLessThanOrEqual(0.1);
        expect(
            Math.abs(iconBox.bounds().y - control.bounds().y - (1 + (spec.lane - spec.icon) / 2)),
            `${id} icon vertical centering`,
        ).toBeLessThanOrEqual(0.1);
        // Input starts after the icon + 8px gap.
        expect(
            Math.abs(input.bounds().x - control.bounds().x - (1 + spec.padH + spec.icon + GAP)),
            `${id} input inset after icon`,
        ).toBeLessThanOrEqual(0.1);

        // Composed Icon glyphs are already ≤0.4px optically centered in their
        // own box (Icon.test.tsx), and the field must not disturb that. Held
        // to the 0.4px tuning target (contract ceiling 0.75).
        const drift = await inkDrift(
            view,
            `[data-testid="${id}"] [data-happy2-ui="text-field-icon"] svg`,
            `[data-testid="${id}"] [data-happy2-ui="text-field-icon"] svg`,
        );
        expect(Math.abs(drift.dx), `${id} glyph horizontal centroid`).toBeLessThanOrEqual(0.4);
        expect(Math.abs(drift.dy), `${id} glyph vertical centroid`).toBeLessThanOrEqual(0.4);
    }

    // Type passthrough.
    expect(
        (
            view.$('[data-testid="ic-small"] [data-happy2-ui="text-field-input"]')
                .element as HTMLInputElement
        ).type,
    ).toBe("search");

    await view.screenshot("TextField.test");
}, 120_000);

it("holds TextField focus, error, disabled, textarea, width, and placeholder parity", async () => {
    const view = createRenderer();

    view.render(
        () => (
            <div style={{ display: "flex", alignItems: "flex-start" }}>
                <TextField
                    data-testid="focus-field"
                    label="Search"
                    placeholder="Search messages…"
                    style={{ width: "260px" }}
                />
            </div>
        ),
        { width: 320, height: 120, padding: 24 },
    );
    view.render(
        () => (
            <div style={{ display: "flex", alignItems: "flex-start" }}>
                <TextField
                    data-testid="error-field"
                    error="Enter a valid email address"
                    label="Email"
                    style={{ width: "280px" }}
                    value="ada@example"
                />
            </div>
        ),
        { width: 340, height: 150, padding: 24 },
    );
    view.render(
        () => (
            <div style={{ display: "flex", alignItems: "flex-start" }}>
                <TextField
                    data-testid="disabled-field"
                    disabled
                    label="Workspace ID"
                    style={{ width: "260px" }}
                    value="ws_9f31c2"
                />
            </div>
        ),
        { width: 320, height: 120, padding: 24 },
    );
    view.render(
        () => (
            <div style={{ display: "flex", alignItems: "flex-start" }}>
                <TextField
                    data-testid="ta-field"
                    label="Topic"
                    multiline
                    rows={3}
                    style={{ width: "320px" }}
                    value={"Ship the Relay redesign.\nOwners on point."}
                />
            </div>
        ),
        { width: 360, height: 200, padding: 20 },
    );
    view.render(
        () => (
            <div
                style={{
                    background: "#1c1b22",
                    boxSizing: "border-box",
                    padding: "20px",
                    width: "360px",
                }}
            >
                <div style={{ display: "grid", gap: "16px" }}>
                    <TextField
                        data-testid="fw-field"
                        fullWidth
                        label="Subject"
                        placeholder="What changed?"
                    />
                    <TextField data-testid="def-field" label="Default" placeholder="acme-studio" />
                </div>
            </div>
        ),
        { width: 400, height: 240, padding: 20 },
    );
    view.render(
        () => (
            <div style={{ display: "flex", gap: "24px" }}>
                <TextField
                    data-testid="par-ph"
                    placeholder="ORBIT-2048"
                    style={{ width: "260px" }}
                />
                <TextField data-testid="par-val" style={{ width: "260px" }} value="ORBIT-2048" />
            </div>
        ),
        { width: 620, height: 96, padding: 24 },
    );
    await view.ready();

    /* ---- Focus treatment ------------------------------------------------ */

    const focusControl = view.$(
        '[data-testid="focus-field"] [data-happy2-ui="text-field-control"]',
    );
    const focusInput = view.$('[data-testid="focus-field"] [data-happy2-ui="text-field-input"]');
    expect(focusControl.computedStyle("border-top-color")).toBe("rgba(255, 255, 255, 0.07)");
    expect(focusControl.computedStyle("outline-style")).toBe("none");
    const restBounds = focusControl.bounds();

    (focusInput.element as HTMLInputElement).focus();
    // Keep the regenerated baseline PNG caret-blink-proof.
    (focusInput.element as HTMLInputElement).style.caretColor = "transparent";
    // Outlast the 120ms border-color transition before reading styles.
    await new Promise<void>((resolve) => setTimeout(resolve, 250));

    expect(document.activeElement).toBe(focusInput.element);
    expect(
        focusControl.computedStyles([
            "border-top-color",
            "outline-color",
            "outline-offset",
            "outline-style",
            "outline-width",
        ]),
    ).toEqual({
        "border-top-color": "rgba(255, 255, 255, 0.13)",
        "outline-color": "rgb(168, 155, 255)",
        "outline-offset": "1px",
        "outline-style": "solid",
        "outline-width": "2px",
    });
    // The ring is paint-only: geometry must not shift.
    expect(focusControl.bounds()).toEqual(restBounds);
    expect((await focusInput.visibleMetrics()).pixelCount).toBeGreaterThan(0);

    await view.screenshot("TextField.states.test");

    (focusInput.element as HTMLInputElement).blur();
    await new Promise<void>((resolve) => setTimeout(resolve, 250));
    expect(focusControl.computedStyle("outline-style")).toBe("none");
    expect(focusControl.computedStyle("border-top-color")).toBe("rgba(255, 255, 255, 0.07)");

    /* ---- Error state ---------------------------------------------------- */

    const errorControl = view.$(
        '[data-testid="error-field"] [data-happy2-ui="text-field-control"]',
    );
    const errorInput = view.$('[data-testid="error-field"] [data-happy2-ui="text-field-input"]');
    const errorMsg = view.$('[data-testid="error-field"] [data-happy2-ui="text-field-error"]');
    expect(errorControl.computedStyle("border-top-color")).toBe("rgb(248, 113, 113)");
    expect(errorMsg.element.getAttribute("data-tone")).toBe("error");
    expect(errorMsg.computedStyle("color")).toBe("rgb(248, 113, 113)");
    expect(errorMsg.element.textContent).toBe("Enter a valid email address");
    expect(errorInput.element.getAttribute("aria-invalid")).toBe("true");
    expect(errorInput.element.getAttribute("aria-describedby")).toBe(errorMsg.element.id);
    expect((await errorMsg.visibleMetrics()).pixelCount).toBeGreaterThan(0);

    /* ---- Disabled state ------------------------------------------------- */

    const disabledRoot = view.$('[data-testid="disabled-field"]');
    const disabledControl = view.$(
        '[data-testid="disabled-field"] [data-happy2-ui="text-field-control"]',
    );
    const disabledInput = view.$(
        '[data-testid="disabled-field"] [data-happy2-ui="text-field-input"]',
    );
    expect(disabledRoot.computedStyle("opacity")).toBe("0.5");
    expect((disabledInput.element as HTMLInputElement).disabled).toBe(true);
    expect(disabledInput.computedStyle("cursor")).toBe("not-allowed");
    expect(disabledControl.computedStyle("cursor")).toBe("not-allowed");
    expect((await disabledInput.visibleMetrics()).pixelCount).toBeGreaterThan(0);

    /* ---- Multiline textarea --------------------------------------------- */

    const taControl = view.$('[data-testid="ta-field"] [data-happy2-ui="text-field-control"]');
    const taInput = view.$('[data-testid="ta-field"] [data-happy2-ui="text-field-input"]');
    expect(taInput.element.tagName).toBe("TEXTAREA");
    expect(taInput.element.getAttribute("rows")).toBe("3");
    expect(taInput.computedStyles(["font-size", "line-height"])).toEqual({
        "font-size": "13px",
        "line-height": "20px",
    });
    // 3 rows × 20px reading line, box grown with 8px vertical padding + border.
    expect(taInput.bounds().height).toBe(60);
    expect(taControl.bounds().height).toBe(78);
    expect(
        taControl.computedStyles(["align-items", "padding-bottom", "padding-left", "padding-top"]),
    ).toEqual({
        "align-items": "flex-start",
        "padding-bottom": "8px",
        "padding-left": "12px",
        "padding-top": "8px",
    });
    expect((await taInput.visibleMetrics()).pixelCount).toBeGreaterThan(0);

    /* ---- Width: fullWidth fills its container; default is 240px ---------- */

    // 360px container − 40px padding = 320px content.
    expect(view.$('[data-testid="fw-field"]').bounds().width).toBe(320);
    expect(
        view.$('[data-testid="fw-field"] [data-happy2-ui="text-field-control"]').bounds().width,
    ).toBe(320);
    expect(view.$('[data-testid="def-field"]').bounds().width).toBe(240);

    /* ---- Placeholder vs value baseline parity --------------------------- */

    const parPh = view.$('[data-testid="par-ph"] [data-happy2-ui="text-field-input"]');
    const parVal = view.$('[data-testid="par-val"] [data-happy2-ui="text-field-input"]');
    const parValControl = view.$('[data-testid="par-val"] [data-happy2-ui="text-field-control"]');
    expect(parPh.element.getAttribute("placeholder")).toBe("ORBIT-2048");
    expect((parVal.element as HTMLInputElement).value).toBe("ORBIT-2048");
    expect(getComputedStyle(parPh.element, "::placeholder").color).toBe("rgb(117, 112, 133)");

    const phInk = await parPh.visibleMetrics();
    const valInk = await parVal.visibleMetrics();
    expect(phInk.pixelCount).toBeGreaterThan(0);
    expect(valInk.pixelCount).toBeGreaterThan(0);
    // Both fields share one surface row, so their baselines sit at the same
    // device-pixel phase: the placeholder must paint on exactly the same
    // baseline as the identical committed value.
    expect(
        Math.abs(phInk.center.y + parPh.bounds().y - (valInk.center.y + parVal.bounds().y)),
        "placeholder vs value baseline parity",
    ).toBeLessThanOrEqual(0.4);
    // Committed "ORBIT-2048" (caps + lining digits) centers on the 36px midline.
    expect(
        Math.abs(valInk.center.y + (parVal.bounds().y - parValControl.bounds().y) - 18),
        "value vertical centroid",
    ).toBeLessThanOrEqual(0.75);
}, 120_000);
