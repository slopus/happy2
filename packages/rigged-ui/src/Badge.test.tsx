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
    "centers CountBadge digits at 1, 2, and 3 digits in both tones",
    { timeout: 120_000 },
    async () => {
        const cases = [
            { count: 1, tone: "accent" },
            { count: 4, tone: "accent" },
            { count: 7, tone: "accent" },
            { count: 8, tone: "accent" },
            { count: 12, tone: "accent" },
            { count: 64, tone: "accent" },
            { count: 128, tone: "accent" },
            { count: 999, tone: "accent" },
            { count: 7, tone: "neutral" },
            { count: 64, tone: "neutral" },
        ] as const;

        const view = createRenderer();
        view.render(
            () => (
                <div style={{ height: "100%", position: "relative", width: "100%" }}>
                    <style>{INK_FIXTURE_CSS}</style>
                    {cases.map((entry, index) =>
                        cell(
                            20 + (index % 2) * 60,
                            20 + Math.floor(index / 2) * 30,
                            <CountBadge
                                class={`ink c-${entry.tone}-${entry.count}`}
                                count={entry.count}
                                tone={entry.tone}
                            />,
                        ),
                    )}
                </div>
            ),
            { width: 160, height: 180 },
        );
        await view.ready();

        for (const entry of cases) {
            const id = `c-${entry.tone}-${entry.count}`;
            const badge = view.$(`.${id}`);
            const measured = await drift(
                `count/${entry.tone}-${entry.count}`,
                view.$(`.${id} [data-rigged-ui="count-badge-label"]`),
                badge,
            );
            /*
             * Vertical: digits share one baseline band, so the centroid is
             * asserted strictly; residual spread is per-glyph ink ("7" is
             * top-heavy, "4" bottom-heavy). Horizontal: single digits assert
             * the ink centroid, but multi-digit runs center their ADVANCE
             * width (typographically correct), and ink skews toward the
             * heavier glyphs ("12": the 1 carries little ink) — so they
             * assert line-box symmetry instead of ink centroid.
             */
            if (String(entry.count).length === 1) {
                expect(Math.abs(measured.dx), `${id} optical x`).toBeLessThanOrEqual(TOLERANCE);
            } else {
                const label = view.$(`.${id} [data-rigged-ui="count-badge-label"]`);
                const offsets = label.offsets();
                expect(
                    Math.abs(offsets.left - offsets.right),
                    `${id} line-box symmetry`,
                ).toBeLessThanOrEqual(0.5);
            }
            expect(Math.abs(measured.dy), `${id} optical y`).toBeLessThanOrEqual(TOLERANCE);
            /* Stepped integral width: fractional intrinsic text widths would
             * land right-aligned pills off the device-pixel grid. */
            expect(badge.width(), `${id} stepped width`).toBe(
                18 + (String(entry.count).length - 1) * 7,
            );
        }
    },
);

it("centers ReactionChip emoji and count ink in their slots", { timeout: 120_000 }, async () => {
    const cases = [
        { active: false, count: 2, emoji: "👍" },
        { active: true, count: 3, emoji: "🎉" },
        { active: false, count: 14, emoji: "🚀" },
        { active: false, count: 1, emoji: "✅" },
        { active: true, count: 12, emoji: "🔥" },
    ];

    const view = createRenderer();
    view.render(
        () => (
            <div style={{ height: "100%", position: "relative", width: "100%" }}>
                <style>{INK_FIXTURE_CSS}</style>
                {cases.map((entry, index) =>
                    cell(
                        20,
                        20 + index * 34,
                        <ReactionChip
                            active={entry.active}
                            class={`ink r-${entry.count}`}
                            count={entry.count}
                            emoji={entry.emoji}
                        />,
                    ),
                )}
            </div>
        ),
        { width: 120, height: 220 },
    );
    await view.ready();

    for (const entry of cases) {
        const chip = view.$(`.r-${entry.count}`);
        expect(chip.height(), `chip ${entry.count} height`).toBe(24);

        /*
         * Color-emoji artwork carries deliberately asymmetric mass (🎉 fires
         * up-left, 👍 is bottom-heavy), so the emoji asserts the ink
         * bounding-box center on both axes instead of the centroid.
         */
        const emoji = await chipDrift(
            `chip-emoji/${entry.emoji}`,
            view.$(`.r-${entry.count} [data-rigged-ui="reaction-chip-emoji"]`),
            chip,
            "left",
        );
        expect(Math.abs(emoji.bx), `${entry.emoji} optical x`).toBeLessThanOrEqual(TOLERANCE);
        expect(Math.abs(emoji.by), `${entry.emoji} optical y`).toBeLessThanOrEqual(TOLERANCE);

        const count = await chipDrift(
            `chip-count/${entry.count}`,
            view.$(`.r-${entry.count} [data-rigged-ui="reaction-chip-count"]`),
            chip,
            "right",
        );
        expect(Math.abs(count.dx), `count ${entry.count} optical x`).toBeLessThanOrEqual(TOLERANCE);
        expect(Math.abs(count.dy), `count ${entry.count} optical y`).toBeLessThanOrEqual(TOLERANCE);
    }
});

it("centers KeyCap ink for short and long shortcut strings", { timeout: 120_000 }, async () => {
    const cases = ["⌘K", "ESC", "⌘⇧P", "CTRL+SHIFT+K"];

    const view = createRenderer();
    view.render(
        () => (
            <div style={{ height: "100%", position: "relative", width: "100%" }}>
                <style>{INK_FIXTURE_CSS}</style>
                {cases.map((keys, index) =>
                    cell(20, 20 + index * 30, <KeyCap class={`ink k-${index}`} keys={keys} />),
                )}
            </div>
        ),
        { width: 160, height: 150 },
    );
    await view.ready();

    for (const [index, keys] of cases.entries()) {
        const cap = view.$(`.k-${index}`);
        expect(cap.height(), `${keys} height`).toBe(18);
        const measured = await drift(
            `keycap/${keys}`,
            view.$(`.k-${index} [data-rigged-ui="key-cap-label"]`),
            cap,
        );
        expect(Math.abs(measured.dy), `${keys} optical y`).toBeLessThanOrEqual(TOLERANCE);
        /*
         * Shortcut strings mix symbols and letters with uneven per-glyph mass
         * ("+" is centroid-light), so x asserts the ink bounding-box center.
         */
        expect(Math.abs(measured.bx), `${keys} optical x`).toBeLessThanOrEqual(TOLERANCE);
    }
});

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
    const ui =
        server.browser === "webkit"
            ? "Rigged Figtree, system-ui, sans-serif"
            : '"Rigged Figtree", system-ui, sans-serif';

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
                "line-height",
            ]),
            id,
        ).toEqual({
            "background-color":
                tone === "accent" ? "rgb(139, 124, 247)" : "rgba(255, 255, 255, 0.05)",
            "border-radius": "999px",
            color: tone === "accent" ? "rgb(255, 255, 255)" : "rgb(165, 160, 176)",
            "font-family": ui,
            "font-size": "11px",
            "font-weight": "700",
            "line-height": "18px",
        });
    }
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
            .computedStyles(["color", "font-size", "font-weight"]),
    ).toEqual({
        color: "rgb(165, 160, 176)",
        "font-size": "11px",
        "font-weight": "700",
    });
    expect(
        view.$('.g-chip [data-rigged-ui="reaction-chip-emoji"]').computedStyle("font-size"),
    ).toBe("13px");

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
            "font-size": "10px",
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
