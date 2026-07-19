import "./theme.css";
import "./styles/stat-tile.css";
import "./styles/icon.css";
import { expect, it } from "vitest";
import { server } from "vitest/browser";
import { StatTile } from "./StatTile";
import { createRenderer, type RenderedElement } from "./testing";

type Engine = "chromium" | "firefox" | "webkit";
const engine = () => server.browser as Engine;

/*
 * Symmetric painted glyphs (icon chip glyphs, the horizontally symmetric trend
 * arrows) hold their alpha centroid to the tuned 0.4px. Word/number ink (label,
 * value, delta value, hint) is asymmetric by content — a digit run is
 * top-heavy, a word carries content-dependent descender mass — so per the
 * optical policy those parts assert font metrics, a shared/consistent baseline,
 * deterministic line-box geometry, and unclipped painted bounds instead of a
 * forced centroid.
 */
const GLYPH_TOL = 0.4;

const fontFamily = () =>
    engine() === "webkit"
        ? "happy2 Figtree, system-ui, sans-serif"
        : '"happy2 Figtree", system-ui, sans-serif';

/*
 * Alpha-weighted centroid drift of a painted glyph from the center of its OWN
 * box, refusing blank or edge-clipped captures so a truncated screenshot can
 * never pass silently.
 */
async function glyphDrift(part: RenderedElement<Element>, name: string) {
    const vis = await part.visibleMetrics();
    expect(vis.pixelCount, `${name} paints no pixels`).toBeGreaterThan(0);
    const box = part.bounds();
    expect(vis.bounds.x, `${name} ink clipped at left`).toBeGreaterThan(0);
    expect(vis.bounds.y, `${name} ink clipped at top`).toBeGreaterThan(0);
    expect(vis.bounds.x + vis.bounds.width, `${name} ink clipped at right`).toBeLessThan(box.width);
    expect(vis.bounds.y + vis.bounds.height, `${name} ink clipped at bottom`).toBeLessThan(
        box.height,
    );
    return { dx: vis.center.x - box.width / 2, dy: vis.center.y - box.height / 2 };
}

/* Asserts a text part paints and its ink stays within its own line box. */
async function paints(part: RenderedElement<Element>, name: string) {
    const vis = await part.visibleMetrics();
    expect(vis.pixelCount, `${name} paints no pixels`).toBeGreaterThan(0);
    const box = part.bounds();
    expect(vis.bounds.y, `${name} ink clipped at top`).toBeGreaterThan(0);
    expect(vis.bounds.y + vis.bounds.height, `${name} ink clipped at bottom`).toBeLessThanOrEqual(
        box.height,
    );
    return vis;
}

const trendColors = {
    up: "rgb(52, 199, 89)",
    down: "rgb(255, 59, 48)",
    flat: "rgb(142, 142, 147)",
} as const;

