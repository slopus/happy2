import { expect, it } from "vitest";
import { server } from "vitest/browser";
import "./theme.css";
import "./styles/icon.css";
import "./styles/avatar.css";
import "./styles/agent-activity-indicator.css";
import { AgentActivityIndicator } from "./AgentActivityIndicator";
import { createRenderer } from "./testing";

type Engine = "chromium" | "firefox" | "webkit";
type View = ReturnType<typeof createRenderer>;

const engine = () => server.browser as Engine;

const uiFamily = () =>
    engine() === "webkit"
        ? "happy2 Figtree, system-ui, sans-serif"
        : '"happy2 Figtree", system-ui, sans-serif';

const monoFamily = () =>
    engine() === "webkit"
        ? "happy2 Mono, ui-monospace, monospace"
        : '"happy2 Mono", ui-monospace, monospace';

/*
 * Text ink in a 28px chip shares the row's 14px lane center. The mono meta is
 * descender-free lining/tabular figures, so it holds a tight alpha centroid.
 * The UI name and phase carry arbitrary content whose descenders bias the
 * alpha centroid low by design (DESIGN.md "Testing text by character class"),
 * so they assert the ink bounding-box center and a shared baseline instead.
 * The chip carries no per-engine optical correction; the tolerances absorb the
 * line-box asymmetry each engine rasterizes.
 */
const META_CENTROID_TOLERANCE = 1;
const WORD_BOUNDS_TOLERANCE = 1.5;
const BASELINE_TOLERANCE = 0.2;
const DOT_TOLERANCE = 0.5;

/*
 * Ink drift of a part from the chip's lane center, measured in the chip's own
 * coordinate space (parts nest under the meta wrapper, so the absolute row
 * rect is the shared reference, not the immediate parent). Returns both the
 * alpha-weighted centroid drift and the ink bounding-box center drift.
 */
async function inkMetrics(view: View, container: string, part: string) {
    const row = view.$(container);
    const el = view.$(`${container} ${part}`);
    const vis = await el.visibleMetrics();
    expect(vis.pixelCount, `${container} ${part} paints no pixels`).toBeGreaterThan(0);
    const topInRow = el.bounds().y - row.bounds().y;
    const laneCenter = row.bounds().height / 2;
    return {
        centroidDy: topInRow + vis.center.y - laneCenter,
        boundsDy: topInRow + vis.bounds.y + vis.bounds.height / 2 - laneCenter,
    };
}

/** Painted baseline of a text part in its chip's coordinate space. */
function baselineOf(view: View, container: string, part: string) {
    const row = view.$(container);
    const el = view.$(`${container} ${part}`);
    return el.textMetrics().baseline.fromSurfaceTop - row.bounds().y;
}

async function inkDy(view: View, container: string, part: string) {
    return (await inkMetrics(view, container, part)).centroidDy;
}

