import { expect, it } from "vitest";
import { server } from "vitest/browser";
import "./theme.css";
import "./styles/select.css";
import "./styles/icon.css";
import { Select, type SelectSize } from "./Select";
import { createRenderer } from "./testing";

type Renderer = ReturnType<typeof createRenderer>;

/*
 * WebKit reports font-family unquoted; Blink/Gecko keep the quotes. See
 * Button.test.tsx. textMetrics().font.family strips quotes for both.
 */
const fontFamily =
    server.browser === "webkit"
        ? "happy2 Figtree, system-ui, sans-serif"
        : '"happy2 Figtree", system-ui, sans-serif';

const options = [
    { value: "administrator", label: "Administrator" },
    { value: "member", label: "Member" },
    { value: "guest", label: "Guest" },
];

/*
 * Per-size contract. `chevronInset` is the distance from the control's
 * border-box right edge to the chevron glyph's right edge (1px border + the
 * chevron's margin-right). `chevronTop` is (height - chevron) / 2 and `valueTop`
 * is (height - line-height) / 2 — both integers on the 4px grid so every edge
 * lands on device-pixel boundaries at 2×.
 */
const sizeSpec: Record<
    SelectSize,
    {
        height: number;
        fontSize: number;
        lineHeight: number;
        chevron: number;
        chevronInset: number;
        chevronTop: number;
        valueTop: number;
    }
> = {
    small: {
        height: 28,
        fontSize: 12,
        lineHeight: 16,
        chevron: 14,
        chevronInset: 10,
        chevronTop: 7,
        valueTop: 6,
    },
    medium: {
        height: 36,
        fontSize: 13,
        lineHeight: 18,
        chevron: 16,
        chevronInset: 12,
        chevronTop: 10,
        valueTop: 9,
    },
    large: {
        height: 44,
        fontSize: 14,
        lineHeight: 20,
        chevron: 16,
        chevronInset: 14,
        chevronTop: 14,
        valueTop: 12,
    },
};

const sizes = ["small", "medium", "large"] as const;

/* A dark Relay surface so the saved PNGs read like real UI (light text is
 * invisible on the renderer's default white). Repainted away during pixel
 * measurement, so it never biases a centroid. */
const stage: Record<string, string> = {
    background: "#ffffff",
    boxSizing: "border-box",
    display: "flex",
    alignItems: "flex-start",
    gap: "24px",
    height: "100%",
    padding: "24px",
    width: "100%",
};

/*
 * Signed vertical offset of the value text's alpha-weighted ink centroid from
 * the control center (positive = low). The value span is a real, isolated
 * inline element (the chevron is a separate, non-overlapping flex box and the
 * native `<select>` overlay is opacity 0), so this is a direct measurement —
 * no chevron subtraction. Refuses blank or clipped captures.
 */
async function valueTextDriftY(view: Renderer, id: string) {
    const control = view.$(`[data-testid="${id}"] [data-happy2-ui="select-control"]`);
    const value = view.$(`[data-testid="${id}"] [data-happy2-ui="select-value"]`);
    const ink = await value.visibleMetrics();
    expect(ink.pixelCount, `${id} value paints`).toBeGreaterThan(0);
    const valueBox = value.bounds();
    expect(ink.bounds.y, `${id} value ink clipped at box top`).toBeGreaterThan(0);
    expect(ink.bounds.y + ink.bounds.height, `${id} value ink clipped at box bottom`).toBeLessThan(
        valueBox.height,
    );
    const controlBox = control.bounds();
    return valueBox.y + ink.center.y - (controlBox.y + controlBox.height / 2);
}