it("holds StatTile card geometry, typography, and trend deltas", async () => {
    const view = createRenderer();

    view.render(
        () => (
            <div style={{ width: "240px" }}>
                <StatTile
                    data-testid="st-full"
                    delta={{ value: "+12%", trend: "up" }}
                    hint="vs last week"
                    icon="spark"
                    label="Active users"
                    tone="accent"
                    value="1,284"
                />
            </div>
        ),
        { width: 272, height: 180, padding: 16 },
    );
    view.render(
        () => (
            <div style={{ display: "flex", gap: "16px" }}>
                <div style={{ width: "180px" }}>
                    <StatTile
                        data-testid="st-up"
                        delta={{ value: "+18%", trend: "up" }}
                        label="Messages"
                        value="8,420"
                    />
                </div>
                <div style={{ width: "180px" }}>
                    <StatTile
                        data-testid="st-down"
                        delta={{ value: "-12%", trend: "down" }}
                        label="Errors"
                        value="37"
                    />
                </div>
                <div style={{ width: "180px" }}>
                    <StatTile
                        data-testid="st-flat"
                        delta={{ value: "0%", trend: "flat" }}
                        label="Latency"
                        value="212ms"
                    />
                </div>
            </div>
        ),
        { width: 604, height: 176, padding: 16 },
    );
    await view.ready();

    /* ---- Root card contract --------------------------------------------- */

    const root = view.$('[data-testid="st-full"]');
    expect(root.bounds().width, "card width").toBe(240);
    expect(
        root.computedStyles([
            "background-color",
            "border-radius",
            "border-top-color",
            "border-top-width",
            "box-sizing",
            "display",
            "flex-direction",
            "font-family",
            "padding",
            "row-gap",
        ]),
    ).toEqual({
        "background-color": "rgb(255, 255, 255)",
        "border-radius": "10px",
        "border-top-color": "rgb(234, 234, 234)",
        "border-top-width": "1px",
        "box-sizing": "border-box",
        display: "flex",
        "flex-direction": "column",
        "font-family": fontFamily(),
        padding: "16px",
        "row-gap": "8px",
    });

    /* ---- Vertical rhythm: header 28, gap 8, value 32, gap 8, footer 16 --- */

    const header = view.$('[data-testid="st-full"] [data-happy2-ui="stat-tile-header"]');
    const value = view.$('[data-testid="st-full"] [data-happy2-ui="stat-tile-value"]');
    const footer = view.$('[data-testid="st-full"] [data-happy2-ui="stat-tile-footer"]');
    expect(header.offsets()).toMatchObject({ top: 17, left: 17 });
    expect(header.bounds().height, "header height").toBe(28);
    expect(header.bounds().width, "header width").toBe(206); /* 240 - 2 - 32 */
    expect(value.offsets()).toMatchObject({ top: 53, left: 17 }); /* 17 + 28 + 8 */
    expect(value.bounds().height, "value line box").toBe(32);
    expect(footer.offsets()).toMatchObject({ top: 93, left: 17 }); /* 53 + 32 + 8 */
    expect(footer.bounds().height, "footer height").toBe(16);

    /* ---- Label: muted, vertically centered in the 28px header ------------ */

    const label = view.$('[data-testid="st-full"] [data-happy2-ui="stat-tile-label"]');
    expect(label.computedStyle("color")).toBe("rgb(142, 142, 147)");
    expect(label.textMetrics()).toMatchObject({
        font: {
            family: "happy2 Figtree, system-ui, sans-serif",
            lineHeight: 16,
            size: 12,
            weight: "600",
        },
        text: "Active users",
    });
    /* Word label: assert line-box symmetry (equal top/bottom gap in the header)
     * and flush-left origin, not a forced centroid. */
    expect(label.offsets()).toMatchObject({ top: 6, bottom: 6, left: 0 }); /* (28 - 16) / 2 */
    await paints(label, "label");

    /* ---- Icon chip: 28px, tone accent, glyph optically centered ---------- */

    const chip = view.$('[data-testid="st-full"] [data-happy2-ui="stat-tile-icon"]');
    expect(chip.bounds()).toMatchObject({ width: 28, height: 28 });
    expect(chip.offsets()).toMatchObject({ top: 0, right: 0, bottom: 0 }); /* pinned top-right */
    expect(chip.computedStyles(["background-color", "border-radius", "color"])).toEqual({
        "background-color": "rgba(0, 122, 255, 0.14)",
        "border-radius": "6px",
        color: "rgb(0, 122, 255)",
    });
    const chipIcon = view.$(
        '[data-testid="st-full"] [data-happy2-ui="stat-tile-icon"] [data-happy2-ui="icon"]',
    );
    expect(chipIcon.bounds()).toMatchObject({ width: 16, height: 16 });
    expect(chipIcon.offsets()).toEqual({ top: 6, right: 6, bottom: 6, left: 6 }); /* (28 - 16)/2 */
    const chipGlyph = await glyphDrift(chipIcon, "chip glyph");
    expect(Math.abs(chipGlyph.dx), "chip glyph x centroid").toBeLessThanOrEqual(GLYPH_TOL);
    expect(Math.abs(chipGlyph.dy), "chip glyph y centroid").toBeLessThanOrEqual(GLYPH_TOL);

    /* ---- Value: 28px tabular, solid text colour, unclipped, left-flush --- */

    expect(value.computedStyle("color")).toBe("rgb(0, 0, 0)");
    const valueVariant = value.computedStyle("font-variant-numeric");
    expect(valueVariant, "value tabular-nums").toContain("tabular-nums");
    expect(valueVariant, "value lining-nums").toContain("lining-nums");
    expect(value.textMetrics()).toMatchObject({
        font: {
            family: "happy2 Figtree, system-ui, sans-serif",
            lineHeight: 32,
            size: 28,
            weight: "700",
        },
        text: "1,284",
    });
    const valueVis = await paints(value, "value");
    /* Left-aligned: ink hugs the box origin (side-bearing only). A centered
     * "1,284" in the 206px box would start ~75px in, so this proves alignment. */
    expect(valueVis.bounds.x, "value ink left-flush").toBeLessThanOrEqual(8);

    /* Same-size values with identical layout above share one baseline. */
    const upValue = view.$('[data-testid="st-up"] [data-happy2-ui="stat-tile-value"]');
    expect(upValue.offsets()).toMatchObject({ top: 53, left: 17 });
    expect(
        Math.abs(
            value.textMetrics().baseline.fromElementTop -
                upValue.textMetrics().baseline.fromElementTop,
        ),
        "value baseline sharing",
    ).toBeLessThanOrEqual(0.1);

    /* ---- Delta: colour + arrow by trend, hint ---------------------------- */

    const delta = view.$('[data-testid="st-full"] [data-happy2-ui="stat-tile-delta"]');
    expect(delta.computedStyle("color")).toBe(trendColors.up);
    const deltaValue = view.$('[data-testid="st-full"] [data-happy2-ui="stat-tile-delta-value"]');
    expect(deltaValue.computedStyle("color")).toBe(trendColors.up);
    expect(deltaValue.textMetrics()).toMatchObject({
        font: { lineHeight: 16, size: 13, weight: "600" },
        text: "+12%",
    });
    await paints(deltaValue, "delta value");

    const hint = view.$('[data-testid="st-full"] [data-happy2-ui="stat-tile-hint"]');
    expect(hint.computedStyle("color")).toBe("rgb(142, 142, 147)");
    expect(hint.textMetrics()).toMatchObject({
        font: { lineHeight: 16, size: 12, weight: "500" },
        text: "vs last week",
    });
    await paints(hint, "hint");

    /* Trend arrows: 12px box, coloured by trend, symmetric about the x axis
     * (up/down are intentionally directional on y; flat is symmetric on both).
     */
    for (const [id, trend, checkY] of [
        ["st-up", "up", false],
        ["st-down", "down", false],
        ["st-flat", "flat", true],
    ] as const) {
        const arrow = view.$(`[data-testid="${id}"] [data-happy2-ui="stat-tile-delta-arrow"]`);
        expect(arrow.bounds(), `${trend} arrow box`).toMatchObject({ width: 12, height: 12 });
        expect(arrow.element.getAttribute("data-trend")).toBe(trend);
        expect(arrow.computedStyle("fill"), `${trend} arrow fill`).toBe(trendColors[trend]);
        const drift = await glyphDrift(arrow, `${trend} arrow`);
        expect(Math.abs(drift.dx), `${trend} arrow x centroid`).toBeLessThanOrEqual(GLYPH_TOL);
        if (checkY) {
            expect(Math.abs(drift.dy), `${trend} arrow y centroid`).toBeLessThanOrEqual(GLYPH_TOL);
        }
        const deltaEl = view.$(`[data-testid="${id}"] [data-happy2-ui="stat-tile-delta"]`);
        expect(deltaEl.computedStyle("color"), `${trend} delta colour`).toBe(trendColors[trend]);
    }

    await view.screenshot("StatTile.test");
}, 120_000);

