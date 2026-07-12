import { expect, it, vi } from "vitest";
import { server } from "vitest/browser";
import { TasksSidebar, type TasksSidebarGoal, type TasksSidebarView } from "./TasksSidebar";
import "./styles.css";
import { createRenderer } from "./testing";

const views: TasksSidebarView[] = [
    { id: "all", label: "All work", mark: "all" },
    { id: "mine", label: "My tasks", mark: "mine" },
    { id: "agents", label: "Agent-owned", mark: "agents" },
    { id: "blocked", label: "Blocked", mark: "blocked" },
    { id: "complete", label: "Completed", mark: "complete" },
];

const goals: TasksSidebarGoal[] = [
    { color: "#d98057", id: "goal-onboarding", label: "Frictionless onboarding", progress: 68 },
    { color: "#7862a4", id: "goal-transparency", label: "Agent transparency", progress: 46 },
    { color: "#4f8a82", id: "goal-reliability", label: "Desktop reliability", progress: 74 },
];

const counts = { agents: 3, all: 18, blocked: 2, complete: 6, mine: 7 };
const summary = { bars: [35, 65, 48, 82, 58, 92, 70], label: "This week", value: "6 completed" };

it("holds TasksSidebar geometry, styles, optical marks, filtering, and controlled callbacks", async () => {
    const onQueryChange = vi.fn();
    const onSettingsClick = vi.fn();
    const onViewChange = vi.fn();
    const view = createRenderer()
        .render(
            () => (
                <TasksSidebar
                    activeView="all"
                    counts={counts}
                    data-testid="default"
                    goals={goals}
                    onQueryChange={onQueryChange}
                    onSettingsClick={onSettingsClick}
                    onViewChange={onViewChange}
                    query=""
                    summary={summary}
                    views={views}
                />
            ),
            { width: 312, height: 564, padding: 12 },
        )
        .render(
            () => (
                <TasksSidebar
                    activeView="goal-reliability"
                    counts={counts}
                    data-testid="filtered"
                    goals={goals}
                    onQueryChange={onQueryChange}
                    onViewChange={onViewChange}
                    query="reli"
                    summary={summary}
                    views={views}
                />
            ),
            { width: 312, height: 300, padding: 12 },
        )
        .render(
            () => (
                <TasksSidebar
                    activeView="blocked"
                    aria-label="Project task navigation"
                    class="shadow-none"
                    counts={counts}
                    data-testid="wide"
                    goals={goals}
                    onQueryChange={onQueryChange}
                    onViewChange={onViewChange}
                    query="blocked"
                    style={{ width: "320px" }}
                    subtitle="Workspace delivery"
                    summary={{ ...summary, value: "8 completed" }}
                    title="Delivery"
                    views={views}
                />
            ),
            { width: 344, height: 300, padding: 12 },
        );
    await view.ready();

    const sidebar = view.$('[data-testid="default"]');
    const filtered = view.$('[data-testid="filtered"]');
    const wide = view.$('[data-testid="wide"]');
    expect(sidebar.bounds()).toEqual({ x: 12, y: 12, width: 288, height: 540 });
    expect(filtered.bounds()).toEqual({ x: 12, y: 12, width: 288, height: 276 });
    expect(wide.bounds()).toEqual({ x: 12, y: 12, width: 320, height: 276 });
    expect(wide.element.getAttribute("aria-label")).toBe("Project task navigation");
    expect(wide.element.textContent).toContain("Delivery");
    expect(wide.element.textContent).toContain("Workspace delivery");
    expect(wide.element.textContent).toContain("8 completed");

    expect(
        sidebar.computedStyles([
            "background-color",
            "box-sizing",
            "color",
            "display",
            "font-family",
            "height",
            "overflow-x",
            "overflow-y",
            "width",
        ]),
    ).toEqual({
        "background-color": "rgb(248, 246, 243)",
        "box-sizing": "border-box",
        color: "rgb(72, 64, 57)",
        display: "flex",
        "font-family":
            server.browser === "webkit"
                ? "Rigged Manrope, sans-serif"
                : '"Rigged Manrope", sans-serif',
        height: "540px",
        "overflow-x": "hidden",
        "overflow-y": "hidden",
        width: "288px",
    });

    expect(
        view.$('[data-testid="default"] [data-rigged-ui="tasks-sidebar-header"]').bounds(),
    ).toEqual({
        x: 12,
        y: 12,
        width: 288,
        height: 58,
    });
    expect(
        view.$('[data-testid="default"] [data-rigged-ui="tasks-sidebar-search"]').bounds(),
    ).toEqual({
        x: 24,
        y: 82,
        width: 264,
        height: 32,
    });
    expect(view.$('[data-testid="default"] [data-view-id="all"]').bounds()).toEqual({
        x: 24,
        y: 148,
        width: 264,
        height: 32,
    });
    expect(view.$('[data-testid="default"] [data-view-id="complete"]').bounds()).toEqual({
        x: 24,
        y: 284,
        width: 264,
        height: 32,
    });
    expect(
        view.$('[data-testid="default"] [data-rigged-ui="tasks-sidebar-footer"]').bounds(),
    ).toEqual({
        x: 12,
        y: 474,
        width: 288,
        height: 78,
    });

    const activeView = view.$('[data-testid="default"] [data-view-id="all"]');
    expect(
        activeView.computedStyles([
            "align-items",
            "background-color",
            "border-radius",
            "box-sizing",
            "color",
            "column-gap",
            "height",
            "padding-left",
            "padding-right",
        ]),
    ).toEqual({
        "align-items": "center",
        "background-color": "rgb(230, 217, 205)",
        "border-radius": "7px",
        "box-sizing": "border-box",
        color: "rgb(62, 48, 38)",
        "column-gap": "8px",
        height: "32px",
        "padding-left": "8px",
        "padding-right": "8px",
    });
    expect(activeView.element.getAttribute("aria-pressed")).toBe("true");
    expect(
        view.$(
            '[data-testid="default"] [data-view-id="all"] [data-rigged-ui="tasks-sidebar-view-count"]',
        ).element.textContent,
    ).toBe("18");

    const title = view.$('[data-testid="default"] [data-rigged-ui="tasks-sidebar-title"]');
    expect(title.textMetrics()).toMatchObject({
        font: {
            family: "Rigged Manrope, sans-serif",
            letterSpacing: -0.4,
            lineHeight: 20,
            size: 16,
            weight: "800",
        },
        offsets: { bottom: 14, top: 0 },
        text: "Tasks",
    });
    const searchInput = view.$(
        '[data-testid="default"] [data-rigged-ui="tasks-sidebar-search-input"]',
    );
    expect(
        searchInput.computedStyles([
            "font-size",
            "height",
            "line-height",
            "padding-left",
            "padding-right",
        ]),
    ).toEqual({
        "font-size": "11px",
        height: "16px",
        "line-height": "16px",
        "padding-left": "0px",
        "padding-right": "0px",
    });

    const allMark = view.$(
        '[data-testid="default"] [data-view-id="all"] [data-rigged-ui="tasks-sidebar-view-mark"]',
    );
    expect(allMark.bounds()).toMatchObject({ width: 16, height: 16 });
    const allVisible = await allMark.visibleMetrics();
    expect(allVisible.pixelCount).toBeGreaterThan(0);
    expect(Math.round(allVisible.center.x * 2)).toBe(16);
    expect(Math.round(allVisible.center.y * 2)).toBe(16);

    for (const selector of ["tasks-sidebar-settings-mark", "tasks-sidebar-search-mark"]) {
        const mark = view.$(`[data-testid="default"] [data-rigged-ui="${selector}"]`);
        expect(mark.bounds()).toMatchObject({ width: 16, height: 16 });
        const visible = await mark.visibleMetrics();
        expect(visible.bounds.width).toBeGreaterThan(0);
        expect(visible.bounds.height).toBeGreaterThan(0);
        expect(Math.round(visible.center.x * 2), `${selector} horizontal center`).toBe(16);
        expect(Math.round(visible.center.y * 2), `${selector} vertical center`).toBe(16);
    }

    expect(filtered.element.querySelectorAll('[data-rigged-ui="tasks-sidebar-view"]')).toHaveLength(
        0,
    );
    expect(filtered.element.querySelectorAll('[data-rigged-ui="tasks-sidebar-goal"]')).toHaveLength(
        1,
    );
    expect(filtered.element.querySelector('[data-rigged-ui="tasks-sidebar-settings"]')).toBeNull();
    expect(wide.element.querySelectorAll('[data-rigged-ui="tasks-sidebar-view"]')).toHaveLength(1);
    expect(wide.element.querySelectorAll('[data-rigged-ui="tasks-sidebar-goal"]')).toHaveLength(0);

    (searchInput.element as HTMLInputElement).value = "agent";
    searchInput.element.dispatchEvent(new InputEvent("input", { bubbles: true, data: "agent" }));
    expect(onQueryChange).toHaveBeenCalledWith("agent");
    (searchInput.element as HTMLInputElement).value = "";
    (activeView.element as HTMLButtonElement).click();
    expect(onViewChange).toHaveBeenCalledWith("all");
    (
        view.$('[data-testid="default"] [data-rigged-ui="tasks-sidebar-settings"]')
            .element as HTMLButtonElement
    ).click();
    expect(onSettingsClick).toHaveBeenCalledOnce();

    const firstProgress = view.$(
        '[data-testid="default"] [data-view-id="goal-onboarding"] [data-rigged-ui="tasks-sidebar-goal-progress"]',
    );
    expect(
        firstProgress.computedStyles(["background-color", "border-radius", "height", "width"]),
    ).toEqual({
        "background-color": "rgb(217, 128, 87)",
        "border-radius": "2px",
        height: "4px",
        width: server.browser === "firefox" ? "168.633px" : "168.625px",
    });
    expect(
        sidebar.element.querySelectorAll('[data-rigged-ui="tasks-sidebar-summary-bar"]'),
    ).toHaveLength(7);

    await view.screenshot("TasksSidebar.test");
});
