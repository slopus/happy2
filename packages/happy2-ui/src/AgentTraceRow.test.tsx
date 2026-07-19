import { expect, it } from "vitest";
import { server } from "vitest/browser";
import "./theme.css";
import "./styles/icon.css";
import "./styles/agent-trace-row.css";
import { AgentTraceRow } from "./AgentTraceRow";
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

/* Alpha-weighted dot ink drift from the 28px row lane center. */
async function dotDrift(view: View, rowSelector: string) {
    const row = view.$(rowSelector);
    const dot = view.$(`${rowSelector} [data-happy2-ui="agent-trace-row-dot"]`);
    const vis = await dot.visibleMetrics();
    expect(vis.pixelCount, `${rowSelector} dot paints no pixels`).toBeGreaterThan(0);
    return dot.bounds().y - row.bounds().y + vis.center.y - row.bounds().height / 2;
}

it("holds AgentTraceRow geometry, states, icon mapping, and click behavior", async () => {
    let opened = 0;
    let openedComplete = 0;
    const view = createRenderer();
    view.render(
        () => (
            <div
                style={{
                    background: "#17161c",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                    padding: "16px",
                }}
            >
                <AgentTraceRow
                    data-testid="tr-running"
                    detail="evaluating layout constraints for the trace panel"
                    entryCount={12}
                    kind="reasoning"
                    onOpen={() => (opened += 1)}
                    status="running"
                    title="Thinking"
                />
                <AgentTraceRow
                    data-testid="tr-tool"
                    detail="pnpm --dir packages/happy2-ui typecheck"
                    entryCount={4}
                    kind="tool"
                    status="running"
                    title="Bash"
                />
                <AgentTraceRow
                    data-testid="tr-subagent"
                    entryCount={7}
                    kind="subagent"
                    status="running"
                    title="Explore server routes"
                />
                <AgentTraceRow
                    data-testid="tr-complete"
                    entryCount={12}
                    onOpen={() => (openedComplete += 1)}
                    status="complete"
                />
                <AgentTraceRow
                    data-testid="tr-failed"
                    entryCount={3}
                    label="Failed turn activity"
                    open
                    status="failed"
                />
            </div>
        ),
        { width: 420, height: 240 },
    );
    view.render(
        () => (
            <div
                style={{
                    background: "#17161c",
                    display: "flex",
                    flexDirection: "column",
                    padding: "16px",
                }}
            >
                <AgentTraceRow
                    data-testid="tr-narrow"
                    detail="vitest run src/AgentTracePanel.test.tsx --browser.name=firefox"
                    entryCount={23}
                    kind="terminal"
                    status="running"
                    title="Terminal"
                />
            </div>
        ),
        { width: 240, height: 60 },
    );
    await view.ready();

    /* ---- Root: full-width 28px button row -------------------------------- */

    const row = view.$('[data-testid="tr-running"]');
    expect(row.element.tagName).toBe("BUTTON");
    expect(row.element.getAttribute("type")).toBe("button");
    expect(row.element.getAttribute("data-status")).toBe("running");
    expect(row.element.getAttribute("aria-label")).toBe("Agent activity");
    expect(row.element.getAttribute("aria-expanded")).toBe("false");
    expect(row.height()).toBe(28);
    /* Fills the 420px host minus its 16px padding. */
    expect(row.width()).toBe(388);
    expect(
        row.computedStyles([
            "align-items",
            "background-color",
            "border-radius",
            "border-top-color",
            "border-top-width",
            "box-sizing",
            "cursor",
            "display",
            "font-family",
            "gap",
            "padding-left",
            "padding-right",
        ]),
    ).toEqual({
        "align-items": "center",
        "background-color": "rgba(0, 0, 0, 0)",
        "border-radius": "6px",
        "border-top-color": "rgba(255, 255, 255, 0.07)",
        "border-top-width": "1px",
        "box-sizing": "border-box",
        cursor: "pointer",
        display: "flex",
        "font-family": uiFamily(),
        gap: "8px",
        "padding-left": "8px",
        "padding-right": "8px",
    });

    /* ---- Status dot: 5px static circle, colored per status --------------- */

    const dotOf = (testid: string) =>
        view.$(`[data-testid="${testid}"] [data-happy2-ui="agent-trace-row-dot"]`);
    expect(dotOf("tr-running").bounds()).toMatchObject({ width: 5, height: 5 });
    expect(dotOf("tr-running").computedStyles(["background-color", "border-radius"])).toEqual({
        "background-color": "rgb(139, 124, 247)",
        "border-radius": "999px",
    });
    expect(dotOf("tr-complete").computedStyle("background-color")).toBe("rgb(52, 211, 153)");
    expect(dotOf("tr-failed").computedStyle("background-color")).toBe("rgb(248, 113, 113)");
    const drift = await dotDrift(view, '[data-testid="tr-running"]');
    expect(Math.abs(drift), `dot lane drift ${drift}`).toBeLessThanOrEqual(0.5);

    /* ---- Kind icons map onto existing glyphs ----------------------------- */

    const iconName = (testid: string) =>
        view
            .$(`[data-testid="${testid}"] [data-happy2-ui="icon"]`)
            .element.getAttribute("data-name");
    expect(iconName("tr-running")).toBe("spark");
    expect(iconName("tr-tool")).toBe("terminal");
    expect(iconName("tr-subagent")).toBe("branch");
    expect(iconName("tr-narrow")).toBe("terminal");
    /* Settled rows carry no kind glyph. */
    expect(
        view.container.querySelector('[data-testid="tr-complete"] [data-happy2-ui="icon"]'),
    ).toBeNull();

    /* ---- Running content: title, mono detail, mono count ------------------ */

    const title = view.$('[data-testid="tr-running"] [data-happy2-ui="agent-trace-row-title"]');
    expect(title.element.textContent).toBe("Thinking");
    expect(title.computedStyles(["color", "font-family", "font-size", "font-weight"])).toEqual({
        color: "rgb(237, 234, 242)",
        "font-family": uiFamily(),
        "font-size": "12px",
        "font-weight": "500",
    });
    const detail = view.$('[data-testid="tr-running"] [data-happy2-ui="agent-trace-row-detail"]');
    expect(detail.element.textContent).toBe("evaluating layout constraints for the trace panel");
    expect(
        detail.computedStyles([
            "color",
            "font-family",
            "font-size",
            "overflow-x",
            "text-overflow",
            "white-space",
        ]),
    ).toEqual({
        color: "rgb(117, 112, 133)",
        "font-family": monoFamily(),
        "font-size": "11px",
        "overflow-x": "hidden",
        "text-overflow": "ellipsis",
        "white-space": "nowrap",
    });
    /* Running rows carry no counter: the churning number was pure noise while
     * the turn streams; the step count appears once the row settles. */
    expect(
        view.container.querySelector(
            '[data-testid="tr-running"] [data-happy2-ui="agent-trace-row-count"]',
        ),
    ).toBeNull();

    /* ---- Declared 8px gaps between adjacent children ---------------------- */

    const dot = dotOf("tr-running");
    const icon = view.$('[data-testid="tr-running"] [data-happy2-ui="agent-trace-row-icon"]');
    expect(icon.bounds().x - (dot.bounds().x + dot.bounds().width)).toBeCloseTo(8, 1);
    expect(title.bounds().x - (icon.bounds().x + icon.bounds().width)).toBeCloseTo(8, 1);
    expect(detail.bounds().x - (title.bounds().x + title.bounds().width)).toBeCloseTo(8, 1);
    /* A running row without a detail renders only dot, glyph, and title. */
    expect(
        view.container.querySelector(
            '[data-testid="tr-subagent"] [data-happy2-ui="agent-trace-row-detail"]',
        ),
    ).toBeNull();
    expect(
        view.container.querySelector(
            '[data-testid="tr-subagent"] [data-happy2-ui="agent-trace-row-count"]',
        ),
    ).toBeNull();

    /* ---- Settled rows: View trace link with step count -------------------- */

    const completeTitle = view.$(
        '[data-testid="tr-complete"] [data-happy2-ui="agent-trace-row-title"]',
    );
    expect(completeTitle.element.textContent).toBe("View trace");
    expect(completeTitle.computedStyle("color")).toBe("rgb(168, 155, 255)");
    expect(
        view.$('[data-testid="tr-complete"] [data-happy2-ui="agent-trace-row-count"]').element
            .textContent,
    ).toBe("12 steps");
    expect(
        view.$('[data-testid="tr-failed"] [data-happy2-ui="agent-trace-row-count"]').element
            .textContent,
    ).toBe("3 steps");

    /* ---- Accessibility state and custom label ----------------------------- */

    const failed = view.$('[data-testid="tr-failed"]');
    expect(failed.element.getAttribute("aria-expanded")).toBe("true");
    expect(failed.element.getAttribute("aria-label")).toBe("Failed turn activity");
    expect(failed.element.getAttribute("data-status")).toBe("failed");
    expect(view.$('[data-testid="tr-complete"]').element.getAttribute("data-status")).toBe(
        "complete",
    );

    /* ---- Click fires onOpen ------------------------------------------------ */

    (row.element as HTMLButtonElement).click();
    expect(opened).toBe(1);
    (view.$('[data-testid="tr-complete"]').element as HTMLButtonElement).click();
    (view.$('[data-testid="tr-complete"]').element as HTMLButtonElement).click();
    expect(openedComplete).toBe(2);

    /* ---- Narrow: the mono detail truncates through the flexible middle ---- */

    const narrowDetail = view.$(
        '[data-testid="tr-narrow"] [data-happy2-ui="agent-trace-row-detail"]',
    );
    expect(narrowDetail.element.scrollWidth, "narrow detail truncates").toBeGreaterThan(
        narrowDetail.element.clientWidth,
    );
    expect(
        view.container.querySelector(
            '[data-testid="tr-narrow"] [data-happy2-ui="agent-trace-row-count"]',
        ),
    ).toBeNull();

    await view.screenshot("AgentTraceRow.test");
}, 120_000);
