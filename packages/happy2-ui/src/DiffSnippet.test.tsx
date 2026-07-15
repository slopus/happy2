import { expect, it } from "vitest";
import { server } from "vitest/browser";
import "./theme.css";
import "./styles/diff-snippet.css";
import { DiffSnippet, type DiffLine } from "./DiffSnippet";
import { createRenderer, type RenderedElement } from "./testing";

const numberedLines: DiffLine[] = [
    { kind: "meta", text: "@@ -41,3 +41,4 @@" },
    { kind: "context", number: 41, text: "async refresh(token: Token) {" },
    { kind: "del", number: 42, text: "  const lock = await mutex.tryLock()" },
    { kind: "add", number: 42, text: "  const lock = await mutex.lock()" },
    { kind: "add", number: 43, text: "  if (!lock) queue.enqueue(token)" },
    { kind: "context", number: 44, text: "  try {" },
];

const plainLines: DiffLine[] = [
    { kind: "add", text: "retries: 3" },
    { kind: "del", text: "retries: 1" },
    { kind: "context", text: "jitter: true" },
];

const longLines: DiffLine[] = [
    {
        kind: "context",
        text: "const refreshed = await client.tokens.refresh({ token, scopes, audience, tenant })",
    },
    {
        kind: "add",
        text: "const refreshed = await client.tokens.refresh({ token, scopes, audience, tenant, jitter: true })",
    },
];

/*
 * Optical fixtures. Element captures bleed ~1px of surrounding ink into
 * the clip edges, so every optically measured row is buffered by blank
 * context rows (transparent background = the capture-painted ancestor)
 * and carries no adjacent text ink of its own. Gutter/number probes live
 * in a numbered snippet so their left neighbor is a blank cell instead
 * of the snippet's semi-transparent border.
 */
const opticalLines: DiffLine[] = [
    { kind: "context", text: "" },
    { kind: "context", number: 88, text: "" }, // 2-digit number probe
    { kind: "context", text: "" },
    { kind: "del", text: "" }, // del gutter probe
    { kind: "context", text: "" },
    { kind: "add", text: "" }, // add gutter probe
    { kind: "context", text: "" },
    { kind: "context", number: 8, text: "" }, // 1-digit number probe
    { kind: "context", text: "" },
    { kind: "context", number: 100, text: "" }, // 3-digit number probe
    { kind: "context", text: "" },
    { kind: "context", number: 41, text: "41" }, // number-vs-text baseline parity row
    { kind: "context", text: "" },
    { kind: "meta", text: "x" }, // per-kind text band probes
    { kind: "context", text: "" },
    { kind: "context", text: "x" },
    { kind: "context", text: "" },
    { kind: "del", text: "x" },
    { kind: "context", text: "" },
    { kind: "add", text: "x" },
    { kind: "context", text: "" },
];

async function inked(element: RenderedElement<Element>) {
    const metrics = await element.visibleMetrics();
    /* A clipped/blank capture must never pass as "centered". */
    expect(metrics.pixelCount).toBeGreaterThan(0);
    return metrics;
}

