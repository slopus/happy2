import { expect, it } from "vitest";
import { server } from "vitest/browser";
import { type ReactNode } from "react";
import "./theme.css";
import "./styles/icon.css";
import "./styles/button.css";
import "./styles/badge.css";
import "./styles/toolbar.css";
import "./styles/agent-trace-panel.css";
import { AgentTracePanel, type AgentTracePanelEntry } from "./AgentTracePanel";
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

/* Fixed UTC instants: the panel formats HH:MM:SS with plain UTC epoch math. */
const T0 = Date.UTC(2026, 5, 12, 14, 3, 7);

const entries: readonly AgentTracePanelEntry[] = [
    { id: "e-1", kind: "status", title: "Turn started", status: "complete", occurredAt: T0 },
    {
        id: "e-2",
        kind: "reasoning",
        title: "Thinking",
        detail: "planning the trace panel layout",
        status: "complete",
        occurredAt: Date.UTC(2026, 5, 12, 14, 3, 11),
    },
    {
        id: "e-3",
        kind: "subagent",
        title: "Explore server routes",
        detail: "searching for the turn-trace persistence actions",
        status: "complete",
        occurredAt: Date.UTC(2026, 5, 12, 14, 3, 18),
        completedAt: Date.UTC(2026, 5, 12, 14, 4, 21),
    },
    {
        id: "e-4",
        kind: "tool",
        title: "Read",
        detail: "packages/happy2-server/sources/modules/schema.ts",
        status: "complete",
        occurredAt: Date.UTC(2026, 5, 12, 14, 3, 28),
    },
    {
        id: "e-5",
        kind: "terminal",
        title: "Terminal",
        detail: "pnpm --dir packages/happy2-server architecture:check",
        status: "failed",
        occurredAt: Date.UTC(2026, 5, 12, 14, 3, 55),
    },
    {
        id: "e-6",
        kind: "tool",
        title: "Edit",
        detail: "sources/modules/traces/traceAppendEntry.ts",
        status: "complete",
        occurredAt: Date.UTC(2026, 5, 12, 14, 4, 10),
    },
    {
        id: "e-7",
        kind: "response",
        title: "Drafting response",
        status: "running",
        occurredAt: Date.UTC(2026, 5, 12, 14, 4, 35),
    },
    {
        id: "e-8",
        kind: "status",
        title: "Waiting on background terminal",
        status: "running",
        occurredAt: Date.UTC(2026, 5, 12, 9, 5, 0),
    },
];

function host(children: ReactNode, testid: string, height: number) {
    return (
        <div
            data-testid={testid}
            style={{
                background: "#ffffff",
                display: "flex",
                flexDirection: "column",
                height: `${height}px`,
                overflow: "hidden",
                width: "288px",
            }}
        >
            {children}
        </div>
    );
}

/* Alpha-weighted dot ink drift from its 16px first-line lane center. */
async function dotDrift(view: View, entrySelector: string) {
    const lane = view.$(`${entrySelector} .happy2-agent-trace-panel__entry-dot-lane`);
    const dot = view.$(`${entrySelector} [data-happy2-ui="agent-trace-panel-entry-dot"]`);
    const vis = await dot.visibleMetrics();
    expect(vis.pixelCount, `${entrySelector} dot paints no pixels`).toBeGreaterThan(0);
    return dot.bounds().y - lane.bounds().y + vis.center.y - lane.bounds().height / 2;
}

