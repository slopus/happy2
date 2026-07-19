import { expect, it } from "vitest";
import { server, userEvent } from "vitest/browser";
import "./theme.css";
import "./styles/segmented-control.css";
import "./styles/icon.css";
import { SegmentedControl } from "./SegmentedControl";
import { createRenderer } from "./testing";

const RANGE = [
    { value: "day", label: "Day" },
    { value: "week", label: "Week" },
    { value: "month", label: "Month" },
];

/*
 * Contract geometry per size. Track height is the control contract (28/36/44);
 * the segment/pill height is that minus the 1px hairline (×2) and the 4px inset
 * pad (×2): 28−2−8=18, 36−2−8=26, 44−2−8=34. All even so 2× device edges land
 * on physical pixels.
 */
const sizeSpec = {
    small: { height: 28, seg: 18, fontSize: 12, lineHeight: 16 },
    medium: { height: 36, seg: 26, fontSize: 13, lineHeight: 18 },
    large: { height: 44, seg: 34, fontSize: 14, lineHeight: 20 },
} as const;

const sizes = ["small", "medium", "large"] as const;

type Renderer = ReturnType<typeof createRenderer>;

/* WebKit reports the family unquoted; textMetrics strips quotes for both. */
const fontFamily = () =>
    server.browser === "webkit"
        ? "happy2 Figtree, system-ui, sans-serif"
        : '"happy2 Figtree", system-ui, sans-serif';

/*
 * Alpha-weighted ink centroid of a symmetric composed Icon glyph, expressed as
 * an offset from the center of its own svg box (positive = right/low). The svg
 * must sit over a painted ancestor (an inactive segment, whose transparent fill
 * lets the track be repainted black/white) — never over the raised pill, whose
 * constant fill would defeat the alpha reconstruction. Refuses blank or clipped
 * captures: the glyph must paint pixels and its ink may not touch the svg box
 * edges, so a truncated screenshot can never pass silently.
 */
async function glyphDrift(view: Renderer, svgSelector: string) {
    const svg = view.$(svgSelector);
    const visible = await svg.visibleMetrics();
    expect(visible.pixelCount, `${svgSelector} paints no pixels`).toBeGreaterThan(0);
    const box = svg.bounds();
    expect(visible.bounds.x, `${svgSelector} ink clipped at left`).toBeGreaterThan(0);
    expect(visible.bounds.y, `${svgSelector} ink clipped at top`).toBeGreaterThan(0);
    expect(
        visible.bounds.x + visible.bounds.width,
        `${svgSelector} ink clipped at right`,
    ).toBeLessThan(box.width);
    expect(
        visible.bounds.y + visible.bounds.height,
        `${svgSelector} ink clipped at bottom`,
    ).toBeLessThan(box.height);
    return {
        dx: visible.center.x - box.width / 2,
        dy: visible.center.y - box.height / 2,
    };
}

async function settleSegmentColors(view: Renderer, activeSelector: string) {
    /* The browser pointer can begin over the first fixture's inactive segment.
     * Park it on an active segment, then remove color-transition timing so
     * computed token assertions cannot sample an interpolated Firefox frame. */
    await userEvent.hover(view.$(activeSelector).element);
    for (const segment of view.container.querySelectorAll<HTMLElement>(
        ".happy2-segmented-control__segment",
    )) {
        segment.style.setProperty("transition", "none", "important");
    }
}

