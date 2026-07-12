import "./styles.css";
import type { JSX } from "solid-js";
import { expect, it, vi } from "vitest";
import { server } from "vitest/browser";
import { Badge, type BadgeVariant, CountBadge, KeyCap, ReactionChip } from "./Badge";
import { createRenderer, type RenderedElement } from "./testing";

/*
 * Optical protocol: every measured fixture sits at integer page coordinates
 * (absolute cells) so element-capture clips never round the left/top edge,
 * and carries the `ink` class (transparent background and border) so the
 * captured pixels are the glyph ink alone. Drift is asserted against boxes
 * that do not move with the corrective translate: the component box itself,
 * or the child's layout slot inside it. pixelCount > 0 is asserted for every
 * capture so a clipped or blank capture can never pass.
 */

const TOLERANCE = 0.75;

/*
 * Re-tuning protocol for styles/badge.css: zero the correction vars, collect
 * the Drift values below (temporarily dump them with expect.fail — browser
 * console.log is not forwarded), and re-measure per engine. Engines snap
 * glyph runs to device-pixel steps, so the response to a translate is
 * non-linear; iterate on measurements, never extrapolate.
 */
type Drift = {
    /* ink-bounds-center drift (stable for asymmetric centroid mass) */
    bx: number;
    by: number;
    /* alpha-weighted centroid drift */
    dx: number;
    dy: number;
};