it("holds Select geometry, tokens, typography, chevron centering, and value centering per size", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <div style={stage}>
                {sizes.map((size) => (
                    <Select
                        data-testid={`sel-${size}`}
                        key={size}
                        label="Role"
                        options={options}
                        size={size}
                        value="administrator"
                        width={240}
                    />
                ))}
            </div>
        ),
        { width: 860, height: 120 },
    );
    await view.ready();

    for (const size of sizes) {
        const id = `sel-${size}`;
        const spec = sizeSpec[size];
        const control = view.$(`[data-testid="${id}"] [data-happy2-ui="select-control"]`);
        const value = view.$(`[data-testid="${id}"] [data-happy2-ui="select-value"]`);
        const nativeSelect = view.$(`[data-testid="${id}"] [data-happy2-ui="select-native"]`);
        const chevronBox = view.$(`[data-testid="${id}"] [data-happy2-ui="select-chevron"]`);
        const chevron = view.$(`[data-testid="${id}"] [data-happy2-ui="select-chevron"] svg`);
        const label = view.$(`[data-testid="${id}"] [data-happy2-ui="select-label"]`);

        /* ---- Control well contract -------------------------------------- */
        const controlBounds = control.bounds();
        expect(controlBounds.width, `${id} control width`).toBe(240);
        expect(controlBounds.height, `${id} control height`).toBe(spec.height);
        expect(
            control.computedStyles([
                "align-items",
                "background-color",
                "border-radius",
                "border-top-color",
                "border-top-width",
                "box-sizing",
                "display",
                "height",
                "position",
                "width",
            ]),
            id,
        ).toEqual({
            "align-items": "center",
            "background-color": "rgb(245, 245, 245)",
            "border-radius": "6px",
            "border-top-color": "rgb(234, 234, 234)",
            "border-top-width": "1px",
            "box-sizing": "border-box",
            display: "flex",
            height: `${spec.height}px`,
            position: "relative",
            width: "240px",
        });

        /* ---- Native select fills the well inside the 1px border --------- */
        expect(nativeSelect.element.tagName, `${id} native tag`).toBe("SELECT");
        expect(nativeSelect.offsets(), `${id} select inset`).toEqual({
            top: 1,
            right: 1,
            bottom: 1,
            left: 1,
        });
        expect(nativeSelect.bounds().width, `${id} select width`).toBe(238);
        expect(nativeSelect.bounds().height, `${id} select height`).toBe(spec.height - 2);
        expect(
            nativeSelect.computedStyles([
                "background-color",
                "border-top-width",
                "box-sizing",
                "cursor",
                "opacity",
                "position",
            ]),
            id,
        ).toEqual({
            "background-color": "rgba(0, 0, 0, 0)",
            "border-top-width": "0px",
            "box-sizing": "border-box",
            cursor: "pointer",
            opacity: "0",
            position: "absolute",
        });

        /* ---- Value text: box + typography + centering ------------------ */
        const valueBounds = value.bounds();
        expect(valueBounds.height, `${id} value line box`).toBe(spec.lineHeight);
        expect(valueBounds.y - controlBounds.y, `${id} value top`).toBe(spec.valueTop);
        expect(valueBounds.x - controlBounds.x, `${id} value left inset`).toBe(1); // 1px border
        expect(
            value.computedStyles([
                "color",
                "font-family",
                "font-size",
                "font-weight",
                "line-height",
                "overflow-x",
                "text-overflow",
                "white-space",
            ]),
            id,
        ).toEqual({
            color: "rgb(0, 0, 0)",
            "font-family": fontFamily,
            "font-size": `${spec.fontSize}px`,
            "font-weight": "500",
            "line-height": `${spec.lineHeight}px`,
            "overflow-x": "hidden",
            "text-overflow": "ellipsis",
            "white-space": "nowrap",
        });
        const valueMetrics = value.textMetrics();
        expect(valueMetrics.text, `${id} value text`).toBe("Administrator");
        expect(valueMetrics.font, `${id} value font`).toMatchObject({
            family: "happy2 Figtree, system-ui, sans-serif",
            letterSpacing: 0,
            lineHeight: spec.lineHeight,
            size: spec.fontSize,
            weight: "500",
        });
        /* Baseline sits inside the value line box. */
        expect(valueMetrics.baseline.fromElementTop, `${id} value baseline`).toBeGreaterThan(
            spec.fontSize * 0.6,
        );
        expect(valueMetrics.baseline.fromElementTop, `${id} value baseline`).toBeLessThan(
            spec.lineHeight,
        );

        /* Vertical centering of the value text is proven by LINE-BOX SYMMETRY:
         * the value's line box is centered in the control to backing-pixel
         * precision. Per the optical policy this — not the ink centroid — is the
         * contract for an asymmetric, left-aligned word label. */
        expect(
            Math.abs(
                valueBounds.y +
                    valueBounds.height / 2 -
                    (controlBounds.y + controlBounds.height / 2),
            ),
            `${id} value box vertical centering`,
        ).toBeLessThanOrEqual(0.1);
        /* valueTextDriftY guards against a blank/clipped value capture and
         * measures the painted ink centroid. "Administrator" is lowercase
         * x-height-heavy ink that naturally settles ~0.8–1.0px below the line-box
         * center; the policy says do NOT chase a word label's centroid to zero,
         * so this loose bound only catches catastrophic misplacement. The
         * symmetric-glyph centroid proof is the chevron (≤0.6px) below. */
        const drift = await valueTextDriftY(view, id);
        expect(
            Math.abs(drift),
            `${id} value ink offset (${drift.toFixed(3)}px, lowercase content bias)`,
        ).toBeLessThanOrEqual(1.25);

        /* ---- Chevron box: right inset + vertical centering -------------- */
        const chevronGlyph = chevron.bounds();
        expect(chevronGlyph.width, `${id} chevron width`).toBe(spec.chevron);
        expect(chevronGlyph.height, `${id} chevron height`).toBe(spec.chevron);
        expect(
            controlBounds.x + controlBounds.width - (chevronGlyph.x + chevronGlyph.width),
            `${id} chevron right inset`,
        ).toBe(spec.chevronInset);
        expect(chevronGlyph.y - controlBounds.y, `${id} chevron top`).toBe(spec.chevronTop);
        expect(
            Math.abs(
                chevronGlyph.y +
                    chevronGlyph.height / 2 -
                    (controlBounds.y + controlBounds.height / 2),
            ),
            `${id} chevron box vertical centering`,
        ).toBeLessThanOrEqual(0.1);
        expect(chevronBox.computedStyle("color"), `${id} chevron color`).toBe("rgb(142, 142, 147)");

        /* Chevron glyph ink is the tuned chevron-down Icon (Icon.test.tsx
         * proves ≤0.6px both axes at sizes 14/16); assert it renders centered
         * inside its own box so the Select adds no drift of its own. */
        const glyphInk = await chevron.visibleMetrics();
        expect(glyphInk.pixelCount, `${id} chevron ink`).toBeGreaterThan(0);
        expect(
            Math.abs(glyphInk.center.x - spec.chevron / 2),
            `${id} chevron glyph horizontal centroid`,
        ).toBeLessThanOrEqual(0.6);
        expect(
            Math.abs(glyphInk.center.y - spec.chevron / 2),
            `${id} chevron glyph vertical centroid`,
        ).toBeLessThanOrEqual(0.6);

        /* ---- Label typography (real inline text) ----------------------- */
        expect(
            label.computedStyles(["color", "display", "font-size", "font-weight", "line-height"]),
            id,
        ).toEqual({
            color: "rgb(142, 142, 147)",
            display: "block",
            "font-size": "12px",
            "font-weight": "600",
            "line-height": "16px",
        });
        const labelMetrics = label.textMetrics();
        expect(labelMetrics.text, `${id} label text`).toBe("Role");
        expect(labelMetrics.font, `${id} label font`).toMatchObject({
            family: "happy2 Figtree, system-ui, sans-serif",
            letterSpacing: 0,
            lineHeight: 16,
            size: 12,
            weight: "600",
        });
        expect((await label.visibleMetrics()).pixelCount, `${id} label ink`).toBeGreaterThan(0);
    }

    await view.screenshot("Select.test");
}, 120_000);