it("holds SegmentedControl dimensions, layout, colors, and pill placement", async () => {
    const view = createRenderer();

    // Each size as a fullWidth 3-segment control in a 280px well: content is
    // 280−2−8=270, so the three equal columns are exactly 90px.
    for (const size of sizes) {
        view.render(
            () => (
                <div style={{ width: "280px" }}>
                    <SegmentedControl
                        data-testid={`sc-${size}`}
                        fullWidth
                        segments={RANGE}
                        size={size}
                        value="week"
                    />
                </div>
            ),
            { width: 320, height: sizeSpec[size].height + 24, padding: 12 },
        );
    }
    // Content-sized default (inline-grid), two segments of unequal label length:
    // both columns must still resolve to the widest label's width.
    view.render(
        () => (
            <SegmentedControl
                data-testid="sc-content"
                segments={[
                    { value: "on", label: "Enabled" },
                    { value: "off", label: "Off" },
                ]}
                value="on"
            />
        ),
        { width: 320, height: 60, padding: 12 },
    );
    await view.ready();
    await settleSegmentColors(view, '[data-testid="sc-small"] [data-value="week"]');

    for (const size of sizes) {
        const id = `sc-${size}`;
        const spec = sizeSpec[size];
        const control = view.$(`[data-testid="${id}"]`);
        const bounds = control.bounds();
        expect(bounds.width, `${id} width`).toBe(280);
        expect(bounds.height, `${id} height`).toBe(spec.height);
        expect(
            control.computedStyles([
                "background-color",
                "border-radius",
                "border-top-color",
                "border-top-width",
                "box-sizing",
                "display",
                "font-family",
                "height",
            ]),
            id,
        ).toEqual({
            "background-color": "rgb(245, 245, 245)",
            "border-radius": "6px",
            "border-top-color": "rgb(234, 234, 234)",
            "border-top-width": "1px",
            "box-sizing": "border-box",
            display: "grid",
            "font-family": fontFamily(),
            height: `${spec.height}px`,
        });
        // The CSS variables that drive the pill geometry are wired from props.
        expect(control.computedStyle("--happy2-segmented-count"), id).toBe("3");
        expect(control.computedStyle("--happy2-segmented-index"), id).toBe("1");

        // Equal segment widths (3 × 90) and the integer contract heights.
        const values = ["day", "week", "month"];
        const segBounds = values.map((value) =>
            view.$(`[data-testid="${id}"] [data-value="${value}"]`).bounds(),
        );
        for (const [index, sb] of segBounds.entries()) {
            expect(sb.width, `${id} seg ${values[index]} width`).toBe(90);
            expect(sb.height, `${id} seg ${values[index]} height`).toBe(spec.seg);
        }

        // The pill border box lands on the selected segment (week = 1). The
        // segment box is an exact 90×spec grid cell; WebKit rounds the pill's
        // calc() width by ~0.02px, so the pill is asserted against the segment
        // within tolerance rather than the discrete literal.
        const pill = view.$(`[data-testid="${id}"] [data-happy2-ui="segmented-control-pill"]`);
        const pillBounds = pill.bounds();
        const weekBounds = segBounds[1]!;
        expect(Math.abs(pillBounds.x - weekBounds.x), `${id} pill x`).toBeLessThanOrEqual(0.1);
        expect(Math.abs(pillBounds.y - weekBounds.y), `${id} pill y`).toBeLessThanOrEqual(0.1);
        expect(
            Math.abs(pillBounds.width - weekBounds.width),
            `${id} pill width`,
        ).toBeLessThanOrEqual(0.1);
        expect(
            Math.abs(pillBounds.height - weekBounds.height),
            `${id} pill height`,
        ).toBeLessThanOrEqual(0.1);
        expect(
            pill.computedStyles([
                "background-color",
                "border-radius",
                "border-top-color",
                "box-sizing",
                "position",
            ]),
            `${id} pill`,
        ).toEqual({
            "background-color": "rgb(240, 240, 242)",
            "border-radius": "1px",
            "border-top-color": "rgb(209, 209, 214)",
            "box-sizing": "border-box",
            position: "absolute",
        });

        // Active vs inactive foreground tokens.
        const activeLabel = view.$(
            `[data-testid="${id}"] [data-value="week"] [data-happy2-ui="segmented-control-label"]`,
        );
        const inactiveLabel = view.$(
            `[data-testid="${id}"] [data-value="day"] [data-happy2-ui="segmented-control-label"]`,
        );
        expect(activeLabel.computedStyle("color"), `${id} active color`).toBe("rgb(0, 0, 0)");
        expect(inactiveLabel.computedStyle("color"), `${id} inactive color`).toBe(
            "rgb(142, 142, 147)",
        );

        // Label typography contract.
        expect(activeLabel.textMetrics(), `${id} typography`).toMatchObject({
            font: {
                family: "happy2 Figtree, system-ui, sans-serif",
                letterSpacing: spec.fontSize / 100,
                lineHeight: spec.lineHeight,
                size: spec.fontSize,
                weight: "600",
            },
            text: "Week",
        });

        // Word labels are horizontally asymmetric ink, so centering is asserted
        // as line-box symmetry inside each segment rather than an ink centroid.
        for (const value of values) {
            const seg = view.$(`[data-testid="${id}"] [data-value="${value}"]`).bounds();
            const label = view
                .$(
                    `[data-testid="${id}"] [data-value="${value}"] [data-happy2-ui="segmented-control-label"]`,
                )
                .bounds();
            const left = label.x - seg.x;
            const right = seg.x + seg.width - label.x - label.width;
            expect(Math.abs(left - right), `${id} ${value} label symmetry`).toBeLessThanOrEqual(
                0.5,
            );
        }
    }

    // Content-sized control shrink-wraps yet keeps equal columns.
    const content = view.$('[data-testid="sc-content"]');
    expect(content.computedStyle("display"), "content display").toBe("inline-grid");
    const onBounds = view.$('[data-testid="sc-content"] [data-value="on"]').bounds();
    const offBounds = view.$('[data-testid="sc-content"] [data-value="off"]').bounds();
    expect(offBounds.width, "equal content columns").toBe(onBounds.width);
    const contentPill = view
        .$('[data-testid="sc-content"] [data-happy2-ui="segmented-control-pill"]')
        .bounds();
    expect(Math.abs(contentPill.x - onBounds.x), "content pill x").toBeLessThanOrEqual(0.1);
    expect(Math.abs(contentPill.width - onBounds.width), "content pill width").toBeLessThanOrEqual(
        0.1,
    );

    await view.screenshot("SegmentedControl.test");
}, 120_000);

