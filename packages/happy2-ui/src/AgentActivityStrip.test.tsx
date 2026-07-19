import { expect, it } from "vitest";
import { server } from "vitest/browser";
import "./theme.css";
import "./styles/icon.css";
import "./styles/agent-activity-strip.css";
import {
    AgentActivityStrip,
    type AgentActivityStripSubagent,
    type AgentActivityStripTerminal,
} from "./AgentActivityStrip";
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

/* Deterministic caller clock: every elapsed value derives from this instant. */
const NOW = Date.UTC(2026, 5, 12, 14, 30, 0);

const mixedSubagents: readonly AgentActivityStripSubagent[] = [
    {
        id: "sa-explore",
        description: "Explore server routes",
        status: "running",
        latestText: 'grep -rn "sessionCreate" sources/modules',
        startedAt: NOW - 45_000,
        totalTokens: 12_345,
    },
    {
        id: "sa-gym",
        description: "Write gym coverage",
        status: "completed",
        latestText: "Done: 4 files changed",
        startedAt: NOW - 125_000,
        totalTokens: 1_234,
    },
    {
        id: "sa-lint",
        description: "Fix lints",
        status: "error",
        startedAt: NOW + 5_000,
        totalTokens: 999,
    },
    {
        id: "sa-docs",
        description: "Draft release notes",
        status: "queued",
        startedAt: NOW,
        totalTokens: 0,
    },
];

const mixedTerminals: readonly AgentActivityStripTerminal[] = [
    {
        id: "term-test",
        command: "pnpm --dir packages/happy2-server test",
        cwd: "~/work/happy2",
        startedAt: NOW - 30_000,
    },
    {
        id: "term-dev",
        command: "pnpm dev",
        cwd: "~/work/happy2/packages/happy2-ui",
        startedAt: NOW - 600_000,
    },
];

/* Alpha-weighted dot ink drift from its 24px row lane center. */
async function dotDrift(view: View, rowSelector: string, dotSelector: string) {
    const row = view.$(rowSelector);
    const dot = view.$(`${rowSelector} ${dotSelector}`);
    const vis = await dot.visibleMetrics();
    expect(vis.pixelCount, `${rowSelector} dot paints no pixels`).toBeGreaterThan(0);
    const topInRow = dot.bounds().y - row.bounds().y;
    return topInRow + vis.center.y - row.bounds().height / 2;
}

