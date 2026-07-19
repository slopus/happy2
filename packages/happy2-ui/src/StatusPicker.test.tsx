import { expect, it } from "vitest";
import { server } from "vitest/browser";
import "./theme.css";
import "./styles/status-picker.css";
import "./styles/button.css";
import "./styles/icon.css";
import { type Availability, StatusPicker } from "./StatusPicker";
import { createRenderer } from "./testing";

type Renderer = ReturnType<typeof createRenderer>;

/* WebKit reports the family unquoted; textMetrics() strips quotes for both. */
const fontFamily = () =>
    server.browser === "webkit"
        ? "happy2 Figtree, system-ui, sans-serif"
        : '"happy2 Figtree", system-ui, sans-serif';

/*
 * Per-state status-dot colors, resolved from semantic tokens by the segment's
 * data-availability attribute. Auto is muted, online mint, away amber, dnd
 * danger — the identity contract the inventory calls out.
 */
const DOT_COLORS: Record<Availability, string> = {
    automatic: "rgb(142, 142, 147)", // --happy2-text-muted #8e8e93
    online: "rgb(52, 199, 89)", // --happy2-success  #34c759
    away: "rgb(255, 149, 0)", // --happy2-warning  #ff9500
    dnd: "rgb(255, 59, 48)", // --happy2-danger   #ff3b30
};

const AVAILABILITY: Availability[] = ["automatic", "online", "away", "dnd"];
const SEGMENT_LABELS: Record<Availability, string> = {
    automatic: "Auto",
    online: "Online",
    away: "Away",
    dnd: "Busy",
};

/*
 * Alpha-weighted centroid of a solid dot, expressed as an offset from the
 * center of its own 8px box. The dot is an opaque circle inscribed in its box
 * (it deliberately touches the box edges at the side midpoints), so the blank/
 * clip guard is "the visible ink nearly fills the box" rather than "ink does
 * not touch the edges": a truncated capture would report a sliver, not a full
 * ~8px disc.
 */
async function dotDrift(view: Renderer, selector: string) {
    const dot = view.$(selector);
    const visible = await dot.visibleMetrics();
    expect(visible.pixelCount, `${selector} paints no pixels`).toBeGreaterThan(0);
    const box = dot.bounds();
    expect(visible.bounds.width, `${selector} ink width`).toBeGreaterThanOrEqual(7);
    expect(visible.bounds.width, `${selector} ink width`).toBeLessThanOrEqual(9);
    expect(visible.bounds.height, `${selector} ink height`).toBeGreaterThanOrEqual(7);
    expect(visible.bounds.height, `${selector} ink height`).toBeLessThanOrEqual(9);
    return {
        dx: visible.center.x - box.width / 2,
        dy: visible.center.y - box.height / 2,
    };
}