it("holds StatTile tones and content states", async () => {
    const view = createRenderer();

    const tones = [
        ["st-neutral", "neutral", "bell", "Total", "1,024"],
        ["st-accent", "accent", "spark", "Active", "312"],
        ["st-success", "success", "check-circle", "Resolved", "88%"],
        ["st-warning", "warning", "eye", "Pending", "14"],
        ["st-danger", "danger", "shield", "Blocked", "3"],
    ] as const;
    view.render(
        () => (
            <div style={{ display: "flex", gap: "16px" }}>
                {tones.map(([id, tone, icon, label, value]) => (
                    <div key={id} style={{ width: "180px" }}>
                        <StatTile
                            data-testid={id}
                            icon={icon}
                            label={label}
                            tone={tone}
                            value={value}
                        />
                    </div>
                ))}
            </div>
        ),
        { width: 1012, height: 168, padding: 16 },
    );
    view.render(
        () => (
            <div style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
                <div style={{ width: "180px" }}>
                    <StatTile data-testid="st-plain" label="Uptime" value="99.98%" />
                </div>
                <div style={{ width: "180px" }}>
                    <StatTile
                        data-testid="st-hint"
                        hint="of 2 TB used"
                        label="Storage"
                        value="68%"
                    />
                </div>
                <div style={{ width: "160px" }}>
                    <StatTile
                        data-testid="st-long"
                        icon="star"
                        label="Revenue"
                        tone="success"
                        value="$1,284,590.50"
                    />
                </div>
            </div>
        ),
        { width: 588, height: 168, padding: 16 },
    );
    await view.ready();

    /* ---- Tones: chip fill + glyph colour per tone ------------------------ */

    const toneChips: Record<string, { background: string; color: string }> = {
        neutral: { background: "rgb(245, 245, 245)", color: "rgb(142, 142, 147)" },
        accent: { background: "rgba(0, 122, 255, 0.14)", color: "rgb(0, 122, 255)" },
        success: { background: "rgba(52, 199, 89, 0.14)", color: "rgb(36, 138, 61)" },
        warning: { background: "rgba(255, 149, 0, 0.14)", color: "rgb(201, 52, 0)" },
        danger: { background: "rgba(255, 59, 48, 0.12)", color: "rgb(215, 0, 21)" },
    };
    for (const [id, tone] of tones.map(([id, tone]) => [id, tone] as const)) {
        const chip = view.$(`[data-testid="${id}"] [data-happy2-ui="stat-tile-icon"]`);
        expect(chip.bounds(), `${tone} chip box`).toMatchObject({ width: 28, height: 28 });
        expect(chip.computedStyles(["background-color", "color"]), `${tone} chip colours`).toEqual({
            "background-color": toneChips[tone]!.background,
            color: toneChips[tone]!.color,
        });
        const icon = view.$(
            `[data-testid="${id}"] [data-happy2-ui="stat-tile-icon"] [data-happy2-ui="icon"]`,
        );
        expect(icon.offsets(), `${tone} glyph box centered`).toEqual({
            top: 6,
            right: 6,
            bottom: 6,
            left: 6,
        });
        await paints(icon, `${tone} glyph`);
    }
    /* Full centroid on two clearly bilaterally symmetric glyphs. */
    for (const id of ["st-neutral", "st-accent"] as const) {
        const icon = view.$(
            `[data-testid="${id}"] [data-happy2-ui="stat-tile-icon"] [data-happy2-ui="icon"]`,
        );
        const drift = await glyphDrift(icon, `${id} glyph`);
        expect(Math.abs(drift.dx), `${id} glyph x centroid`).toBeLessThanOrEqual(GLYPH_TOL);
        expect(Math.abs(drift.dy), `${id} glyph y centroid`).toBeLessThanOrEqual(GLYPH_TOL);
    }

    /* ---- Plain: value only, no icon, no footer -------------------------- */

    const plain = view.$('[data-testid="st-plain"]');
    expect(
        view.container.querySelector('[data-testid="st-plain"] [data-happy2-ui="stat-tile-icon"]'),
        "plain has no icon",
    ).toBeNull();
    expect(
        view.container.querySelector(
            '[data-testid="st-plain"] [data-happy2-ui="stat-tile-footer"]',
        ),
        "plain has no footer",
    ).toBeNull();
    const plainValue = view.$('[data-testid="st-plain"] [data-happy2-ui="stat-tile-value"]');
    expect(plainValue.offsets()).toMatchObject({ top: 53, left: 17 });
    await paints(plainValue, "plain value");
    void plain;

    /* ---- Hint only: footer without a delta ------------------------------ */

    expect(
        view.container.querySelector('[data-testid="st-hint"] [data-happy2-ui="stat-tile-delta"]'),
        "hint tile has no delta",
    ).toBeNull();
    const hintFooter = view.$('[data-testid="st-hint"] [data-happy2-ui="stat-tile-footer"]');
    expect(hintFooter.offsets()).toMatchObject({ top: 93, left: 17 }); /* footer at card origin */
    const hint = view.$('[data-testid="st-hint"] [data-happy2-ui="stat-tile-hint"]');
    expect(hint.offsets()).toMatchObject({ top: 0, left: 0 }); /* lone hint leads the footer */
    expect(hint.textMetrics().text).toBe("of 2 TB used");
    await paints(hint, "hint-only");

    /* ---- Long value: clamps and truncates within its card --------------- */

    const longValue = view.$('[data-testid="st-long"] [data-happy2-ui="stat-tile-value"]');
    expect(longValue.bounds().width, "clamped value width").toBe(126); /* 160 - 2 - 32 */
    expect(longValue.computedStyles(["overflow-x", "text-overflow", "white-space"])).toEqual({
        "overflow-x": "hidden",
        "text-overflow": "ellipsis",
        "white-space": "nowrap",
    });
    await paints(longValue, "long value");

    await view.screenshot("StatTile.variants.test");
}, 120_000);