it("holds AgentActivityStrip card geometry, row layout, colors, and meta formatting", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <div
                style={{
                    background: "#f5f5f5",
                    display: "flex",
                    flexDirection: "column",
                    padding: "16px",
                }}
            >
                <AgentActivityStrip
                    data-testid="strip-mixed"
                    now={NOW}
                    subagents={mixedSubagents}
                    terminals={mixedTerminals}
                />
            </div>
        ),
        { width: 560, height: 240 },
    );
    view.render(
        () => (
            <div
                style={{
                    background: "#f5f5f5",
                    display: "flex",
                    flexDirection: "column",
                    padding: "16px",
                }}
            >
                <AgentActivityStrip
                    data-testid="strip-terminal-only"
                    now={NOW}
                    subagents={[]}
                    terminals={[mixedTerminals[0]!]}
                />
            </div>
        ),
        { width: 420, height: 80 },
    );
    view.render(
        () => (
            <div
                data-testid="strip-empty-host"
                style={{ display: "flex", flexDirection: "column" }}
            >
                <AgentActivityStrip now={NOW} subagents={[]} terminals={[]} />
            </div>
        ),
        { width: 200, height: 40 },
    );
    await view.ready();

    /* ---- Card: hairline border on the code surface, flex column --------- */

    const strip = view.$('[data-testid="strip-mixed"]');
    expect(
        strip.computedStyles([
            "background-color",
            "border-radius",
            "border-top-color",
            "border-top-width",
            "box-sizing",
            "display",
            "flex-direction",
            "font-family",
            "max-height",
            "padding-top",
        ]),
    ).toEqual({
        "background-color": "rgb(246, 248, 250)",
        "border-radius": "6px",
        "border-top-color": "rgb(234, 234, 234)",
        "border-top-width": "1px",
        "box-sizing": "border-box",
        display: "flex",
        "flex-direction": "column",
        "font-family": monoFamily(),
        "max-height": "144px",
        "padding-top": "0px",
    });
    /* The internal scrollport is full-bleed; spacing lives on the rows wrapper. */
    const scrollport = view.$(
        '[data-testid="strip-mixed"] [data-happy2-ui="agent-activity-strip-scrollport"]',
    );
    expect(
        scrollport.computedStyles([
            "margin-bottom",
            "margin-left",
            "margin-right",
            "margin-top",
            "overflow-y",
            "padding-bottom",
            "padding-left",
            "padding-right",
            "padding-top",
        ]),
    ).toEqual({
        "margin-bottom": "0px",
        "margin-left": "0px",
        "margin-right": "0px",
        "margin-top": "0px",
        "overflow-y": "auto",
        "padding-bottom": "0px",
        "padding-left": "0px",
        "padding-right": "0px",
        "padding-top": "0px",
    });
    const rowsWrap = view.$(
        '[data-testid="strip-mixed"] [data-happy2-ui="agent-activity-strip-rows"]',
    );
    expect(
        rowsWrap.computedStyles([
            "display",
            "flex-direction",
            "gap",
            "padding-bottom",
            "padding-left",
            "padding-right",
            "padding-top",
        ]),
    ).toEqual({
        display: "flex",
        "flex-direction": "column",
        gap: "4px",
        "padding-bottom": "4px",
        "padding-left": "8px",
        "padding-right": "8px",
        "padding-top": "4px",
    });

    /* Both collections empty: the component renders nothing at all. */
    expect(view.$('[data-testid="strip-empty-host"]').element.childElementCount).toBe(0);

    /* ---- Rows: one 24px row per entity, keyed order, 4px parent gap ------ */

    const subagentRows = strip.element.querySelectorAll(
        '[data-happy2-ui="agent-activity-strip-subagent"]',
    );
    const terminalRows = strip.element.querySelectorAll(
        '[data-happy2-ui="agent-activity-strip-terminal"]',
    );
    expect(subagentRows.length).toBe(4);
    expect(terminalRows.length).toBe(2);
    expect(Array.from(subagentRows).map((row) => row.getAttribute("data-status"))).toEqual([
        "running",
        "completed",
        "error",
        "queued",
    ]);

    const rows = Array.from(rowsWrap.element.children) as HTMLElement[];
    expect(rows.length).toBe(6);
    for (const row of rows) {
        expect(row.getBoundingClientRect().height).toBe(24);
    }
    /* Adjacent pairs — subagent/subagent, subagent/terminal, and
     * terminal/terminal — all keep the declared 4px column gap. */
    for (let index = 1; index < rows.length; index += 1) {
        const above = rows[index - 1]!.getBoundingClientRect();
        const below = rows[index]!.getBoundingClientRect();
        expect(below.top - above.bottom, `row gap ${index}`).toBeCloseTo(4, 1);
    }

    /* ---- Status dots: 5px, colored by status ---------------------------- */

    const dotColor = (status: string) =>
        view
            .$(
                `[data-testid="strip-mixed"] [data-status="${status}"] [data-happy2-ui="agent-activity-strip-dot"]`,
            )
            .computedStyle("background-color");
    expect(dotColor("running")).toBe("rgb(0, 122, 255)");
    expect(dotColor("completed")).toBe("rgb(52, 199, 89)");
    expect(dotColor("error")).toBe("rgb(255, 59, 48)");
    expect(dotColor("queued")).toBe("rgb(142, 142, 147)");
    const runningDot = view.$(
        '[data-testid="strip-mixed"] [data-status="running"] [data-happy2-ui="agent-activity-strip-dot"]',
    );
    expect(runningDot.bounds().width).toBe(5);
    expect(runningDot.bounds().height).toBe(5);
    expect(runningDot.computedStyle("border-radius")).toBe("999px");
    const drift = await dotDrift(
        view,
        '[data-testid="strip-mixed"] [data-status="running"]',
        '[data-happy2-ui="agent-activity-strip-dot"]',
    );
    expect(Math.abs(drift), `running dot lane drift ${drift}`).toBeLessThanOrEqual(0.5);

    /* ---- Subagent text: UI description, mono muted latest ---------------- */

    const running = '[data-testid="strip-mixed"] [data-status="running"]';
    const description = view.$(`${running} [data-happy2-ui="agent-activity-strip-description"]`);
    expect(description.element.textContent).toBe("Explore server routes");
    expect(
        description.computedStyles([
            "color",
            "font-family",
            "font-size",
            "font-weight",
            "overflow-x",
            "text-overflow",
        ]),
    ).toEqual({
        color: "rgb(0, 0, 0)",
        "font-family": uiFamily(),
        "font-size": "12px",
        "font-weight": "500",
        "overflow-x": "hidden",
        "text-overflow": "ellipsis",
    });
    const latest = view.$(`${running} [data-happy2-ui="agent-activity-strip-latest"]`);
    expect(latest.element.textContent).toBe('grep -rn "sessionCreate" sources/modules');
    expect(latest.computedStyles(["color", "font-family", "text-overflow", "white-space"])).toEqual(
        {
            color: "rgb(142, 142, 147)",
            "font-family": monoFamily(),
            "text-overflow": "ellipsis",
            "white-space": "nowrap",
        },
    );
    /* Row without latestText renders no latest node; the remaining
     * description→meta pair keeps at least the declared 8px gap. */
    const errorRow = '[data-testid="strip-mixed"] [data-status="error"]';
    expect(
        view.container.querySelector(`${errorRow} [data-happy2-ui="agent-activity-strip-latest"]`),
    ).toBeNull();
    const errorDescription = view.$(
        `${errorRow} [data-happy2-ui="agent-activity-strip-description"]`,
    );
    const errorMeta = view.$(`${errorRow} [data-happy2-ui="agent-activity-strip-meta"]`);
    expect(
        errorMeta.bounds().x - (errorDescription.bounds().x + errorDescription.bounds().width),
    ).toBeGreaterThanOrEqual(8);
    /* With a latest text present, the row keeps its declared 8px gaps. */
    expect(
        description.bounds().x - (runningDot.bounds().x + runningDot.bounds().width),
    ).toBeCloseTo(8, 1);
    expect(latest.bounds().x - (description.bounds().x + description.bounds().width)).toBeCloseTo(
        8,
        1,
    );

    /* ---- Meta: right-pinned mono token totals and elapsed ---------------- */

    const meta = view.$(`${running} [data-happy2-ui="agent-activity-strip-meta"]`);
    expect(
        meta.computedStyles(["color", "font-family", "font-size", "font-variant-numeric"]),
    ).toEqual({
        color: "rgb(142, 142, 147)",
        "font-family": monoFamily(),
        "font-size": "11px",
        "font-variant-numeric": "lining-nums tabular-nums",
    });
    /* Pinned to the trailing edge: 8px card padding + the 1px border. */
    const rightInset = (outer: ReturnType<typeof strip.bounds>, inner: typeof outer) =>
        outer.x + outer.width - (inner.x + inner.width);
    expect(Math.abs(rightInset(strip.bounds(), meta.bounds()) - 9)).toBeLessThanOrEqual(0.5);

    const tokensOf = (status: string) =>
        view.$(
            `[data-testid="strip-mixed"] [data-status="${status}"] [data-happy2-ui="agent-activity-strip-tokens"]`,
        ).element.textContent;
    const elapsedOf = (status: string) =>
        view.$(
            `[data-testid="strip-mixed"] [data-status="${status}"] [data-happy2-ui="agent-activity-strip-elapsed"]`,
        ).element.textContent;
    expect(tokensOf("running")).toBe("12k");
    expect(tokensOf("completed")).toBe("1.2k");
    expect(tokensOf("error")).toBe("999");
    expect(tokensOf("queued")).toBe("0");
    expect(elapsedOf("running")).toBe("0:45");
    expect(elapsedOf("completed")).toBe("2:05");
    /* A startedAt in the future clamps to 0:00 rather than going negative. */
    expect(elapsedOf("error")).toBe("0:00");
    expect(elapsedOf("queued")).toBe("0:00");

    /* ---- Terminal rows: glyph, mono command, muted cwd, elapsed ---------- */

    const firstTerminal =
        '[data-testid="strip-mixed"] [data-happy2-ui="agent-activity-strip-rows"] > :nth-child(5)';
    expect(
        view.$(`${firstTerminal} [data-happy2-ui="icon"]`).element.getAttribute("data-name"),
    ).toBe("terminal");
    const command = view.$(`${firstTerminal} [data-happy2-ui="agent-activity-strip-command"]`);
    expect(command.element.textContent).toBe("pnpm --dir packages/happy2-server test");
    expect(command.computedStyles(["color", "font-family", "text-overflow"])).toEqual({
        color: "rgb(0, 0, 0)",
        "font-family": monoFamily(),
        "text-overflow": "ellipsis",
    });
    const cwd = view.$(`${firstTerminal} [data-happy2-ui="agent-activity-strip-cwd"]`);
    expect(cwd.element.textContent).toBe("~/work/happy2");
    /* Plain ellipsis truncation only — no direction:rtl trick. */
    expect(cwd.computedStyles(["color", "direction", "text-overflow", "white-space"])).toEqual({
        color: "rgb(142, 142, 147)",
        direction: "ltr",
        "text-overflow": "ellipsis",
        "white-space": "nowrap",
    });
    expect(
        view.$(`${firstTerminal} [data-happy2-ui="agent-activity-strip-elapsed"]`).element
            .textContent,
    ).toBe("0:30");
    expect(
        view.$(
            '[data-testid="strip-mixed"] [data-happy2-ui="agent-activity-strip-rows"] > :nth-child(6) [data-happy2-ui="agent-activity-strip-elapsed"]',
        ).element.textContent,
    ).toBe("10:00");

    /* ---- Terminal-only strip: single 24px row, meta right-pinned --------- */

    const only = view.$('[data-testid="strip-terminal-only"]');
    expect(
        view.$('[data-testid="strip-terminal-only"] [data-happy2-ui="agent-activity-strip-rows"]')
            .element.childElementCount,
    ).toBe(1);
    const onlyRow = view.$(
        '[data-testid="strip-terminal-only"] [data-happy2-ui="agent-activity-strip-terminal"]',
    );
    expect(onlyRow.bounds().height).toBe(24);
    const onlyMeta = view.$(
        '[data-testid="strip-terminal-only"] [data-happy2-ui="agent-activity-strip-meta"]',
    );
    expect(Math.abs(rightInset(only.bounds(), onlyMeta.bounds()) - 9)).toBeLessThanOrEqual(0.5);

    await view.screenshot("AgentActivityStrip.test");
}, 120_000);