it("holds AgentActivityIndicator geometry, colors, and typography", async () => {
    const view = createRenderer().render(
        () => (
            <div
                style={{
                    background: "#17161c",
                    display: "flex",
                    "flex-direction": "column",
                    gap: "12px",
                    padding: "16px",
                    "align-items": "flex-start",
                }}
            >
                <AgentActivityIndicator
                    class="ind-think"
                    elapsedSeconds={7}
                    initials="AD"
                    name="Ada"
                    phase="thinking"
                    tokenCount={128}
                    tone="violet"
                />
                <AgentActivityIndicator
                    class="ind-type"
                    elapsedSeconds={3_723}
                    initials="CX"
                    name="Codex"
                    phase="typing"
                    tokenCount={1_284}
                    tone="mint"
                />
            </div>
        ),
        { width: 360, height: 140 },
    );
    await view.ready();

    // Container: 28px content-sized pill, hairline border, surface fill.
    const think = view.$(".ind-think");
    expect(think.height()).toBe(28);
    expect(
        think.computedStyles([
            "align-items",
            "background-color",
            "border-radius",
            "border-top-color",
            "border-top-width",
            "box-sizing",
            "display",
            "font-family",
        ]),
    ).toEqual({
        "align-items": "center",
        "background-color": "rgb(28, 27, 34)",
        "border-radius": "10px",
        "border-top-color": "rgba(255, 255, 255, 0.07)",
        "border-top-width": "1px",
        "box-sizing": "border-box",
        display: "flex",
        "font-family": uiFamily(),
    });
    expect(think.element.getAttribute("data-phase")).toBe("thinking");
    expect(think.element.getAttribute("role")).toBe("status");
    expect(view.$(".ind-type").element.getAttribute("data-phase")).toBe("typing");

    // Avatar: 20px agent avatar leading the pill.
    const avatar = view.$('.ind-think [data-happy2-ui="avatar"]');
    expect(avatar.bounds().width).toBe(20);
    expect(avatar.bounds().height).toBe(20);
    expect(avatar.element.getAttribute("data-type")).toBe("agent");
    expect((await avatar.visibleMetrics()).pixelCount).toBeGreaterThan(0);

    // Name: 12/600 solid text.
    const name = view.$('.ind-think [data-happy2-ui="agent-activity-name"]');
    expect(name.element.textContent).toBe("Ada");
    expect(name.computedStyle("color")).toBe("rgb(237, 234, 242)");
    expect(name.textMetrics().font).toMatchObject({
        family: "happy2 Figtree, system-ui, sans-serif",
        size: 12,
        weight: "600",
    });

    // Live dot: 5px accent circle, optically centered on the lane.
    const dot = view.$('.ind-think [data-happy2-ui="agent-activity-dot"]');
    expect(dot.bounds().width).toBe(5);
    expect(dot.bounds().height).toBe(5);
    expect(dot.computedStyles(["background-color", "border-radius"])).toEqual({
        "background-color": "rgb(139, 124, 247)",
        "border-radius": "999px",
    });
    const dotDy = await inkDy(view, ".ind-think", '[data-happy2-ui="agent-activity-dot"]');
    expect(Math.abs(dotDy)).toBeLessThanOrEqual(DOT_TOLERANCE);

    // Phase word: 12/500 secondary text.
    const phase = view.$('.ind-think [data-happy2-ui="agent-activity-phase"]');
    expect(phase.element.textContent).toBe("thinking…");
    expect(phase.computedStyle("color")).toBe("rgb(165, 160, 176)");
    expect(view.$('.ind-type [data-happy2-ui="agent-activity-phase"]').element.textContent).toBe(
        "typing…",
    );

    // Meta: mono lining/tabular figures, muted, pushed to the trailing edge.
    const meta = view.$('.ind-think [data-happy2-ui="agent-activity-meta"]');
    expect(
        meta.computedStyles(["color", "font-family", "font-size", "font-variant-numeric"]),
    ).toEqual({
        color: "rgb(117, 112, 133)",
        "font-family": monoFamily(),
        "font-size": "11px",
        "font-variant-numeric": "lining-nums tabular-nums",
    });
    // margin-inline-start:auto keeps the meta flush to the trailing edge
    // (10px right padding + the 1px border).
    expect(Math.abs(meta.offsets().right - 11)).toBeLessThanOrEqual(0.5);

    // Token grouping and m:ss / h:mm:ss formatting.
    expect(view.$('.ind-think [data-happy2-ui="agent-activity-tokens"]').element.textContent).toBe(
        "128 tokens",
    );
    expect(view.$('.ind-think [data-happy2-ui="agent-activity-elapsed"]').element.textContent).toBe(
        "0:07",
    );
    expect(view.$('.ind-type [data-happy2-ui="agent-activity-tokens"]').element.textContent).toBe(
        "1,284 tokens",
    );
    expect(view.$('.ind-type [data-happy2-ui="agent-activity-elapsed"]').element.textContent).toBe(
        "1:02:03",
    );

    // Token and elapsed labels share one baseline (same mono line box).
    const tokens = view.$('.ind-type [data-happy2-ui="agent-activity-tokens"]');
    const elapsed = view.$('.ind-type [data-happy2-ui="agent-activity-elapsed"]');
    expect(
        Math.abs(tokens.textMetrics().verticalOffset - elapsed.textMetrics().verticalOffset),
    ).toBeLessThanOrEqual(0.001);

    await view.screenshot("AgentActivityIndicator.test");
});

it("keeps name, phase, and meta ink vertically centered in both phases", async () => {
    const cases = [
        { cls: "c-think", name: "Relay", phase: "thinking" as const, tokens: 48_300, secs: 125 },
        { cls: "c-type", name: "Judgey", phase: "typing" as const, tokens: 42, secs: 3 },
    ];
    const view = createRenderer().render(
        () => (
            <div
                style={{
                    background: "#17161c",
                    display: "flex",
                    "flex-direction": "column",
                    gap: "12px",
                    padding: "16px",
                    "align-items": "flex-start",
                }}
            >
                {cases.map((entry) => (
                    <AgentActivityIndicator
                        class={entry.cls}
                        elapsedSeconds={entry.secs}
                        initials="RE"
                        name={entry.name}
                        phase={entry.phase}
                        tokenCount={entry.tokens}
                        tone="ocean"
                    />
                ))}
            </div>
        ),
        { width: 360, height: 120 },
    );
    await view.ready();

    for (const entry of cases) {
        const p = `.${entry.cls}`;
        // Descender-free lining figures: tight alpha centroid on the lane.
        for (const part of ["agent-activity-tokens", "agent-activity-elapsed"]) {
            const dy = await inkDy(view, p, `[data-happy2-ui="${part}"]`);
            expect(Math.abs(dy), `${entry.cls}/${part} centroid ${dy}`).toBeLessThanOrEqual(
                META_CENTROID_TOLERANCE,
            );
        }
        // Arbitrary UI words: assert the ink bounding-box center and a shared
        // baseline, not the descender-biased centroid.
        const name = await inkMetrics(view, p, '[data-happy2-ui="agent-activity-name"]');
        const phase = await inkMetrics(view, p, '[data-happy2-ui="agent-activity-phase"]');
        expect(
            Math.abs(name.boundsDy),
            `${entry.cls}/name bounds ${name.boundsDy}`,
        ).toBeLessThanOrEqual(WORD_BOUNDS_TOLERANCE);
        expect(
            Math.abs(phase.boundsDy),
            `${entry.cls}/phase bounds ${phase.boundsDy}`,
        ).toBeLessThanOrEqual(WORD_BOUNDS_TOLERANCE);
        const nameBaseline = baselineOf(view, p, '[data-happy2-ui="agent-activity-name"]');
        const phaseBaseline = baselineOf(view, p, '[data-happy2-ui="agent-activity-phase"]');
        expect(
            Math.abs(nameBaseline - phaseBaseline),
            `${entry.cls} name/phase shared baseline`,
        ).toBeLessThanOrEqual(BASELINE_TOLERANCE);
    }
}, 120_000);