it("holds SegmentedControl icon segments, selection sweep, fullWidth, and disabled state", async () => {
    const view = createRenderer();

    const ICONS = [
        { value: "board", label: "Board", icon: "inbox" as const },
        { value: "list", label: "List", icon: "clock" as const },
        { value: "grid", label: "Home", icon: "home" as const },
    ];
    // Medium icon control, fullWidth in a 280px well (columns = 90).
    view.render(
        () => (
            <div style={{ width: "280px" }}>
                <SegmentedControl data-testid="sc-icons" fullWidth segments={ICONS} value="list" />
            </div>
        ),
        { width: 320, height: 60, padding: 12 },
    );
    // Small (icon 14) and large (icon 18) content-sized controls for the size→
    // icon mapping.
    view.render(
        () => (
            <div style={{ display: "flex", gap: "16px" }}>
                <SegmentedControl
                    data-testid="sc-icons-sm"
                    segments={ICONS}
                    size="small"
                    value="list"
                />
                <SegmentedControl
                    data-testid="sc-icons-lg"
                    segments={ICONS}
                    size="large"
                    value="list"
                />
            </div>
        ),
        { width: 460, height: 72, padding: 12 },
    );

    const SWEEP = [
        { value: "a", label: "Auto" },
        { value: "b", label: "Online" },
        { value: "c", label: "Away" },
        { value: "d", label: "Busy" },
    ];
    // Four-segment sweep, fullWidth in a 282px well: content 272 / 4 = 68.
    for (let index = 0; index < SWEEP.length; index += 1) {
        view.render(
            () => (
                <div style={{ width: "282px" }}>
                    <SegmentedControl
                        data-testid={`sweep-${index}`}
                        fullWidth
                        segments={SWEEP}
                        value={SWEEP[index]!.value}
                    />
                </div>
            ),
            { width: 320, height: 56, padding: 12 },
        );
    }

    view.render(
        () => <SegmentedControl data-testid="sc-disabled" disabled segments={RANGE} value="day" />,
        { width: 300, height: 60, padding: 12 },
    );
    await view.ready();
    await settleSegmentColors(view, '[data-testid="sc-icons"] [data-value="list"]');

    // Icon box geometry: 16px glyph on the medium control, 6px gap to the label.
    const iconBox = view.$('[data-testid="sc-icons"] [data-value="board"] [data-happy2-ui="icon"]');
    const iconBounds = iconBox.bounds();
    expect(iconBounds.width, "icon box width").toBe(16);
    expect(iconBounds.height, "icon box height").toBe(16);
    const iconLabel = view
        .$(
            '[data-testid="sc-icons"] [data-value="board"] [data-happy2-ui="segmented-control-label"]',
        )
        .bounds();
    expect(iconLabel.x - (iconBounds.x + iconBounds.width), "icon → label gap").toBe(6);

    // Size → icon mapping: 14 at small, 18 at large.
    expect(
        view.$('[data-testid="sc-icons-sm"] [data-value="board"] [data-happy2-ui="icon"]').bounds()
            .width,
        "small icon",
    ).toBe(14);
    expect(
        view.$('[data-testid="sc-icons-lg"] [data-value="board"] [data-happy2-ui="icon"]').bounds()
            .width,
        "large icon",
    ).toBe(18);

    // Reused symmetric Icon glyphs on the two inactive segments must be
    // optically centered in their own 16px box, unclipped. These are the same
    // glyphs Icon.test enforces to ≤0.6px at 16px in every engine (well within
    // the 0.75px optical ceiling); measured over the transparent inactive
    // segments so the alpha reconstruction is not defeated by the raised pill.
    for (const value of ["board", "grid"]) {
        const drift = await glyphDrift(
            view,
            `[data-testid="sc-icons"] [data-value="${value}"] [data-happy2-ui="icon"]`,
        );
        expect(Math.abs(drift.dx), `${value} glyph horizontal centroid`).toBeLessThanOrEqual(0.6);
        expect(Math.abs(drift.dy), `${value} glyph vertical centroid`).toBeLessThanOrEqual(0.6);
    }

    // Selection sweep: the pill tracks whichever segment is selected, and only
    // that segment carries the active foreground token.
    for (let index = 0; index < SWEEP.length; index += 1) {
        const id = `sweep-${index}`;
        const control = view.$(`[data-testid="${id}"]`);
        expect(control.computedStyle("--happy2-segmented-index"), id).toBe(String(index));
        const pill = view
            .$(`[data-testid="${id}"] [data-happy2-ui="segmented-control-pill"]`)
            .bounds();
        const seg = view.$(`[data-testid="${id}"] [data-value="${SWEEP[index]!.value}"]`).bounds();
        expect(seg.width, `${id} seg width`).toBe(68);
        expect(Math.abs(pill.x - seg.x), `${id} pill x`).toBeLessThanOrEqual(0.1);
        expect(Math.abs(pill.y - seg.y), `${id} pill y`).toBeLessThanOrEqual(0.1);
        expect(Math.abs(pill.width - seg.width), `${id} pill width match`).toBeLessThanOrEqual(0.1);
        const selectedLabel = view.$(
            `[data-testid="${id}"] [data-value="${SWEEP[index]!.value}"] [data-happy2-ui="segmented-control-label"]`,
        );
        expect(selectedLabel.computedStyle("color"), `${id} active color`).toBe("rgb(0, 0, 0)");
        for (let other = 0; other < SWEEP.length; other += 1) {
            if (other === index) continue;
            const otherLabel = view.$(
                `[data-testid="${id}"] [data-value="${SWEEP[other]!.value}"] [data-happy2-ui="segmented-control-label"]`,
            );
            expect(otherLabel.computedStyle("color"), `${id} inactive ${other}`).toBe(
                "rgb(142, 142, 147)",
            );
        }
    }

    // Disabled: dimmed, not interactive, and every segment button disabled.
    const disabled = view.$('[data-testid="sc-disabled"]');
    expect(disabled.computedStyles(["cursor", "opacity"])).toEqual({
        cursor: "not-allowed",
        opacity: "0.48",
    });
    for (const value of ["day", "week", "month"]) {
        const seg = view.$(`[data-testid="sc-disabled"] [data-value="${value}"]`);
        expect((seg.element as HTMLButtonElement).disabled, `${value} disabled`).toBe(true);
    }

    await view.screenshot("SegmentedControl.variants.test");
}, 120_000);