it("holds DiffSnippet geometry, colors, typography, and scrolling", async () => {
    const view = createRenderer()
        .render(
            () => (
                <DiffSnippet
                    data-testid="diff-full"
                    file="src/auth/refresh.ts"
                    lines={numberedLines}
                    stats={{ added: 41, removed: 12 }}
                />
            ),
            { width: 376, height: 200, padding: 12 },
        )
        .render(() => <DiffSnippet data-testid="diff-plain" lines={plainLines} />, {
            width: 360,
            height: 110,
            padding: 12,
        })
        .render(
            () => (
                <DiffSnippet
                    data-testid="diff-scroll"
                    file="src/auth/client.ts"
                    lines={longLines}
                />
            ),
            { width: 240, height: 120, padding: 12 },
        );
    await view.ready();

    const monoFamily =
        server.browser === "webkit"
            ? "happy2 Mono, ui-monospace, monospace"
            : '"happy2 Mono", ui-monospace, monospace';

    /* — full variant: header, stats, line numbers — */
    const full = view.$('[data-testid="diff-full"]');
    expect(full.bounds()).toEqual({ x: 12, y: 12, width: 352, height: 166 });
    /* Anti-blank guard: the whole component must actually paint. */
    await inked(full);
    expect(
        full.computedStyles([
            "background-color",
            "border-bottom-width",
            "border-top-color",
            "border-top-left-radius",
            "border-top-width",
            "box-sizing",
            "display",
            "overflow-x",
            "overflow-y",
        ]),
    ).toEqual({
        "background-color": "rgb(20, 19, 25)",
        "border-bottom-width": "1px",
        "border-top-color": "rgba(255, 255, 255, 0.07)",
        "border-top-left-radius": "8px",
        "border-top-width": "1px",
        "box-sizing": "border-box",
        display: "block",
        "overflow-x": "hidden",
        "overflow-y": "hidden",
    });

    const header = view.$('[data-testid="diff-full"] [data-happy2-ui="diff-snippet-header"]');
    expect(header.bounds()).toEqual({ x: 13, y: 13, width: 350, height: 28 });
    expect(
        header.computedStyles([
            "align-items",
            "background-color",
            "border-bottom-color",
            "border-bottom-width",
            "box-sizing",
            "display",
            "font-family",
            "font-size",
            "font-weight",
            "line-height",
            "padding-bottom",
            "padding-left",
            "padding-right",
        ]),
    ).toEqual({
        "align-items": "center",
        "background-color": "rgba(255, 255, 255, 0.05)",
        "border-bottom-color": "rgba(255, 255, 255, 0.07)",
        "border-bottom-width": "1px",
        "box-sizing": "border-box",
        display: "flex",
        "font-family": monoFamily,
        "font-size": "11px",
        "font-weight": "600",
        "line-height": "16px",
        /* Reserves the hairline row so the 16px text line centers on
         * integer geometry inside the 27px inset field. */
        "padding-bottom": "1px",
        "padding-left": "12px",
        "padding-right": "12px",
    });

    const file = view.$('[data-testid="diff-full"] [data-happy2-ui="diff-snippet-file"]');
    const fileMetrics = file.textMetrics();
    expect(fileMetrics.text).toBe("src/auth/refresh.ts");
    expect(fileMetrics.font).toEqual({
        family: monoFamily.replaceAll('"', ""),
        letterSpacing: 0,
        lineHeight: 16,
        size: 11,
        weight: "600",
    });
    expect(file.computedStyle("color")).toBe("rgb(165, 160, 176)");
    /* Integer line-box geometry: 16px line at 5px from the header top,
     * 7px to the header bottom edge (hairline + reserved padding row),
     * i.e. dead-centered in the visible 27px field. */
    expect(file.offsets().top).toBe(5);
    expect(file.offsets().bottom).toBe(7);

    const added = view.$('[data-testid="diff-full"] [data-happy2-ui="diff-snippet-added"]');
    const removed = view.$('[data-testid="diff-full"] [data-happy2-ui="diff-snippet-removed"]');
    expect(added.element.textContent).toBe("+41");
    expect(removed.element.textContent).toBe("−12");
    expect(added.computedStyle("color")).toBe("rgb(52, 211, 153)");
    expect(removed.computedStyle("color")).toBe("rgb(248, 113, 113)");
    const stats = view.$('[data-testid="diff-full"] [data-happy2-ui="diff-snippet-stats"]');
    /* toBeCloseTo: mono text advance widths carry float dust in Gecko (11.999). */
    expect(stats.offsets().right).toBeCloseTo(12, 1);
    expect(stats.offsets().top).toBe(5);

    /* — line rows: 20px rhythm below the 8px code padding — */
    const meta = view.$('[data-testid="diff-full"] [data-kind="meta"]');
    const context = view.$('[data-testid="diff-full"] [data-kind="context"]');
    const del = view.$('[data-testid="diff-full"] [data-kind="del"]');
    const add = view.$('[data-testid="diff-full"] [data-kind="add"]');
    expect(meta.bounds()).toEqual({ x: 13, y: 49, width: 350, height: 20 });
    expect(context.bounds()).toEqual({ x: 13, y: 69, width: 350, height: 20 });
    expect(del.bounds()).toEqual({ x: 13, y: 89, width: 350, height: 20 });
    expect(add.bounds()).toEqual({ x: 13, y: 109, width: 350, height: 20 });
    expect(
        add.computedStyles([
            "background-color",
            "color",
            "font-family",
            "font-size",
            "font-weight",
            "line-height",
            "padding-right",
            "white-space",
        ]),
    ).toEqual({
        "background-color": "rgba(52, 211, 153, 0.09)",
        color: "rgb(52, 211, 153)",
        "font-family": monoFamily,
        "font-size": "12px",
        "font-weight": "400",
        "line-height": "20px",
        "padding-right": "12px",
        "white-space": "pre",
    });
    expect(del.computedStyles(["background-color", "color"])).toEqual({
        "background-color": "rgba(248, 113, 113, 0.09)",
        color: "rgb(248, 113, 113)",
    });
    expect(context.computedStyles(["background-color", "color"])).toEqual({
        "background-color": "rgba(0, 0, 0, 0)",
        color: "rgb(165, 160, 176)",
    });
    expect(meta.computedStyle("color")).toBe("rgb(85, 81, 95)");

    /* — number gutter: 32px, faint, right-aligned — */
    const number = view.$(
        '[data-testid="diff-full"] [data-kind="context"] [data-happy2-ui="diff-snippet-number"]',
    );
    expect(number.element.textContent).toBe("41");
    expect(number.bounds().width).toBe(32);
    expect(number.offsets().left).toBe(0);
    expect(number.computedStyles(["color", "padding-right", "text-align", "width"])).toEqual({
        color: "rgb(85, 81, 95)",
        "padding-right": "6px",
        "text-align": "right",
        width: "32px",
    });

    /* — sign gutter: 24px cell, one glyph per kind, blank for context/meta — */
    const addGutter = view.$(
        '[data-testid="diff-full"] [data-kind="add"] [data-happy2-ui="diff-snippet-gutter"]',
    );
    expect(addGutter.element.textContent).toBe("+");
    expect(addGutter.bounds().width).toBe(24);
    expect(addGutter.offsets().left).toBe(32);
    const delGutter = view.$(
        '[data-testid="diff-full"] [data-kind="del"] [data-happy2-ui="diff-snippet-gutter"]',
    );
    expect(delGutter.element.textContent).toBe("−");
    expect(
        view.$(
            '[data-testid="diff-full"] [data-kind="context"] [data-happy2-ui="diff-snippet-gutter"]',
        ).element.textContent,
    ).toBe("");
    expect(
        view.$(
            '[data-testid="diff-full"] [data-kind="meta"] [data-happy2-ui="diff-snippet-gutter"]',
        ).element.textContent,
    ).toBe("");

    /* — headerless, unnumbered fluid variant — */
    const plain = view.$('[data-testid="diff-plain"]');
    expect(plain.bounds()).toEqual({ x: 12, y: 12, width: 336, height: 78 });
    await inked(plain);
    expect(plain.element.getAttribute("data-numbered")).toBeNull();
    expect(plain.element.querySelector('[data-happy2-ui="diff-snippet-header"]')).toBeNull();
    expect(plain.element.querySelector('[data-happy2-ui="diff-snippet-number"]')).toBeNull();
    const plainAddLine = view.$('[data-testid="diff-plain"] [data-kind="add"]');
    expect(plainAddLine.bounds()).toEqual({ x: 13, y: 21, width: 334, height: 20 });
    const plainGutter = view.$(
        '[data-testid="diff-plain"] [data-kind="add"] [data-happy2-ui="diff-snippet-gutter"]',
    );
    /* The gutter span carries a sub-pixel per-engine optical translate, so
     * its layout contract is horizontal placement inside the 20px row. */
    expect(plainGutter.offsets().left).toBe(0);
    expect(plainGutter.bounds().width).toBe(24);
    expect(plainGutter.bounds().height).toBe(20);

    /* — long lines scroll horizontally and never wrap — */
    const scrollSnippet = view.$('[data-testid="diff-scroll"]');
    await inked(scrollSnippet);
    const scroll = view.$('[data-testid="diff-scroll"] [data-happy2-ui="diff-snippet-scroll"]');
    expect(scroll.computedStyles(["overflow-x", "overflow-y"])).toEqual({
        "overflow-x": "auto",
        "overflow-y": "hidden",
    });
    expect(scroll.element.scrollWidth).toBeGreaterThan(scroll.element.clientWidth);
    const longAdd = view.$('[data-testid="diff-scroll"] [data-kind="add"]');
    expect(longAdd.bounds().height).toBe(20);
    expect(longAdd.bounds().width).toBeGreaterThan(400);
    const code = view.$('[data-testid="diff-scroll"] [data-happy2-ui="diff-snippet-code"]');
    expect(code.bounds().width).toBeGreaterThan(400);

    await view.screenshot("DiffSnippet.test");
});