/*
 * Alpha-weighted centroid of a painted Icon glyph, as an offset from the center
 * of its svg box. The glyph is drawn with margins inside the 20-unit grid, so
 * its ink may not touch the captured box edges — that doubles as the clip guard
 * (a truncated capture can never pass silently).
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

it("holds StatusPicker card, availability dots, segmented layout, and status field", async () => {
    const view = createRenderer();

    view.render(
        () => (
            <StatusPicker
                availability="online"
                data-testid="sp"
                expiresLabel="Clears in 1 hour"
                onClearStatus={() => {}}
                statusEmoji="🎧"
                statusText="Focusing"
            />
        ),
        { width: 430, height: 250, padding: 16 },
    );
    await view.ready();

    const sp = (suffix = "") => `[data-testid="sp"]${suffix}`;

    // ---- Card ----------------------------------------------------------
    const card = view.$(sp());
    expect(card.bounds().width, "card width").toBe(380);
    expect(
        card.computedStyles([
            "background-color",
            "border-radius",
            "border-top-color",
            "border-top-width",
            "box-sizing",
            "color",
            "display",
            "flex-direction",
            "font-family",
            "gap",
            "padding",
        ]),
        "card",
    ).toEqual({
        "background-color": "rgb(240, 240, 242)",
        "border-radius": "10px",
        "border-top-color": "rgb(234, 234, 234)",
        "border-top-width": "1px",
        "box-sizing": "border-box",
        color: "rgb(0, 0, 0)",
        display: "flex",
        "flex-direction": "column",
        "font-family": fontFamily(),
        gap: "16px",
        padding: "16px",
    });

    // ---- Availability track --------------------------------------------
    const track = view.$(sp(' [data-happy2-ui="status-picker-segmented"]'));
    expect(track.bounds(), "track bounds").toMatchObject({ width: 346, height: 36 });
    expect(
        track.computedStyles([
            "background-color",
            "border-radius",
            "border-top-color",
            "box-sizing",
            "display",
            "height",
        ]),
        "track",
    ).toEqual({
        "background-color": "rgb(245, 245, 245)",
        "border-radius": "6px",
        "border-top-color": "rgb(234, 234, 234)",
        "box-sizing": "border-box",
        display: "flex",
        height: "36px",
    });
    // Online is the second option, so the pill index resolves to 1.
    expect(track.computedStyle("--happy2-sp-index"), "pill index").toBe("1");
    expect(
        view.$(sp()).element.querySelectorAll('[data-happy2-ui="status-picker-segment"]').length,
        "segment count",
    ).toBe(4);

    // ---- Segments, dots, labels ----------------------------------------
    const segBounds = {} as Record<
        Availability,
        { x: number; y: number; width: number; height: number }
    >;
    for (const value of AVAILABILITY) {
        const seg = view.$(
            sp(` [data-availability="${value}"][data-happy2-ui="status-picker-segment"]`),
        );
        const bounds = seg.bounds();
        segBounds[value] = bounds;
        expect(bounds.width, `${value} segment width`).toBe(84);
        expect(bounds.height, `${value} segment height`).toBe(26);

        // Dot geometry + exact identity color per state.
        const dot = view.$(
            sp(` [data-availability="${value}"][data-happy2-ui="status-picker-dot"]`),
        );
        expect(dot.bounds(), `${value} dot box`).toMatchObject({ width: 8, height: 8 });
        expect(dot.computedStyle("background-color"), `${value} dot color`).toBe(DOT_COLORS[value]);

        // The dot + label group is centered as a unit inside the segment
        // (the dot shifts the label right, so the label alone is not centered).
        const label = view.$(
            sp(` [data-availability="${value}"] [data-happy2-ui="status-picker-segment-label"]`),
        );
        const labelBounds = label.bounds();
        const left = dot.bounds().x - bounds.x;
        const right = bounds.x + bounds.width - labelBounds.x - labelBounds.width;
        expect(Math.abs(left - right), `${value} group symmetry`).toBeLessThanOrEqual(0.5);
    }

    // Label typography + active/inactive foreground tokens.
    const onlineLabel = view.$(
        sp(' [data-availability="online"] [data-happy2-ui="status-picker-segment-label"]'),
    );
    expect(onlineLabel.computedStyle("color"), "active color").toBe("rgb(0, 0, 0)");
    expect(onlineLabel.textMetrics(), "active label typography").toMatchObject({
        font: {
            family: "happy2 Figtree, system-ui, sans-serif",
            letterSpacing: 0.13,
            lineHeight: 18,
            size: 13,
            weight: "600",
        },
        text: "Online",
    });
    for (const value of ["automatic", "away", "dnd"] as const) {
        const label = view.$(
            sp(` [data-availability="${value}"] [data-happy2-ui="status-picker-segment-label"]`),
        );
        expect(label.computedStyle("color"), `${value} inactive color`).toBe("rgb(142, 142, 147)");
    }

    // Symmetric dot centroids on the three unselected segments (the selected
    // segment carries the constant-fill pill behind it, which would bias the
    // alpha reconstruction; its color is asserted above without a capture).
    for (const value of ["automatic", "away", "dnd"] as const) {
        const drift = await dotDrift(
            view,
            sp(` [data-availability="${value}"][data-happy2-ui="status-picker-dot"]`),
        );
        expect(Math.abs(drift.dx), `${value} dot x centroid`).toBeLessThanOrEqual(0.4);
        expect(Math.abs(drift.dy), `${value} dot y centroid`).toBeLessThanOrEqual(0.4);
    }

    // ---- Selected pill lands on the online segment ---------------------
    const pill = view.$(sp(' [data-happy2-ui="status-picker-pill"]'));
    const pillBounds = pill.bounds();
    const onlineSeg = segBounds.online;
    expect(Math.abs(pillBounds.x - onlineSeg.x), "pill x").toBeLessThanOrEqual(0.1);
    expect(Math.abs(pillBounds.y - onlineSeg.y), "pill y").toBeLessThanOrEqual(0.1);
    expect(Math.abs(pillBounds.width - onlineSeg.width), "pill width").toBeLessThanOrEqual(0.1);
    expect(Math.abs(pillBounds.height - onlineSeg.height), "pill height").toBeLessThanOrEqual(0.1);
    expect(
        pill.computedStyles(["background-color", "border-radius", "border-top-color", "position"]),
        "pill style",
    ).toEqual({
        "background-color": "rgb(240, 240, 242)",
        "border-radius": "1px",
        "border-top-color": "rgb(209, 209, 214)",
        position: "absolute",
    });

    // ---- Section eyebrow label -----------------------------------------
    const availLabel = view.$(sp(' [data-happy2-ui="status-picker-availability-label"]'));
    expect(
        availLabel.computedStyles([
            "color",
            "font-size",
            "font-weight",
            "letter-spacing",
            "line-height",
            "text-transform",
        ]),
        "eyebrow",
    ).toEqual({
        color: "rgb(142, 142, 147)",
        "font-size": "11px",
        "font-weight": "700",
        "letter-spacing": "0.66px",
        "line-height": "14px",
        "text-transform": "uppercase",
    });

    // ---- Status field ---------------------------------------------------
    const field = view.$(sp(' [data-happy2-ui="status-picker-field"]'));
    expect(field.bounds(), "field bounds").toMatchObject({ width: 346, height: 40 });
    expect(
        field.computedStyles([
            "align-items",
            "background-color",
            "border-radius",
            "border-top-color",
            "display",
            "height",
        ]),
        "field",
    ).toEqual({
        "align-items": "center",
        "background-color": "rgb(245, 245, 245)",
        "border-radius": "6px",
        "border-top-color": "rgb(234, 234, 234)",
        display: "flex",
        height: "40px",
    });

    // Fixed 24px emoji slot that actually paints a color glyph.
    const emoji = view.$(sp(' [data-happy2-ui="status-picker-emoji"]'));
    expect(emoji.bounds(), "emoji slot box").toMatchObject({ width: 24, height: 24 });
    // Emoji artwork varies by platform, so assert only that it is visible in the
    // slot (EmojiPicker policy: visible, do not require identical artwork bounds).
    expect((await emoji.visibleMetrics()).pixelCount, "emoji paints").toBeGreaterThan(0);

    // Input typography + value.
    const input = view.$(sp(' [data-happy2-ui="status-picker-input"]'));
    expect(input.computedStyle("color"), "input color").toBe("rgb(0, 0, 0)");
    expect(input.textMetrics(), "input typography").toMatchObject({
        font: {
            family: "happy2 Figtree, system-ui, sans-serif",
            letterSpacing: 0,
            lineHeight: 38,
            size: 13,
            weight: "500",
        },
        text: "Focusing",
    });

    // Reused ghost Button clears the status: 28px square, 14px close glyph,
    // optically centered on both axes (the close glyph is symmetric).
    const clear = view.$(sp(' [data-happy2-ui="status-picker-field"] [data-happy2-ui="button"]'));
    expect(clear.bounds(), "clear button box").toMatchObject({ width: 28, height: 28 });
    const clearGlyph = view.$(
        sp(' [data-happy2-ui="status-picker-field"] [data-happy2-ui="button"] svg'),
    );
    expect(clearGlyph.bounds(), "clear glyph box").toMatchObject({ width: 14, height: 14 });
    const glyph = await glyphDrift(
        view,
        sp(' [data-happy2-ui="status-picker-field"] [data-happy2-ui="button"] svg'),
    );
    expect(Math.abs(glyph.dx), "clear glyph x centroid").toBeLessThanOrEqual(0.4);
    expect(Math.abs(glyph.dy), "clear glyph y centroid").toBeLessThanOrEqual(0.4);

    // ---- Expiry meta ----------------------------------------------------
    const meta = view.$(sp(' [data-happy2-ui="status-picker-meta"]'));
    expect(meta.computedStyle("color"), "meta color").toBe("rgb(142, 142, 147)");
    expect(
        view.$(sp(' [data-happy2-ui="status-picker-meta-icon"] [data-happy2-ui="icon"]')).bounds(),
        "meta icon box",
    ).toMatchObject({ width: 14, height: 14 });

    // ---- Layout rhythm (8px within section, 16px between sections) ------
    const availSection = view.$(sp(' [data-happy2-ui="status-picker-availability"]'));
    const statusSection = view.$(sp(' [data-happy2-ui="status-picker-status"]'));
    const availLabelBounds = availLabel.bounds();
    const trackBounds = track.bounds();
    expect(
        trackBounds.y - (availLabelBounds.y + availLabelBounds.height),
        "eyebrow → track gap",
    ).toBeCloseTo(8, 1);
    const availBounds = availSection.bounds();
    const statusBounds = statusSection.bounds();
    expect(statusBounds.y - (availBounds.y + availBounds.height), "section rhythm").toBeCloseTo(
        16,
        1,
    );
    const statusLabelBounds = view.$(sp(' [data-happy2-ui="status-picker-status-label"]')).bounds();
    const fieldBounds = field.bounds();
    expect(
        fieldBounds.y - (statusLabelBounds.y + statusLabelBounds.height),
        "status eyebrow → field gap",
    ).toBeCloseTo(8, 1);
    const metaBounds = meta.bounds();
    expect(metaBounds.y - (fieldBounds.y + fieldBounds.height), "field → meta gap").toBeCloseTo(
        8,
        1,
    );

    await view.screenshot("StatusPicker.test");
}, 120_000);

it("holds StatusPicker availability sweep and empty-status state", async () => {
    const view = createRenderer();

    for (const value of AVAILABILITY) {
        view.render(() => <StatusPicker availability={value} data-testid={`sweep-${value}`} />, {
            width: 430,
            height: 210,
            padding: 16,
        });
    }
    view.render(() => <StatusPicker availability="automatic" data-testid="empty" />, {
        width: 430,
        height: 210,
        padding: 16,
    });
    await view.ready();

    // The pill tracks whichever availability is selected, and only that segment
    // carries the active foreground token.
    for (const [index, value] of AVAILABILITY.entries()) {
        const root = `[data-testid="sweep-${value}"]`;
        const track = view.$(`${root} [data-happy2-ui="status-picker-segmented"]`);
        expect(track.computedStyle("--happy2-sp-index"), `${value} index`).toBe(String(index));

        const seg = view.$(
            `${root} [data-availability="${value}"][data-happy2-ui="status-picker-segment"]`,
        );
        const pill = view.$(`${root} [data-happy2-ui="status-picker-pill"]`);
        const segBounds = seg.bounds();
        const pillBounds = pill.bounds();
        expect(Math.abs(pillBounds.x - segBounds.x), `${value} pill x`).toBeLessThanOrEqual(0.1);
        expect(Math.abs(pillBounds.y - segBounds.y), `${value} pill y`).toBeLessThanOrEqual(0.1);
        expect(
            Math.abs(pillBounds.width - segBounds.width),
            `${value} pill width`,
        ).toBeLessThanOrEqual(0.1);

        const selectedLabel = view.$(
            `${root} [data-availability="${value}"] [data-happy2-ui="status-picker-segment-label"]`,
        );
        expect(selectedLabel.computedStyle("color"), `${value} selected color`).toBe(
            "rgb(0, 0, 0)",
        );
        for (const other of AVAILABILITY) {
            if (other === value) continue;
            const otherLabel = view.$(
                `${root} [data-availability="${other}"] [data-happy2-ui="status-picker-segment-label"]`,
            );
            expect(otherLabel.computedStyle("color"), `${value}/${other} inactive`).toBe(
                "rgb(142, 142, 147)",
            );
            // Every dot keeps its own identity color regardless of selection.
            const otherDot = view.$(
                `${root} [data-availability="${other}"][data-happy2-ui="status-picker-dot"]`,
            );
            expect(otherDot.computedStyle("background-color"), `${value}/${other} dot`).toBe(
                DOT_COLORS[other],
            );
        }
        expect(SEGMENT_LABELS[value], `${value} label text`).toBe(selectedLabel.textMetrics().text);
    }

    // Empty status: no emoji → the smile Icon placeholder, empty input showing
    // its placeholder, and neither a clear Button nor an expiry meta row.
    const emptyRoot = view.$('[data-testid="empty"]');
    const placeholderGlyph = view.$(
        '[data-testid="empty"] [data-happy2-ui="status-picker-emoji"] [data-happy2-ui="icon"]',
    );
    expect(placeholderGlyph.bounds(), "placeholder glyph box").toMatchObject({
        width: 18,
        height: 18,
    });
    expect(
        emptyRoot.element.querySelector(
            '[data-happy2-ui="status-picker-field"] [data-happy2-ui="button"]',
        ),
        "no clear button when empty",
    ).toBe(null);
    expect(
        emptyRoot.element.querySelector('[data-happy2-ui="status-picker-meta"]'),
        "no meta when no expiry",
    ).toBe(null);
    const emptyInput = view.$('[data-testid="empty"] [data-happy2-ui="status-picker-input"]');
    expect(emptyInput.textMetrics().text, "placeholder text").toBe("What's your status?");

    await view.screenshot("StatusPicker.variants.test");
}, 120_000);