function cell(x: number, y: number, children: JSX.Element) {
    return (
        <span
            style={{
                "align-items": "flex-start",
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

const INK_FIXTURE_CSS = `
    .ink { background: transparent !important; border-color: transparent !important; }
    .ink * { background: transparent !important; }
`;

/** Ink drift of `part` against the center of `host`'s box. */
async function drift(
    name: string,
    part: RenderedElement<Element>,
    host: RenderedElement<Element>,
): Promise<Drift> {
    const visible = await part.visibleMetrics();
    /* A clipped or blank capture must never pass. */
    expect(visible.pixelCount, `${name} ink`).toBeGreaterThan(0);
    const p = part.bounds();
    const h = host.bounds();
    return {
        dx: p.x - h.x + visible.center.x - h.width / 2,
        dy: p.y - h.y + visible.center.y - h.height / 2,
        bx: p.x - h.x + visible.bounds.x + visible.bounds.width / 2 - h.width / 2,
        by: p.y - h.y + visible.bounds.y + visible.bounds.height / 2 - h.height / 2,
    };
}

/**
 * Ink drift of a chip child against its layout slot (1px border + 8px padding
 * from the near edge, vertically centered). The slot is derived from the chip
 * box, not the child rect, so the corrective translate registers in the
 * measurement.
 */
async function chipDrift(
    name: string,
    part: RenderedElement<Element>,
    chip: RenderedElement<Element>,
    edge: "left" | "right",
): Promise<Drift> {
    const visible = await part.visibleMetrics();
    expect(visible.pixelCount, `${name} ink`).toBeGreaterThan(0);
    const p = part.bounds();
    const c = chip.bounds();
    const slotX = edge === "left" ? c.x + 9 : c.x + c.width - 9 - p.width;
    return {
        dx: p.x + visible.center.x - (slotX + p.width / 2),
        dy: p.y + visible.center.y - (c.y + c.height / 2),
        bx: p.x + visible.bounds.x + visible.bounds.width / 2 - (slotX + p.width / 2),
        by: p.y + visible.bounds.y + visible.bounds.height / 2 - (c.y + c.height / 2),
    };
}

const BADGE_LABELS: Record<BadgeVariant, string> = {
    neutral: "QUEUED",
    accent: "AGENT",
    success: "NEEDS REVIEW",
    warning: "IN PROGRESS",
    danger: "FAILED",
    info: "SYNCED",
    outline: "CONFIG",
};

const BADGE_VARIANTS = Object.keys(BADGE_LABELS) as BadgeVariant[];

it("centers Badge label and icon ink in every variant", { timeout: 120_000 }, async () => {
    const view = createRenderer();
    view.render(
        () => (
            <div style={{ height: "100%", position: "relative", width: "100%" }}>
                <style>{INK_FIXTURE_CSS}</style>
                {BADGE_VARIANTS.map((variant, index) =>
                    cell(
                        20,
                        20 + index * 30,
                        <Badge
                            class={`ink v-${variant}`}
                            label={BADGE_LABELS[variant]}
                            variant={variant}
                        />,
                    ),
                )}
                {cell(
                    160,
                    20,
                    <Badge class="ink v-icon" icon="spark" label="AGENT" variant="accent" />,
                )}
                {cell(160, 50, <Badge class="ink v-one" label="X" variant="neutral" />)}
            </div>
        ),
        { width: 300, height: 260 },
    );
    await view.ready();

    for (const variant of BADGE_VARIANTS) {
        const badge = view.$(`.v-${variant}`);
        const measured = await drift(
            `badge/${variant}`,
            view.$(`.v-${variant} [data-rigged-ui="badge-label"]`),
            badge,
        );
        expect(badge.height(), `${variant} height`).toBe(18);
        expect(Math.abs(measured.dy), `${variant} optical y`).toBeLessThanOrEqual(TOLERANCE);
        /*
         * Word labels carry inherently asymmetric centroid mass (the word gap
         * in "IN PROGRESS" alone pushes the centroid ~2px right), so the
         * horizontal assertion uses the ink bounding-box center, which tracks
         * the trailing-letter-spacing bias the margin fix removes.
         */
        expect(Math.abs(measured.bx), `${variant} optical x`).toBeLessThanOrEqual(TOLERANCE);
    }

    /* Single glyph: symmetric enough to assert the centroid on both axes. */
    const one = await drift(
        "badge/one-char",
        view.$('.v-one [data-rigged-ui="badge-label"]'),
        view.$(".v-one"),
    );
    expect(Math.abs(one.dx), "one-char optical x").toBeLessThanOrEqual(TOLERANCE);
    expect(Math.abs(one.dy), "one-char optical y").toBeLessThanOrEqual(TOLERANCE);

    /* Icon form: the 12px glyph must center in its slot (6px from the left
     * edge), and the label must share the text baseline treatment. */
    const iconBadge = view.$(".v-icon");
    const icon = view.$('.v-icon [data-rigged-ui="badge-icon"]');
    const iconInk = await icon.visibleMetrics();
    expect(iconInk.pixelCount, "icon ink").toBeGreaterThan(0);
    const b = iconBadge.bounds();
    const i = icon.bounds();
    expect(i.width, "icon box width").toBe(12);
    expect(i.height, "icon box height").toBe(12);
    const iconDx = i.x + iconInk.center.x - (b.x + 12);
    const iconDy = i.y + iconInk.center.y - (b.y + 9);
    expect(Math.abs(iconDx), "icon optical x").toBeLessThanOrEqual(TOLERANCE);
    expect(Math.abs(iconDy), "icon optical y").toBeLessThanOrEqual(TOLERANCE);

    const iconLabel = await drift(
        "badge/icon-label",
        view.$('.v-icon [data-rigged-ui="badge-label"]'),
        iconBadge,
    );
    expect(Math.abs(iconLabel.dy), "icon-form label optical y").toBeLessThanOrEqual(TOLERANCE);
});

it(
    "aligns every CountBadge digit to one centered lining-figure band and baseline",
    { timeout: 120_000 },
    async () => {
        const cases = [
            { count: 0, tone: "accent" },
            { count: 1, tone: "accent" },
            { count: 2, tone: "accent" },
            { count: 3, tone: "accent" },
            { count: 4, tone: "accent" },
            { count: 5, tone: "accent" },
            { count: 6, tone: "accent" },
            { count: 7, tone: "accent" },
            { count: 8, tone: "accent" },
            { count: 9, tone: "accent" },
            { count: 10, tone: "accent" },
            { count: 11, tone: "accent" },
            { count: 12, tone: "accent" },
            { count: 44, tone: "accent" },
            { count: 64, tone: "accent" },
            { count: 88, tone: "accent" },
            { count: 128, tone: "accent" },
            { count: 999, tone: "accent" },
            { count: 1234, tone: "accent" },
            { count: 0, tone: "neutral" },
            { count: 7, tone: "neutral" },
            { count: 64, tone: "neutral" },
            { count: 1234, tone: "neutral" },
        ] as const;

        const view = createRenderer();
        view.render(
            () => (
                <div style={{ height: "100%", position: "relative", width: "100%" }}>
                    <style>{INK_FIXTURE_CSS}</style>
                    {cases.map((entry, index) =>
                        cell(
                            20 + (index % 4) * 58,
                            20 + Math.floor(index / 4) * 30,
                            <CountBadge
                                class={`ink c-${entry.tone}-${entry.count}`}
                                count={entry.count}
                                tone={entry.tone}
                            />,
                        ),
                    )}
                </div>
            ),
            { width: 260, height: 210 },
        );
        await view.ready();

        let baseline: number | undefined;
        for (const entry of cases) {
            const id = `c-${entry.tone}-${entry.count}`;
            const badge = view.$(`.${id}`);
            const label = view.$(`.${id} [data-rigged-ui="count-badge-label"]`);
            const measured = await drift(`count/${entry.tone}-${entry.count}`, label, badge);
            /*
             * Alignment means a common browser-laid-out baseline and a
             * centered lining-figure HEIGHT band. It does not mean forcing
             * every content-dependent centroid to zero: "7" is inherently
             * top-heavy. Rigged Mono's lining/tabular figures make the band
             * and advance width stable for every number assembled from 0–9.
             */
            const metrics = label.textMetrics();
            const currentBaseline = metrics.verticalOffset - badge.bounds().y;
            baseline ??= currentBaseline;
            expect(
                Math.abs(currentBaseline - baseline),
                `${id} shared baseline`,
            ).toBeLessThanOrEqual(0.001);
            const expectedBaseline = server.browser === "webkit" ? 12.875 : 13;
            expect(
                Math.abs(currentBaseline - expectedBaseline),
                `${id} measured baseline position`,
            ).toBeLessThanOrEqual(0.005);
            expect(metrics.font.family, `${id} numeric font`).toBe(
                "Rigged Mono, ui-monospace, monospace",
            );
            const numericVariant = label.computedStyle("font-variant-numeric");
            expect(numericVariant, `${id} lining figures`).toContain("lining-nums");
            expect(numericVariant, `${id} tabular figures`).toContain("tabular-nums");
            expect(Math.abs(measured.by), `${id} full numeral height`).toBeLessThanOrEqual(0.25);
            expect(
                Math.abs(label.offsets().left - label.offsets().right),
                `${id} line-box symmetry`,
            ).toBeLessThanOrEqual(0.5);
            if (entry.count === 0) {
                expect(
                    Math.abs(measured.bx),
                    `${id} zero bounds x ${measured.bx}`,
                ).toBeLessThanOrEqual(0.001);
                expect(
                    Math.abs(measured.by),
                    `${id} zero bounds y ${measured.by}`,
                ).toBeLessThanOrEqual(0.001);
                const expectedOptical =
                    server.browser === "webkit"
                        ? entry.tone === "accent"
                            ? { x: -0.01, y: -0.09 }
                            : { x: -0.01, y: -0.032 }
                        : entry.tone === "accent"
                          ? { x: -0.013, y: -0.007 }
                          : { x: -0.011, y: -0.007 };
                expect(
                    Math.abs(measured.dx - expectedOptical.x),
                    `${id} measured zero centroid x ${measured.dx}`,
                ).toBeLessThanOrEqual(0.005);
                expect(
                    Math.abs(measured.dy - expectedOptical.y),
                    `${id} measured zero centroid y ${measured.dy}`,
                ).toBeLessThanOrEqual(0.005);
            }
            if (entry.count === 1234) {
                const expectedOpticalY =
                    server.browser === "webkit"
                        ? entry.tone === "accent"
                            ? 0.093
                            : 0.164
                        : entry.tone === "accent"
                          ? 0.192
                          : 0.195;
                expect(
                    Math.abs(measured.dy - expectedOpticalY),
                    `${id} measured content-dependent centroid y ${measured.dy}`,
                ).toBeLessThanOrEqual(0.005);
            }
            /* Stepped integral width: fractional intrinsic text widths would
             * land right-aligned pills off the device-pixel grid. */
            expect(badge.width(), `${id} stepped width`).toBe(
                18 + (String(entry.count).length - 1) * 7,
            );
        }
    },
);

it(
    "measures each ReactionChip emoji independently inside a fixed slot",
    { timeout: 120_000 },
    async () => {
        const cases = ["👍", "🎉", "🚀", "✅", "🔥", "👩‍💻", "🇺🇸", "❤️"];

        const view = createRenderer();
        view.render(
            () => (
                <div style={{ height: "100%", position: "relative", width: "100%" }}>
                    <style>{INK_FIXTURE_CSS}</style>
                    {cases.map((emoji, index) =>
                        cell(
                            20 + (index % 2) * 120,
                            20 + Math.floor(index / 2) * 34,
                            <ReactionChip
                                class={`ink emoji-${index}`}
                                count={index + 1}
                                emoji={emoji}
                            />,
                        ),
                    )}
                </div>
            ),
            { width: 280, height: 170 },
        );
        await view.ready();

        for (const [index, emoji] of cases.entries()) {
            const chip = view.$(`.emoji-${index}`);
            const slot = view.$(`.emoji-${index} [data-rigged-ui="reaction-chip-emoji"]`);
            const glyph = view.$(`.emoji-${index} [data-rigged-ui="reaction-chip-emoji-glyph"]`);
            expect(chip.height(), `${emoji} chip height`).toBe(24);
            expect(slot.bounds().width, `${emoji} slot width`).toBe(18);
            expect(slot.bounds().height, `${emoji} slot height`).toBe(18);
            expect(slot.bounds().x - chip.bounds().x, `${emoji} slot x`).toBe(9);
            expect(slot.bounds().y - chip.bounds().y, `${emoji} slot y`).toBe(3);
            expect(slot.computedStyle("font-family"), `${emoji} fallback stack`).toContain(
                "Apple Color Emoji",
            );
            const visible = await glyph.visibleMetrics();
            expect(visible.pixelCount, `${emoji} ink`).toBeGreaterThan(0);
            const glyphBounds = glyph.bounds();
            const slotBounds = slot.bounds();
            const inkLeft = glyphBounds.x - slotBounds.x + visible.bounds.x;
            const inkTop = glyphBounds.y - slotBounds.y + visible.bounds.y;
            const inkRight = inkLeft + visible.bounds.width;
            const inkBottom = inkTop + visible.bounds.height;
            expect(inkLeft, `${emoji} unclipped left`).toBeGreaterThanOrEqual(-0.5);
            expect(inkTop, `${emoji} unclipped top`).toBeGreaterThanOrEqual(-0.5);
            expect(inkRight, `${emoji} unclipped right`).toBeLessThanOrEqual(18.5);
            expect(inkBottom, `${emoji} unclipped bottom`).toBeLessThanOrEqual(18.5);
            /*
             * System color-emoji artwork has content-dependent mass, so compare
             * each glyph's full painted bounds with its own slot. Never combine
             * the emoji and count into one centroid.
             */
            const boundsDx = inkLeft + visible.bounds.width / 2 - 9;
            const boundsDy = inkTop + visible.bounds.height / 2 - 9;
            expect(Math.abs(boundsDx), `${emoji} bounds x ${boundsDx}`).toBeLessThanOrEqual(0.75);
            expect(Math.abs(boundsDy), `${emoji} bounds y ${boundsDy}`).toBeLessThanOrEqual(0.75);
        }
    },
);

it(
    "aligns ReactionChip counts to one lining-figure band and baseline",
    { timeout: 120_000 },
    async () => {
        const counts = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 44, 64, 88, 128, 999, 1234];
        const view = createRenderer();
        view.render(
            () => (
                <div style={{ height: "100%", position: "relative", width: "100%" }}>
                    <style>{INK_FIXTURE_CSS}</style>
                    {counts.map((count, index) =>
                        cell(
                            20 + (index % 4) * 74,
                            20 + Math.floor(index / 4) * 34,
                            <ReactionChip class={`ink count-${count}`} count={count} emoji="👍" />,
                        ),
                    )}
                </div>
            ),
            { width: 330, height: 200 },
        );
        await view.ready();

        let baseline: number | undefined;
        for (const count of counts) {
            const chip = view.$(`.count-${count}`);
            const label = view.$(`.count-${count} [data-rigged-ui="reaction-chip-count"]`);
            const measured = await chipDrift(`chip-count/${count}`, label, chip, "right");
            const metrics = label.textMetrics();
            const currentBaseline = metrics.verticalOffset - chip.bounds().y;
            baseline ??= currentBaseline;
            expect(
                Math.abs(currentBaseline - baseline),
                `${count} shared baseline`,
            ).toBeLessThanOrEqual(0.001);
            expect(
                Math.abs(currentBaseline - 16),
                `${count} baseline position`,
            ).toBeLessThanOrEqual(0.1);
            expect(metrics.font.family, `${count} numeric font`).toBe(
                "Rigged Mono, ui-monospace, monospace",
            );
            const numericVariant = label.computedStyle("font-variant-numeric");
            expect(numericVariant, `${count} lining figures`).toContain("lining-nums");
            expect(numericVariant, `${count} tabular figures`).toContain("tabular-nums");
            expect(Math.abs(measured.by), `${count} full numeral height`).toBeLessThanOrEqual(0.25);
            expect(
                Math.abs(
                    chip.bounds().x +
                        chip.bounds().width -
                        (label.bounds().x + label.bounds().width) -
                        9,
                ),
                `${count} trailing inset`,
            ).toBeLessThanOrEqual(0.001);
            if (count === 1234) {
                expect(Math.abs(measured.dy), `${count} balanced centroid`).toBeLessThanOrEqual(
                    0.15,
                );
            }
        }
    },
);

it(
    "aligns every KeyCap glyph to the 0 calibration axis inside fixed slots",
    { timeout: 120_000 },
    async () => {
        /*
         * '0' is the vertical calibration glyph (a bilaterally symmetric figure
         * band). Each engine snaps its alpha centroid to a fixed plateau near
         * the 10px slot center at the integer fixture position (Chromium ~0,
         * Gecko ~-0.11, WebKit ~-0.16); no finer correction survives the raster.
         * Every modifier symbol is tuned to sit on THAT same axis (styles/
         * badge.css --rg-keycap-symbol-y), so ⌘/⇧/⌥/⌃ share the letters' optical
         * line instead of an absolute zero. Content letters (T, A, 1 …) carry
         * asymmetric ink and are deliberately NOT forced onto the 0 centroid:
         * they assert a shared baseline and cell rhythm instead, per DESIGN.md
         * "Testing text by character class".
         */
        const cal = ["0", "O", "⌘", "⇧", "⌥", "⌃"] as const;
        const combos = ["⌘K", "⇧⌘P", "⌥⌘K", "⌃K", "⌘0", "ESC", "ENTER"] as const;
        const isSym = (ch: string) => ["⌘", "⇧", "⌥", "⌃"].includes(ch);

        const view = createRenderer();
        view.render(
            () => (
                <div style={{ height: "100%", position: "relative", width: "100%" }}>
                    <style>{INK_FIXTURE_CSS}</style>
                    {cal.map((keys, index) =>
                        cell(
                            20,
                            20 + index * 30,
                            <KeyCap class={`ink cal-${index}`} keys={keys} />,
                        ),
                    )}
                    {combos.map((keys, index) =>
                        cell(150, 20 + index * 30, <KeyCap class={`ink k-${index}`} keys={keys} />),
                    )}
                </div>
            ),
            { width: 360, height: 260 },
        );
        view.render(
            () => (
                <div
                    style={{
                        "align-items": "center",
                        background: "#131217",
                        display: "flex",
                        gap: "12px",
                        height: "100%",
                        padding: "12px",
                    }}
                >
                    {combos.map((keys) => (
                        <KeyCap keys={keys} />
                    ))}
                </div>
            ),
            { width: 470, height: 46 },
        );
        await view.ready();

        const labelOf = (cls: string) => view.$(`.${cls} [data-rigged-ui="key-cap-label"]`);
        const innerOf = (cls: string, k: number, sym: boolean) =>
            view.$(
                `.${cls} [data-rigged-ui="key-cap-key"]:nth-child(${k + 1}) ${sym ? "svg" : '[data-rigged-ui="key-cap-text"]'}`,
            );
        async function measure(cls: string, k: number, sym: boolean) {
            const label = labelOf(cls);
            const inner = innerOf(cls, k, sym);
            const visible = await inner.visibleMetrics();
            expect(visible.pixelCount, `${cls}#${k} paints ink`).toBeGreaterThan(0);
            const lb = label.bounds();
            const ib = inner.bounds();
            return {
                inner,
                label,
                visible,
                cy: ib.y - lb.y + visible.center.y - lb.height / 2,
                inkLeft: ib.x - lb.x + visible.bounds.x,
                inkRight: ib.x - lb.x + visible.bounds.x + visible.bounds.width,
            };
        }

        // --- Vertical calibration on '0' (and the equally symmetric 'O') ---
        const zero = await measure("cal-0", 0, false);
        const cyRef = zero.cy;
        expect(Math.abs(cyRef), `0 centroid off label center: ${cyRef}`).toBeLessThanOrEqual(0.2);
        const bigO = await measure("cal-1", 0, false);
        expect(Math.abs(bigO.cy - cyRef), `O vs 0 axis: ${bigO.cy - cyRef}`).toBeLessThanOrEqual(
            0.06,
        );

        // --- Modifier symbols: on the 0 axis, equal width, height parity ---
        const symCells: ReadonlyArray<readonly [string, string]> = [
            ["cal-2", "⌘"],
            ["cal-3", "⇧"],
            ["cal-4", "⌥"],
            ["cal-5", "⌃"],
        ];
        for (const [cls, ch] of symCells) {
            const s = await measure(cls, 0, true);
            // Shares the 0 vertical axis (the whole point of the retune).
            expect(Math.abs(s.cy - cyRef), `${ch} vs 0 axis: ${s.cy - cyRef}`).toBeLessThanOrEqual(
                0.16,
            );
            // Equal visible width => equal slot bearings => uniform gaps.
            expect(
                Math.abs(s.visible.bounds.width - 8),
                `${ch} normalized ink width: ${s.visible.bounds.width}`,
            ).toBeLessThanOrEqual(0.5);
            // Height parity: ⌃ must read as a full chevron, not a flat/stretched
            // one (regression guard — it measured 7.5 before the redraw).
            expect(
                s.visible.bounds.height,
                `${ch} ink height: ${s.visible.bounds.height}`,
            ).toBeGreaterThanOrEqual(7.75);
            expect(
                s.visible.bounds.height,
                `${ch} ink height: ${s.visible.bounds.height}`,
            ).toBeLessThanOrEqual(9);
            // Optically centered across its 9px slot.
            const slot = view.$(`.${cls} [data-rigged-ui="key-cap-key"]`);
            const dx =
                s.inner.bounds().x - slot.bounds().x + s.visible.center.x - slot.bounds().width / 2;
            expect(Math.abs(dx), `${ch} slot horizontal centroid: ${dx}`).toBeLessThanOrEqual(0.1);
        }

        // --- Per-combo geometry, cell rhythm, baselines ---
        let sharedBaseline: number | undefined;
        for (const [index, keys] of combos.entries()) {
            const cls = `k-${index}`;
            const cap = view.$(`.${cls}`);
            const label = labelOf(cls);
            const chars = Array.from(keys);

            expect(cap.height(), `${keys} height`).toBe(18);
            expect(cap.element.getAttribute("aria-label"), `${keys} label`).toBe(keys);
            expect(cap.computedStyle("padding-left"), `${keys} left padding`).toBe("4px");
            expect(cap.computedStyle("padding-right"), `${keys} right padding`).toBe("4px");
            expect(label.bounds().height, `${keys} label height`).toBe(10);
            expect(label.computedStyle("column-gap"), `${keys} character gap`).toBe("0px");
            expect(Math.abs(label.offsets().left - 4), `${keys} left inset`).toBeLessThanOrEqual(
                0.001,
            );
            expect(Math.abs(label.offsets().right - 4), `${keys} right inset`).toBeLessThanOrEqual(
                0.001,
            );
            const contentWidth = chars.reduce((w, ch) => w + (isSym(ch) ? 9 : 6.5), 0);
            expect(label.bounds().width, `${keys} content width`).toBe(contentWidth);
            expect(cap.width(), `${keys} width with equal padding`).toBe(contentWidth + 8);

            const ink: Array<{ ch: string; left: number; right: number; sym: boolean }> = [];
            for (const [k, ch] of chars.entries()) {
                const sym = isSym(ch);
                const slot = view.$(`.${cls} [data-rigged-ui="key-cap-key"]:nth-child(${k + 1})`);
                expect(slot.bounds().width, `${keys}/${ch} slot width`).toBe(sym ? 9 : 6.5);
                expect(slot.bounds().height, `${keys}/${ch} slot height`).toBe(10);
                expect(slot.element.getAttribute("data-kind"), `${keys}/${ch} kind`).toBe(
                    sym ? "symbol" : "text",
                );
                const m = await measure(cls, k, sym);
                ink.push({ ch, left: m.inkLeft, right: m.inkRight, sym });
                if (sym) {
                    expect(
                        Math.abs(m.cy - cyRef),
                        `${keys}/${ch} on 0 axis: ${m.cy - cyRef}`,
                    ).toBeLessThanOrEqual(0.16);
                } else {
                    const text = innerOf(cls, k, false);
                    expect(text.computedStyle("font-family"), `${keys}/${ch} font`).toContain(
                        "Rigged Mono",
                    );
                    expect(text.computedStyle("font-size"), `${keys}/${ch} size`).toBe("10.8px");
                    expect(text.computedStyle("font-weight"), `${keys}/${ch} weight`).toBe("500");
                    const baseline = text.textMetrics().verticalOffset - label.bounds().y;
                    sharedBaseline ??= baseline;
                    expect(
                        Math.abs(baseline - sharedBaseline),
                        `${keys}/${ch} shared text baseline`,
                    ).toBeLessThanOrEqual(0.001);
                }
            }

            // Cell rhythm: any adjacency touching a modifier is a uniform 1.0px
            // visible gap; letter↔letter pairs follow the mono font's bearings.
            for (let token = 1; token < ink.length; token += 1) {
                const gap = ink[token]!.left - ink[token - 1]!.right;
                const pair = `${keys}/${ink[token - 1]!.ch}-${ink[token]!.ch}`;
                if (ink[token]!.sym || ink[token - 1]!.sym) {
                    expect(Math.abs(gap - 1), `${pair} modifier gap: ${gap}`).toBeLessThanOrEqual(
                        0.25,
                    );
                } else {
                    expect(gap, `${pair} letter gap: ${gap}`).toBeGreaterThanOrEqual(-0.01);
                    expect(gap, `${pair} letter gap: ${gap}`).toBeLessThanOrEqual(1.6);
                }
            }

            const contentW = chars.reduce((w, ch) => w + (isSym(ch) ? 9 : 6.5), 0);
            const visibleLeftPadding = 4 + ink[0]!.left;
            const visibleRightPadding = 4 + contentW - ink.at(-1)!.right;
            expect(
                Math.abs(visibleLeftPadding - visibleRightPadding),
                `${keys} visible outer-padding parity`,
            ).toBeLessThanOrEqual(1.5);
        }
        await view.screenshot("KeyCap.test");
    },
);

it("holds Badge family geometry, colors, and behavior", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <div
                style={{
                    background: "#17161c",
                    "box-sizing": "border-box",
                    display: "flex",
                    "flex-direction": "column",
                    gap: "12px",
                    height: "100%",
                    padding: "14px",
                }}
            >
                <div style={{ "align-items": "center", display: "flex", gap: "8px" }}>
                    <Badge class="g-neutral" label="QUEUED" variant="neutral" />
                    <Badge class="g-accent" label="AGENT" variant="accent" />
                    <Badge class="g-success" label="NEEDS REVIEW" variant="success" />
                    <Badge class="g-warning" label="IN PROGRESS" variant="warning" />
                    <Badge class="g-danger" label="FAILED" variant="danger" />
                </div>
                <div style={{ "align-items": "center", display: "flex", gap: "8px" }}>
                    <Badge class="g-info" label="SYNCED" variant="info" />
                    <Badge class="g-outline" label="CONFIG" variant="outline" />
                    <Badge class="g-icon" icon="spark" label="AGENT" variant="accent" />
                    <Badge class="g-default" label="DEFAULT" />
                </div>
                <div style={{ "align-items": "center", display: "flex", gap: "8px" }}>
                    <CountBadge class="g-count-0" count={0} />
                    <CountBadge class="g-count-1" count={1} />
                    <CountBadge class="g-count-12" count={12} />
                    <CountBadge class="g-count-128" count={128} />
                    <CountBadge class="g-count-neutral" count={64} tone="neutral" />
                    <KeyCap class="g-cap-short" keys="⌘K" />
                    <KeyCap class="g-cap-long" keys="CTRL+SHIFT+K" />
                </div>
                <div style={{ "align-items": "center", display: "flex", gap: "8px" }}>
                    <ReactionChip class="g-chip" count={2} emoji="👍" />
                    <ReactionChip active class="g-chip-active" count={14} emoji="🎉" />
                </div>
            </div>
        ),
        { width: 560, height: 144 },
    );
    await view.ready();

    const mono =
        server.browser === "webkit"
            ? "Rigged Mono, ui-monospace, monospace"
            : '"Rigged Mono", ui-monospace, monospace';
    /* Badge: 18px mono uppercase pill; each variant maps to its tokens. */
    const badgeColors: Record<BadgeVariant, { background: string; color: string }> = {
        neutral: { background: "rgba(255, 255, 255, 0.05)", color: "rgb(165, 160, 176)" },
        accent: { background: "rgba(139, 124, 247, 0.15)", color: "rgb(168, 155, 255)" },
        success: { background: "rgba(52, 211, 153, 0.13)", color: "rgb(110, 231, 183)" },
        warning: { background: "rgba(251, 191, 36, 0.13)", color: "rgb(252, 211, 77)" },
        danger: { background: "rgba(248, 113, 113, 0.13)", color: "rgb(252, 165, 165)" },
        info: { background: "rgba(96, 165, 250, 0.13)", color: "rgb(96, 165, 250)" },
        outline: { background: "rgba(0, 0, 0, 0)", color: "rgb(165, 160, 176)" },
    };
    for (const variant of BADGE_VARIANTS) {
        const badge = view.$(`.g-${variant}`);
        expect(badge.element.getAttribute("data-variant"), variant).toBe(variant);
        expect(
            badge.computedStyles([
                "background-color",
                "border-radius",
                "box-sizing",
                "color",
                "font-family",
                "font-size",
                "font-weight",
                "height",
                "letter-spacing",
                "line-height",
                "text-transform",
            ]),
            variant,
        ).toEqual({
            "background-color": badgeColors[variant].background,
            "border-radius": "4px",
            "box-sizing": "border-box",
            color: badgeColors[variant].color,
            "font-family": mono,
            "font-size": "10px",
            "font-weight": "700",
            height: "18px",
            "letter-spacing": "0.6px",
            "line-height": "18px",
            "text-transform": "uppercase",
        });
        /* 6px visual inset on both sides (outline trades 1px for its border);
         * the trailing letter-space of the last glyph is trimmed by the label
         * margin so the ink, not the advance box, is what gets centered. */
        expect(badge.computedStyle("padding-left"), variant).toBe(
            variant === "outline" ? "5px" : "6px",
        );
        expect(
            view.$(`.g-${variant} [data-rigged-ui="badge-label"]`).computedStyle("margin-right"),
            variant,
        ).toBe("-0.6px");
    }
    expect(view.$(".g-outline").computedStyles(["border-top-color", "border-top-width"])).toEqual({
        "border-top-color": "rgba(255, 255, 255, 0.13)",
        "border-top-width": "1px",
    });
    expect(view.$(".g-default").element.getAttribute("data-variant")).toBe("neutral");

    /* Icon form: 12px icon box, 4px gap to the label. */
    const iconBadge = view.$(".g-icon");
    const icon = view.$('.g-icon [data-rigged-ui="badge-icon"]');
    const label = view.$('.g-icon [data-rigged-ui="badge-label"]');
    expect(icon.bounds().width).toBe(12);
    expect(icon.bounds().height).toBe(12);
    /* The icon slot starts 6px in; the box may carry a sub-pixel measured
     * optical correction. */
    expect(Math.abs(icon.bounds().x - (iconBadge.bounds().x + 6))).toBeLessThanOrEqual(0.5);
    expect(label.bounds().x - icon.bounds().x).toBeGreaterThanOrEqual(16);
    expect(view.$(".g-neutral").element.querySelector('[data-rigged-ui="badge-icon"]')).toBeNull();

    /* CountBadge: 18px pill, min-width 18, grows with digit count. */
    for (const [id, tone] of [
        ["g-count-0", "accent"],
        ["g-count-1", "accent"],
        ["g-count-12", "accent"],
        ["g-count-128", "accent"],
        ["g-count-neutral", "neutral"],
    ] as const) {
        const badge = view.$(`.${id}`);
        expect(badge.element.getAttribute("data-tone"), id).toBe(tone);
        expect(badge.height(), id).toBe(18);
        expect(
            badge.computedStyles([
                "background-color",
                "border-radius",
                "color",
                "font-family",
                "font-size",
                "font-weight",
                "font-variant-numeric",
                "line-height",
            ]),
            id,
        ).toEqual({
            "background-color":
                tone === "accent" ? "rgb(139, 124, 247)" : "rgba(255, 255, 255, 0.05)",
            "border-radius": "999px",
            color: tone === "accent" ? "rgb(255, 255, 255)" : "rgb(165, 160, 176)",
            "font-family": mono,
            "font-size": "10.8px",
            "font-weight": "700",
            "font-variant-numeric": "lining-nums tabular-nums",
            "line-height": "18px",
        });
    }
    expect(view.$(".g-count-0").width()).toBe(18);
    expect(view.$(".g-count-1").width()).toBe(18);
    expect(view.$(".g-count-12").width()).toBeGreaterThan(18);
    expect(view.$(".g-count-12").width()).toBeLessThan(26);
    expect(view.$(".g-count-128").width()).toBeGreaterThan(26);
    expect(view.$(".g-count-128").width()).toBeLessThan(33);
    expect(view.$(".g-count-1").element.getAttribute("data-tone")).toBe("accent");

    /* ReactionChip: 24px bordered pill button with emoji + count. */
    const chip = view.$(".g-chip");
    expect(chip.element.tagName).toBe("BUTTON");
    expect(chip.element.getAttribute("type")).toBe("button");
    expect(chip.element.getAttribute("aria-label")).toBe("👍 2");
    expect(chip.element.getAttribute("aria-pressed")).toBe("false");
    expect(chip.height()).toBe(24);
    expect(
        chip.computedStyles([
            "background-color",
            "border-radius",
            "border-top-color",
            "border-top-width",
            "cursor",
        ]),
    ).toEqual({
        "background-color": "rgba(255, 255, 255, 0.05)",
        "border-radius": "999px",
        "border-top-color": "rgba(255, 255, 255, 0.07)",
        "border-top-width": "1px",
        cursor: "pointer",
    });
    expect(
        view
            .$('.g-chip [data-rigged-ui="reaction-chip-count"]')
            .computedStyles([
                "color",
                "font-family",
                "font-size",
                "font-weight",
                "font-variant-numeric",
                "line-height",
            ]),
    ).toEqual({
        color: "rgb(165, 160, 176)",
        "font-family": mono,
        "font-size": "11px",
        "font-weight": "700",
        "font-variant-numeric": "lining-nums tabular-nums",
        "line-height": "22px",
    });
    const emojiSlot = view.$('.g-chip [data-rigged-ui="reaction-chip-emoji"]');
    expect(emojiSlot.bounds().width).toBe(18);
    expect(emojiSlot.bounds().height).toBe(18);
    expect(emojiSlot.computedStyle("font-size")).toBe("13px");
    expect(emojiSlot.computedStyle("font-family")).toContain("Apple Color Emoji");
    expect(
        (await view.$('.g-chip [data-rigged-ui="reaction-chip-emoji-glyph"]').visibleMetrics())
            .pixelCount,
    ).toBeGreaterThan(0);

    const active = view.$(".g-chip-active");
    expect(active.element.getAttribute("aria-pressed")).toBe("true");
    expect(active.computedStyles(["background-color", "border-top-color"])).toEqual({
        "background-color": "rgba(139, 124, 247, 0.15)",
        "border-top-color": "rgb(139, 124, 247)",
    });
    expect(
        view.$('.g-chip-active [data-rigged-ui="reaction-chip-count"]').computedStyle("color"),
    ).toBe("rgb(168, 155, 255)");

    /* KeyCap: 18px mono hint. */
    for (const id of ["g-cap-short", "g-cap-long"]) {
        const cap = view.$(`.${id}`);
        expect(cap.element.tagName, id).toBe("KBD");
        expect(cap.height(), id).toBe(18);
        expect(
            cap.computedStyles([
                "background-color",
                "border-radius",
                "color",
                "font-family",
                "font-size",
                "font-weight",
            ]),
            id,
        ).toEqual({
            "background-color": "rgba(255, 255, 255, 0.05)",
            "border-radius": "4px",
            color: "rgb(165, 160, 176)",
            "font-family": mono,
            "font-size": "10.8px",
            "font-weight": "500",
        });
    }

    await view.screenshot("Badge.test");
});

it("fires onSelect when a ReactionChip is clicked", async () => {
    const onSelect = vi.fn();
    const view = createRenderer();
    view.render(() => <ReactionChip class="click-me" count={2} emoji="👍" onSelect={onSelect} />, {
        width: 120,
        height: 48,
        padding: 12,
    });
    await view.ready();

    (view.$(".click-me").element as HTMLButtonElement).click();
    expect(onSelect).toHaveBeenCalledTimes(1);
});