it("centers DiffSnippet ink optically in all engines", { timeout: 120_000 }, async () => {
    const view = createRenderer()
        .render(() => <DiffSnippet data-testid="optical" lines={opticalLines} />, {
            width: 420,
            height: 470,
            padding: 12,
        })
        .render(
            () => (
                <DiffSnippet
                    data-testid="head-long"
                    file="src/auth/refresh.ts"
                    lines={[{ kind: "context", text: "" }]}
                    stats={{ added: 41, removed: 12 }}
                />
            ),
            { width: 360, height: 90, padding: 12 },
        )
        .render(
            () => (
                <DiffSnippet
                    data-testid="head-digits"
                    file="a.ts"
                    lines={[{ kind: "context", text: "" }]}
                    stats={{ added: 1, removed: 128 }}
                />
            ),
            { width: 360, height: 90, padding: 12 },
        )
        .render(
            () => (
                <DiffSnippet
                    data-testid="head-sym"
                    file="x.ts"
                    lines={[{ kind: "context", text: "" }]}
                    stats={{ added: 8, removed: 8 }}
                />
            ),
            { width: 360, height: 90, padding: 12 },
        );
    await view.ready();

    const row = (n: number, part: string) =>
        view.$(
            `[data-testid="optical"] [data-happy2-ui="diff-snippet-line"]:nth-child(${n}) [data-happy2-ui="diff-snippet-${part}"]`,
        );
    const rowLine = (n: number) =>
        view.$(`[data-testid="optical"] [data-happy2-ui="diff-snippet-line"]:nth-child(${n})`);
    /*
     * Ink centroid in LINE-row coordinates. The gutter/number/text spans
     * carry the per-engine optical translate, and an element capture clips
     * to the span's own (already-translated) border box — measured against
     * itself, a translated span always looks "centered". Composing the
     * span's offset inside the untransformed 20px row re-anchors the
     * centroid to the geometry the eye actually judges.
     */
    const inLine = async (n: number, part: string) => {
        const span = row(n, part);
        const line = rowLine(n);
        const ink = await inked(span);
        return {
            x: span.bounds().x - line.bounds().x + ink.center.x,
            y: span.bounds().y - line.bounds().y + ink.center.y,
        };
    };

    /*
     * Sign gutter: a single symmetric glyph in a 24x20 cell — strict
     * optical-center assertion on both axes. Raw Blink already centers the
     * +/− (they ride the font's math axis, which this font puts on the row
     * center); Gecko/WebKit rasterize the same line half a pixel lower and
     * carry a -0.5px translate. Measured drift after correction:
     * |dx| <= 0.17, |dy| <= 0.12 in all three engines.
     */
    for (const [line, glyph] of [
        [4, "−"],
        [6, "+"],
    ] as const) {
        const gutter = row(line, "gutter");
        expect(gutter.element.textContent).toBe(glyph);
        const cellCenterX = gutter.bounds().x - rowLine(line).bounds().x + 12;
        const ink = await inLine(line, "gutter");
        expect(Math.abs(ink.x - cellCenterX)).toBeLessThanOrEqual(0.4);
        expect(Math.abs(ink.y - 10)).toBeLessThanOrEqual(0.4);
    }

    /*
     * Line numbers are right-aligned digit runs, so their horizontal ink
     * centroid is off-center by design (layout is asserted in the
     * geometry test); the optical contract is vertical: digit ink centers
     * on the 20px row. Blink paints the digit line ~0.43px high raw and
     * carries a +0.5px translate; Gecko/WebKit are centered raw. Measured
     * drift after correction <= 0.17px in all engines across 1/2/3-digit
     * content.
     */
    for (const [line, digits] of [
        [2, "88"],
        [8, "8"],
        [10, "100"],
    ] as const) {
        const num = row(line, "number");
        expect(num.element.textContent).toBe(digits);
        const ink = await inLine(line, "number");
        expect(Math.abs(ink.y - 10)).toBeLessThanOrEqual(0.4);
    }

    /*
     * Number column vs code text: the same digits on the same row must
     * share one baseline — zero relative drift is the alignment contract
     * between the number gutter and the code it labels (measured <= 0.05px
     * in all engines; both spans ride the same optical variable).
     */
    const parityNumber = await inLine(12, "number");
    const parityText = await inLine(12, "text");
    expect(Math.abs(parityNumber.y - parityText.y)).toBeLessThanOrEqual(0.25);

    /*
     * All four line kinds paint their text on the identical band: color
     * treatments must not move ink. The absolute centroid of "x" sits at
     * the x-height band center (below the geometric row center by
     * design), so kinds are asserted against each other (measured spread
     * <= 0.06px per engine).
     */
    const kindBands: number[] = [];
    for (const line of [14, 16, 18, 20]) {
        const ink = await inLine(line, "text");
        kindBands.push(ink.y);
    }
    for (const band of kindBands) {
        expect(Math.abs(band - kindBands[0]!)).toBeLessThanOrEqual(0.25);
    }

    /*
     * Header stats: mono digit runs (letter-spacing 0, asserted, so no
     * trailing letter-space bias can exist) — the horizontal centroid
     * offset is inherent glyph-ink asymmetry (the thin-stroked +/− sign
     * leads a run of heavier digits), so the optical contract is vertical
     * centering in the 16px line box. Measured |dy| <= 0.27px in all
     * engines across 1/2/3-digit counts.
     */
    for (const [snippet, plus, minus] of [
        ["head-long", "+41", "−12"],
        ["head-digits", "+1", "−128"],
        ["head-sym", "+8", "−8"],
    ] as const) {
        const added = view.$(`[data-testid="${snippet}"] [data-happy2-ui="diff-snippet-added"]`);
        const removed = view.$(
            `[data-testid="${snippet}"] [data-happy2-ui="diff-snippet-removed"]`,
        );
        expect(added.element.textContent).toBe(plus);
        expect(removed.element.textContent).toBe(minus);
        expect(added.textMetrics().font.letterSpacing).toBe(0);
        const addedInk = await inked(added);
        const removedInk = await inked(removed);
        expect(Math.abs(addedInk.center.y - added.height() / 2)).toBeLessThanOrEqual(0.4);
        expect(Math.abs(removedInk.center.y - removed.height() / 2)).toBeLessThanOrEqual(0.4);
    }

    /*
     * Header file label: lowercase word ink is inherently asymmetric on
     * the vertical axis (x-height mass below the line-box middle: measured
     * +0.46px for "src/auth/refresh.ts", +0.81px for ascenderless "x.ts"),
     * so the centering contract is line-box symmetry (16px line centered
     * in the 27px field, hairline row reserved); the centroid check is
     * only a gross-drift guard against a wrong line box or clipped paint.
     */
    for (const snippet of ["head-long", "head-digits", "head-sym"] as const) {
        const file = view.$(`[data-testid="${snippet}"] [data-happy2-ui="diff-snippet-file"]`);
        const ink = await inked(file);
        expect(Math.abs(ink.center.y - file.height() / 2)).toBeLessThanOrEqual(1.25);
        expect(file.offsets().top).toBe(5);
        expect(file.offsets().bottom).toBe(7);
    }

    await view.screenshot("DiffSnippet.optical.test");
});