it("holds AgentTracePanel header, scrollport contract, entry rows, and timestamps", async () => {
    let closed = 0;
    const view = createRenderer();
    view.render(
        () =>
            host(
                <AgentTracePanel
                    data-testid="tp-running"
                    entries={entries}
                    entryCount={8}
                    onClose={() => (closed += 1)}
                    status="running"
                    title="Codey"
                />,
                "tp-running-host",
                520,
            ),
        { width: 288, height: 520 },
    );
    await view.ready();

    /* ---- Root: fills the 288×520 panel region as a flex column ----------- */

    const panel = view.$('[data-testid="tp-running"]');
    expect(panel.element.tagName).toBe("SECTION");
    expect(panel.element.getAttribute("data-status")).toBe("running");
    expect(panel.bounds()).toMatchObject({ width: 288, height: 520 });
    expect(
        panel.computedStyles(["color", "display", "flex-direction", "font-family", "min-height"]),
    ).toEqual({
        color: "rgb(0, 0, 0)",
        display: "flex",
        "flex-direction": "column",
        "font-family": uiFamily(),
        "min-height": "0px",
    });

    /* ---- Header: 56px surface header, title, step count, badge, close ---- */

    const header = view.$('[data-testid="tp-running"] [data-happy2-ui="toolbar"]');
    expect(header.height()).toBe(56);
    expect(header.width()).toBe(288);
    expect(
        view.$('[data-testid="tp-running"] [data-happy2-ui="toolbar-title"]').element.textContent,
    ).toBe("Codey");
    expect(
        view.$('[data-testid="tp-running"] [data-happy2-ui="toolbar-subtitle"]').element
            .textContent,
    ).toBe("8 steps");
    const badge = view.$('[data-testid="tp-running"] [data-happy2-ui="badge"]');
    expect(badge.element.getAttribute("data-variant")).toBe("accent");
    expect(
        view.$('[data-testid="tp-running"] [data-happy2-ui="badge-label"]').element.textContent,
    ).toBe("RUNNING");
    const close = view.$('[data-testid="tp-running"] [data-happy2-ui="button"]');
    expect(close.element.getAttribute("aria-label")).toBe("Close trace");
    (close.element as HTMLButtonElement).click();
    expect(closed).toBe(1);

    /* ---- Scrollport: fills the region below the header, zero spacing ----- */

    const body = view.$('[data-testid="tp-running"] [data-happy2-ui="agent-trace-panel-body"]');
    expect(body.bounds().width).toBe(288);
    expect(body.bounds().height).toBe(464);
    expect(body.bounds().y - panel.bounds().y).toBe(56);
    expect(
        body.computedStyles([
            "margin-top",
            "margin-right",
            "margin-bottom",
            "margin-left",
            "padding-top",
            "padding-right",
            "padding-bottom",
            "padding-left",
            "overflow-y",
        ]),
    ).toEqual({
        "margin-top": "0px",
        "margin-right": "0px",
        "margin-bottom": "0px",
        "margin-left": "0px",
        "padding-top": "0px",
        "padding-right": "0px",
        "padding-bottom": "0px",
        "padding-left": "0px",
        "overflow-y": "auto",
    });

    /* Spacing lives on the inner entries wrapper. */
    const wrapper = view.$(
        '[data-testid="tp-running"] [data-happy2-ui="agent-trace-panel-entries"]',
    );
    expect(
        wrapper.computedStyles([
            "display",
            "flex-direction",
            "gap",
            "padding-top",
            "padding-right",
            "padding-bottom",
            "padding-left",
        ]),
    ).toEqual({
        display: "flex",
        "flex-direction": "column",
        gap: "12px",
        "padding-top": "12px",
        "padding-right": "12px",
        "padding-bottom": "12px",
        "padding-left": "12px",
    });

    /* ---- Entry rows: keyed order, kind/status data, 12px row gap --------- */

    const rows = Array.from(
        panel.element.querySelectorAll('[data-happy2-ui="agent-trace-panel-entry"]'),
    ) as HTMLElement[];
    expect(rows.length).toBe(8);
    expect(rows.map((row) => row.getAttribute("data-kind"))).toEqual([
        "status",
        "reasoning",
        "subagent",
        "tool",
        "terminal",
        "tool",
        "response",
        "status",
    ]);
    expect(rows.map((row) => row.getAttribute("data-status"))).toEqual([
        "complete",
        "complete",
        "complete",
        "complete",
        "failed",
        "complete",
        "running",
        "running",
    ]);
    for (let index = 1; index < rows.length; index += 1) {
        const above = rows[index - 1]!.getBoundingClientRect();
        const below = rows[index]!.getBoundingClientRect();
        expect(below.top - above.bottom, `entry gap ${index}`).toBeCloseTo(12, 1);
    }

    /* Kind glyphs map onto existing icons. */
    const iconOf = (row: HTMLElement) =>
        row.querySelector('[data-happy2-ui="icon"]')?.getAttribute("data-name");
    expect(iconOf(rows[0]!)).toBe("check-circle");
    expect(iconOf(rows[1]!)).toBe("spark");
    expect(iconOf(rows[2]!)).toBe("branch");
    expect(iconOf(rows[3]!)).toBe("terminal");
    expect(iconOf(rows[4]!)).toBe("terminal");
    expect(iconOf(rows[6]!)).toBe("check-circle");

    /* Per-entry status dots. */
    const rowDot = (index: number) =>
        view.$(
            `[data-testid="tp-running"] [data-happy2-ui="agent-trace-panel-entries"] > :nth-child(${index + 1}) [data-happy2-ui="agent-trace-panel-entry-dot"]`,
        );
    expect(rowDot(0).computedStyle("background-color")).toBe("rgb(52, 199, 89)");
    expect(rowDot(4).computedStyle("background-color")).toBe("rgb(255, 59, 48)");
    expect(rowDot(6).computedStyle("background-color")).toBe("rgb(43, 172, 204)");
    expect(rowDot(0).bounds()).toMatchObject({ width: 5, height: 5 });
    const drift = await dotDrift(
        view,
        '[data-testid="tp-running"] [data-happy2-ui="agent-trace-panel-entries"] > :nth-child(1)',
    );
    expect(Math.abs(drift), `entry dot lane drift ${drift}`).toBeLessThanOrEqual(0.5);

    /* ---- Entry typography: UI title, mono detail, mono UTC time ---------- */

    const second =
        '[data-testid="tp-running"] [data-happy2-ui="agent-trace-panel-entries"] > :nth-child(2)';
    const title = view.$(`${second} [data-happy2-ui="agent-trace-panel-entry-title"]`);
    expect(title.element.textContent).toBe("Thinking");
    expect(title.computedStyles(["color", "font-family", "font-size", "font-weight"])).toEqual({
        color: "rgb(0, 0, 0)",
        "font-family": uiFamily(),
        "font-size": "12px",
        "font-weight": "500",
    });
    const detail = view.$(`${second} [data-happy2-ui="agent-trace-panel-entry-detail"]`);
    expect(detail.element.textContent).toBe("planning the trace panel layout");
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
        color: "rgb(142, 142, 147)",
        "font-family": monoFamily(),
        "font-size": "11px",
        "overflow-x": "hidden",
        "text-overflow": "ellipsis",
        "white-space": "nowrap",
    });
    /* Title→detail vertical rhythm: the 4px column gap. */
    expect(detail.bounds().y - (title.bounds().y + title.bounds().height)).toBeCloseTo(4, 1);

    const time = view.$(`${second} [data-happy2-ui="agent-trace-panel-entry-time"]`);
    expect(time.element.textContent).toBe("14:03:11");
    expect(
        time.computedStyles(["color", "font-family", "font-size", "font-variant-numeric"]),
    ).toEqual({
        color: "rgb(142, 142, 147)",
        "font-family": monoFamily(),
        "font-size": "11px",
        "font-variant-numeric": "lining-nums tabular-nums",
    });
    /* Deterministic UTC formatting: exact fixed strings, zero-padded. */
    const timeText = (index: number) =>
        view.$(
            `[data-testid="tp-running"] [data-happy2-ui="agent-trace-panel-entries"] > :nth-child(${index + 1}) [data-happy2-ui="agent-trace-panel-entry-time"]`,
        ).element.textContent;
    expect(timeText(0)).toBe("14:03:07");
    expect(timeText(7)).toBe("09:05:00");

    /* First-line lane sharing: dot lane, icon lane, title, and time all sit
     * on the 16px first line of the row. */
    const firstRow = view.$(
        '[data-testid="tp-running"] [data-happy2-ui="agent-trace-panel-entries"] > :nth-child(2)',
    );
    const lane = view.$(`${second} .happy2-agent-trace-panel__entry-dot-lane`);
    const icon = view.$(`${second} [data-happy2-ui="agent-trace-panel-entry-icon"]`);
    expect(lane.bounds().y).toBe(firstRow.bounds().y);
    expect(lane.bounds().height).toBe(16);
    expect(icon.bounds().height).toBe(16);
    expect(time.bounds().y).toBe(firstRow.bounds().y);
    /* Declared 8px gaps between the row's adjacent children. */
    expect(icon.bounds().x - (lane.bounds().x + lane.bounds().width)).toBeCloseTo(8, 1);
    const main = view.$(`${second} .happy2-agent-trace-panel__entry-main`);
    expect(main.bounds().x - (icon.bounds().x + icon.bounds().width)).toBeCloseTo(8, 1);
    expect(time.bounds().x - (main.bounds().x + main.bounds().width)).toBeCloseTo(8, 1);
    /* An entry without a detail renders no detail node and keeps one 16px line. */
    const noDetail =
        '[data-testid="tp-running"] [data-happy2-ui="agent-trace-panel-entries"] > :nth-child(1)';
    expect(
        view.container.querySelector(
            `${noDetail} [data-happy2-ui="agent-trace-panel-entry-detail"]`,
        ),
    ).toBeNull();
    expect(view.$(`${noDetail} .happy2-agent-trace-panel__entry-main`).bounds().height).toBe(16);

    /* First entry is fully visible and painted at the top of the scrollport. */
    const firstEntry = view.$(
        '[data-testid="tp-running"] [data-happy2-ui="agent-trace-panel-entries"] > :nth-child(1)',
    );
    expect(firstEntry.bounds().y - body.bounds().y).toBeCloseTo(12, 1);
    expect(
        (
            await view
                .$(`${noDetail} [data-happy2-ui="agent-trace-panel-entry-title"]`)
                .visibleMetrics()
        ).pixelCount,
    ).toBeGreaterThan(0);

    await view.screenshot("AgentTracePanel.test");
}, 120_000);