it("caps a maximum valid payload at 144px and scrolls it without displacing siblings", async () => {
    /* The server contract bounds one activity at 32 subagents + 32 terminals. */
    const maxSubagents: AgentActivityStripSubagent[] = Array.from({ length: 32 }, (_, index) => ({
        id: `sa-${index}`,
        description: `Subagent task ${index}`,
        status: "running",
        latestText: `working on step ${index}`,
        startedAt: NOW - index * 1_000,
        totalTokens: index * 100,
    }));
    const maxTerminals: AgentActivityStripTerminal[] = Array.from({ length: 32 }, (_, index) => ({
        id: `term-${index}`,
        command: `pnpm run job-${index}`,
        cwd: `/workspace/job-${index}`,
        startedAt: NOW - index * 2_000,
    }));
    const view = createRenderer().render(
        () => (
            <div
                style={{
                    background: "#f5f5f5",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                    padding: "16px",
                }}
            >
                <AgentActivityStrip
                    data-testid="strip-max"
                    now={NOW}
                    subagents={maxSubagents}
                    terminals={maxTerminals}
                />
                <div data-testid="below-strip" style={{ display: "flex", height: "36px" }} />
            </div>
        ),
        { width: 560, height: 240 },
    );
    await view.ready();

    /* The card holds its 144px cap for 64 rows instead of growing to ~1.8k px. */
    const strip = view.$('[data-testid="strip-max"]');
    expect(strip.bounds().height).toBe(144);
    expect(
        view.container.querySelectorAll(
            '[data-testid="strip-max"] [data-happy2-ui="agent-activity-strip-subagent"], [data-testid="strip-max"] [data-happy2-ui="agent-activity-strip-terminal"]',
        ),
    ).toHaveLength(64);

    /* The sibling below the strip stays exactly one 8px gap under the cap. */
    const below = view.$('[data-testid="below-strip"]');
    expect(below.bounds().y - (strip.bounds().y + strip.bounds().height)).toBeCloseTo(8, 1);

    /* The scrollport fills the card interior edge to edge inside the 1px border. */
    const scrollport = view.$(
        '[data-testid="strip-max"] [data-happy2-ui="agent-activity-strip-scrollport"]',
    );
    expect(scrollport.bounds().y - strip.bounds().y).toBe(1);
    expect(scrollport.bounds().height).toBe(142);
    expect(scrollport.bounds().x - strip.bounds().x).toBe(1);
    /* Width spans the full interior: the right inset is exactly the 1px border. */
    expect(scrollport.bounds().width).toBe(strip.bounds().width - 2);
    expect(
        strip.bounds().x +
            strip.bounds().width -
            (scrollport.bounds().x + scrollport.bounds().width),
    ).toBe(1);

    /* The overflow scrolls: the last terminal row is reachable at the bottom. */
    const port = scrollport.element as HTMLElement;
    expect(port.scrollHeight).toBeGreaterThan(port.clientHeight);
    const lastRow = view.container.querySelector<HTMLElement>(
        '[data-testid="strip-max"] [data-happy2-ui="agent-activity-strip-rows"] > :last-child',
    )!;
    expect(lastRow.getBoundingClientRect().top).toBeGreaterThan(
        port.getBoundingClientRect().bottom,
    );
    port.scrollTop = port.scrollHeight;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const portRect = port.getBoundingClientRect();
    const lastRect = lastRow.getBoundingClientRect();
    expect(lastRect.bottom).toBeLessThanOrEqual(portRect.bottom + 0.5);
    expect(lastRect.top).toBeGreaterThanOrEqual(portRect.top);
    /* Scrolling stays internal: the card and its sibling never move. */
    expect(strip.element.getBoundingClientRect().height).toBe(144);
    expect(below.element.getBoundingClientRect().top - portRect.bottom - 1).toBeCloseTo(8, 1);

    await view.screenshot("AgentActivityStrip.capacity.test");
}, 120_000);