it("holds Select placeholder, error, disabled, focus, truncation, and fullWidth states", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <div style={{ ...stage, flexWrap: "wrap" }}>
                <Select
                    data-testid="sel-placeholder"
                    label="Role"
                    options={options}
                    placeholder="Select a role…"
                    width={240}
                />
                <Select
                    data-testid="sel-error"
                    error="Pick a role to continue"
                    label="Role"
                    options={options}
                    placeholder="Select a role…"
                    width={240}
                />
                <Select
                    data-testid="sel-hint"
                    hint="Applied to every new message"
                    label="Role"
                    options={options}
                    value="member"
                    width={240}
                />
                <Select
                    data-testid="sel-disabled"
                    disabled
                    label="Role"
                    options={options}
                    value="administrator"
                    width={240}
                />
            </div>
        ),
        { width: 600, height: 220 },
    );
    view.render(
        () => (
            <div style={{ ...stage, alignItems: "center" }}>
                <Select
                    data-testid="sel-trunc"
                    options={[
                        {
                            value: "long",
                            label: "Delete after thirty days unless a moderator pins the message",
                        },
                        { value: "short", label: "Keep forever" },
                    ]}
                    value="long"
                    width={140}
                />
            </div>
        ),
        { width: 220, height: 90 },
    );
    view.render(
        () => (
            <div data-testid="fw-wrap" style={{ ...stage, width: "320px" }}>
                <Select
                    data-testid="sel-full"
                    fullWidth
                    label="Role"
                    options={options}
                    value="member"
                />
            </div>
        ),
        { width: 320, height: 96 },
    );
    await view.ready();

    /* ---- Placeholder: muted value color, paints --------------------- */
    const placeholderRoot = view.$('[data-testid="sel-placeholder"]');
    const placeholderValue = view.$(
        '[data-testid="sel-placeholder"] [data-happy2-ui="select-value"]',
    );
    const placeholderSelect = view.$(
        '[data-testid="sel-placeholder"] [data-happy2-ui="select-native"]',
    );
    expect(placeholderRoot.element.getAttribute("data-placeholder")).toBe("");
    expect(placeholderValue.textMetrics().text).toBe("Select a role…");
    expect(placeholderValue.computedStyle("color"), "placeholder color").toBe("rgb(142, 142, 147)");
    expect((placeholderSelect.element as HTMLSelectElement).value).toBe("");
    expect((await placeholderValue.visibleMetrics()).pixelCount, "placeholder ink").toBeGreaterThan(
        0,
    );

    /* ---- Error: danger border + danger message ---------------------- */
    const errorControl = view.$('[data-testid="sel-error"] [data-happy2-ui="select-control"]');
    const errorMessage = view.$('[data-testid="sel-error"] [data-happy2-ui="select-error"]');
    expect(
        errorControl.computedStyles([
            "border-top-color",
            "border-right-color",
            "border-bottom-color",
        ]),
        "error border",
    ).toEqual({
        "border-top-color": "rgb(255, 59, 48)",
        "border-right-color": "rgb(255, 59, 48)",
        "border-bottom-color": "rgb(255, 59, 48)",
    });
    expect(errorMessage.computedStyle("color"), "error message color").toBe("rgb(255, 59, 48)");
    expect(errorMessage.textMetrics().text).toBe("Pick a role to continue");
    expect(errorMessage.textMetrics().font).toMatchObject({
        size: 12,
        weight: "500",
        lineHeight: 16,
    });
    expect((await errorMessage.visibleMetrics()).pixelCount, "error ink").toBeGreaterThan(0);

    /* ---- Hint: muted message, hooked as select-hint ----------------- */
    const hint = view.$('[data-testid="sel-hint"] [data-happy2-ui="select-hint"]');
    expect(hint.computedStyle("color"), "hint color").toBe("rgb(142, 142, 147)");
    expect(hint.textMetrics().text).toBe("Applied to every new message");

    /* ---- Disabled: dimmed, still a real disabled control ------------ */
    const disabledRoot = view.$('[data-testid="sel-disabled"]');
    const disabledSelect = view.$('[data-testid="sel-disabled"] [data-happy2-ui="select-native"]');
    expect(disabledRoot.computedStyles(["cursor", "opacity"]), "disabled root").toEqual({
        cursor: "not-allowed",
        opacity: "0.48",
    });
    expect((disabledSelect.element as HTMLSelectElement).disabled).toBe(true);

    /* ---- Focus: paint-only accent ring, geometry unchanged ---------- */
    const hintControl = view.$('[data-testid="sel-hint"] [data-happy2-ui="select-control"]');
    const hintSelect = view.$('[data-testid="sel-hint"] [data-happy2-ui="select-native"]');
    expect(hintControl.computedStyle("outline-style"), "resting outline").toBe("none");
    const restingBounds = hintControl.bounds();
    (hintSelect.element as HTMLSelectElement).focus();
    await new Promise<void>((resolve) => setTimeout(resolve, 250));
    expect(document.activeElement, "focused select").toBe(hintSelect.element);
    expect(
        hintControl.computedStyles([
            "border-top-color",
            "outline-color",
            "outline-offset",
            "outline-style",
            "outline-width",
        ]),
        "focus ring",
    ).toEqual({
        "border-top-color": "rgb(209, 209, 214)",
        "outline-color": "rgb(0, 122, 255)",
        "outline-offset": "1px",
        "outline-style": "solid",
        "outline-width": "2px",
    });
    expect(hintControl.bounds(), "focus geometry stable").toEqual(restingBounds);
    (hintSelect.element as HTMLSelectElement).blur();
    await new Promise<void>((resolve) => setTimeout(resolve, 250));
    expect(hintControl.computedStyle("outline-style"), "outline cleared on blur").toBe("none");

    /* ---- Truncation: box stays fixed, value clips with an ellipsis --- */
    const truncControl = view.$('[data-testid="sel-trunc"] [data-happy2-ui="select-control"]');
    const truncValue = view.$('[data-testid="sel-trunc"] [data-happy2-ui="select-value"]');
    const truncChevron = view.$('[data-testid="sel-trunc"] [data-happy2-ui="select-chevron"] svg');
    /* The field keeps its 140px envelope instead of growing to the ~330px the
     * long option would need. */
    expect(truncControl.bounds().width, "truncated control keeps its width").toBe(140);
    expect(
        truncValue.computedStyles(["overflow-x", "text-overflow", "white-space"]),
        "truncation contract",
    ).toEqual({
        "overflow-x": "hidden",
        "text-overflow": "ellipsis",
        "white-space": "nowrap",
    });
    /* Real overflow: the value box clips its content instead of growing. */
    expect(truncValue.element.scrollWidth, "long value overflows its clipped box").toBeGreaterThan(
        truncValue.element.clientWidth,
    );
    /* The chevron keeps its inset — the text did not push it out. */
    const truncControlBounds = truncControl.bounds();
    const truncChevronBounds = truncChevron.bounds();
    expect(
        truncControlBounds.x +
            truncControlBounds.width -
            (truncChevronBounds.x + truncChevronBounds.width),
        "chevron inset under truncation",
    ).toBe(sizeSpec.medium.chevronInset);
    expect(
        (await truncChevron.visibleMetrics()).pixelCount,
        "chevron still paints",
    ).toBeGreaterThan(0);

    /* ---- Full width fills its 320px container ------------------------ */
    const fullRoot = view.$('[data-testid="sel-full"]');
    const fullControl = view.$('[data-testid="sel-full"] [data-happy2-ui="select-control"]');
    /* 320 container - 2×24 stage padding = 272. */
    expect(fullRoot.bounds().width, "fullWidth root").toBe(272);
    expect(fullControl.bounds().width, "fullWidth control").toBe(272);
    expect(fullRoot.computedStyle("display")).toBe("flex");

    await view.screenshot("Select.states.test");
}, 120_000);