it("scrolls overflowing traces edge to edge and centers loading, error, and empty states", async () => {
    const many: AgentTracePanelEntry[] = Array.from({ length: 20 }, (_, index) => ({
        id: `m-${index + 1}`,
        kind: index % 2 === 0 ? "tool" : "reasoning",
        title: `Step ${index + 1}`,
        detail: `sources/modules/traces/step-${index + 1}.ts`,
        status: "complete",
        occurredAt: T0 + index * 9_000,
    }));
    const view = createRenderer();
    view.render(
        () =>
            host(
                <AgentTracePanel
                    data-testid="tp-scroll"
                    entries={many}
                    entryCount={20}
                    status="running"
                    title="Codey"
                />,
                "tp-scroll-host",
                320,
            ),
        { width: 288, height: 320 },
    );
    view.render(
        () =>
            host(
                <AgentTracePanel
                    data-testid="tp-loading"
                    entries={[]}
                    entryCount={0}
                    loading
                    status="pending"
                    title="Codey"
                />,
                "tp-loading-host",
                240,
            ),
        { width: 288, height: 240 },
    );
    view.render(
        () =>
            host(
                <AgentTracePanel
                    closeLabel="Dismiss trace"
                    data-testid="tp-error"
                    entries={[]}
                    entryCount={0}
                    error="Could not load activity for this turn."
                    onClose={() => {}}
                    status="failed"
                    title="Codey"
                />,
                "tp-error-host",
                240,
            ),
        { width: 288, height: 240 },
    );
    view.render(
        () =>
            host(
                <AgentTracePanel
                    data-testid="tp-empty"
                    entries={[]}
                    entryCount={0}
                    status="complete"
                    title="Codey"
                />,
                "tp-empty-host",
                240,
            ),
        { width: 288, height: 240 },
    );
    await view.ready();

    /* ---- Overflow: the scrollport owns scrolling for the full region ------ */

    const body = view.$('[data-testid="tp-scroll"] [data-happy2-ui="agent-trace-panel-body"]');
    expect(body.bounds()).toMatchObject({ width: 288, height: 264 });
    expect(body.element.scrollHeight).toBeGreaterThan(body.element.clientHeight);
    /* Single-step badge grammar while we are here. */
    expect(
        view.$('[data-testid="tp-scroll"] [data-happy2-ui="toolbar-subtitle"]').element.textContent,
    ).toBe("20 steps");

    /* First entry visible and painted at the top… */
    const first = view.$(
        '[data-testid="tp-scroll"] [data-happy2-ui="agent-trace-panel-entries"] > :nth-child(1)',
    );
    expect(first.bounds().y - body.bounds().y).toBeCloseTo(12, 1);
    expect(
        (
            await view
                .$(
                    '[data-testid="tp-scroll"] [data-happy2-ui="agent-trace-panel-entries"] > :nth-child(1) [data-happy2-ui="agent-trace-panel-entry-title"]',
                )
                .visibleMetrics()
        ).pixelCount,
    ).toBeGreaterThan(0);

    /* …and after scrolling to the end, the last entry sits fully inside the
     * scrollport with the wrapper's 12px bottom inset. */
    body.element.scrollTop = body.element.scrollHeight;
    const last = view.$(
        '[data-testid="tp-scroll"] [data-happy2-ui="agent-trace-panel-entries"] > :nth-child(20)',
    );
    const lastBottom = last.bounds().y + last.bounds().height;
    const bodyBottom = body.bounds().y + body.bounds().height;
    expect(bodyBottom - lastBottom).toBeCloseTo(12, 1);
    expect(last.bounds().y).toBeGreaterThanOrEqual(body.bounds().y);
    expect(
        (
            await view
                .$(
                    '[data-testid="tp-scroll"] [data-happy2-ui="agent-trace-panel-entries"] > :nth-child(20) [data-happy2-ui="agent-trace-panel-entry-title"]',
                )
                .visibleMetrics()
        ).pixelCount,
    ).toBeGreaterThan(0);

    /* ---- Centered states: loading (muted), error (danger), empty (muted) -- */

    const stateOf = (testid: string) =>
        view.$(`[data-testid="${testid}"] [data-happy2-ui="agent-trace-panel-state"]`);
    const loading = stateOf("tp-loading");
    expect(loading.element.getAttribute("data-state")).toBe("loading");
    expect(loading.element.textContent).toBe("Loading activity…");
    expect(loading.computedStyles(["align-items", "color", "display", "justify-content"])).toEqual({
        "align-items": "center",
        color: "rgb(142, 142, 147)",
        display: "flex",
        "justify-content": "center",
    });
    /* The state fills the whole scrollport region below the header. */
    const loadingBody = view.$(
        '[data-testid="tp-loading"] [data-happy2-ui="agent-trace-panel-body"]',
    );
    expect(loading.bounds()).toMatchObject({
        width: loadingBody.bounds().width,
        height: loadingBody.bounds().height,
    });

    const error = stateOf("tp-error");
    expect(error.element.getAttribute("data-state")).toBe("error");
    expect(error.element.textContent).toBe("Could not load activity for this turn.");
    expect(error.computedStyle("color")).toBe("rgb(255, 59, 48)");

    const empty = stateOf("tp-empty");
    expect(empty.element.getAttribute("data-state")).toBe("empty");
    expect(empty.element.textContent).toBe("No activity yet");
    expect(empty.computedStyle("color")).toBe("rgb(142, 142, 147)");

    /* ---- Header badges track the turn status ------------------------------ */

    const badgeOf = (testid: string) => {
        const badge = view.$(`[data-testid="${testid}"] [data-happy2-ui="badge"]`);
        return {
            label: view.$(`[data-testid="${testid}"] [data-happy2-ui="badge-label"]`).element
                .textContent,
            variant: badge.element.getAttribute("data-variant"),
        };
    };
    expect(badgeOf("tp-loading")).toEqual({ label: "PENDING", variant: "neutral" });
    expect(badgeOf("tp-error")).toEqual({ label: "FAILED", variant: "danger" });
    expect(badgeOf("tp-empty")).toEqual({ label: "COMPLETE", variant: "success" });
    expect(badgeOf("tp-scroll")).toEqual({ label: "RUNNING", variant: "accent" });
    expect(
        view
            .$('[data-testid="tp-error"] [data-happy2-ui="button"]')
            .element.getAttribute("aria-label"),
    ).toBe("Dismiss trace");
    /* No close button when the host passes no onClose. */
    expect(
        view.container.querySelector('[data-testid="tp-empty"] [data-happy2-ui="button"]'),
    ).toBeNull();

    /* Zero-count subtitle uses the singular-aware grammar. */
    expect(
        view.$('[data-testid="tp-empty"] [data-happy2-ui="toolbar-subtitle"]').element.textContent,
    ).toBe("0 steps");

    await view.screenshot("AgentTracePanel.states.test");
}, 120_000);