it("truncates long strip content with a plain ellipsis at narrow widths", async () => {
    const view = createRenderer().render(
        () => (
            <div
                style={{
                    background: "#f5f5f5",
                    display: "flex",
                    flexDirection: "column",
                    padding: "16px",
                }}
            >
                <AgentActivityStrip
                    data-testid="strip-narrow"
                    now={NOW}
                    subagents={[
                        {
                            id: "sa-long",
                            description:
                                "Investigate the flaky realtime reconnect behavior across engines",
                            status: "running",
                            latestText:
                                "vitest run src/realtime/reconnect.test.ts --browser.name=webkit",
                            startedAt: NOW - 245_000,
                            totalTokens: 48_300,
                        },
                    ]}
                    terminals={[
                        {
                            id: "term-long",
                            command:
                                "pnpm --dir packages/happy2-gym test tests/server/session-refresh",
                            cwd: "~/conductor/workspaces/happy2/yokohama-v1/packages/happy2-gym",
                            startedAt: NOW - 30_000,
                        },
                    ]}
                />
            </div>
        ),
        { width: 280, height: 110 },
    );
    await view.ready();

    const clipped = (part: string) => {
        const el = view.$(`[data-testid="strip-narrow"] [data-happy2-ui="${part}"]`).element;
        return el.scrollWidth > el.clientWidth;
    };
    expect(clipped("agent-activity-strip-latest"), "latest truncates").toBe(true);
    expect(clipped("agent-activity-strip-cwd"), "cwd truncates").toBe(true);

    /* Even truncated, the meta stays fully visible and right-pinned. */
    const meta = view.$(
        '[data-testid="strip-narrow"] [data-happy2-ui="agent-activity-strip-subagent"] [data-happy2-ui="agent-activity-strip-meta"]',
    );
    expect(meta.element.textContent).toBe("48k4:05");
    const narrowStrip = view.$('[data-testid="strip-narrow"]');
    const narrowInset =
        narrowStrip.bounds().x +
        narrowStrip.bounds().width -
        (meta.bounds().x + meta.bounds().width);
    expect(Math.abs(narrowInset - 9)).toBeLessThanOrEqual(0.5);

    await view.screenshot("AgentActivityStrip.narrow.test");
}, 120_000);
