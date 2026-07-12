import { expect, it, vi } from "vitest";
import { server } from "vitest/browser";
import {
    AgentsSidebar,
    type AgentsSidebarAgent,
    type AgentsSidebarCopy,
    type AgentsSidebarWorkItem,
} from "./AgentsSidebar";
import "./styles.css";
import { createRenderer } from "./testing";

const agents: AgentsSidebarAgent[] = [
    {
        id: "agent-forge",
        name: "Forge",
        initials: "F",
        role: "Product engineering",
        count: 2,
        online: true,
        avatarClass: "bg-[linear-gradient(145deg,#ef566d,#8056c7)]",
    },
    {
        id: "agent-scout",
        name: "Scout",
        initials: "S",
        role: "Research & synthesis",
        count: 1,
        online: true,
        avatarClass: "bg-[linear-gradient(145deg,#3296a4,#4d67bd)]",
    },
    {
        id: "agent-patch",
        name: "Patch",
        initials: "P",
        role: "Verification & release",
        count: 1,
        online: true,
        avatarClass: "bg-[linear-gradient(145deg,#d37c3e,#cf496e)]",
    },
];

const workItems: AgentsSidebarWorkItem[] = [
    { id: "work-active", label: "Active runs", count: 3, icon: "active" },
    { id: "work-review", label: "Awaiting you", count: 1, icon: "review" },
    { id: "work-queued", label: "Queued", count: 2, icon: "queued" },
    { id: "work-complete", label: "Completed today", count: 8, icon: "complete" },
];

const copy: AgentsSidebarCopy = {
    agentsHeading: "Your agents",
    allAgentsLabel: "All agents",
    capacityLabel: "Agent capacity",
    capacityMessage: "One execution slot is available.",
    heading: "Agents",
    liveLabel: "3 live",
    searchLabel: "Find an agent or run",
    searchPlaceholder: "Find an agent or run…",
    settingsLabel: "Agent settings",
    subheading: "Workspace operations",
    workHeading: "Work",
};

it("holds AgentsSidebar geometry, controlled states, typography, and optical marks", async () => {
    const onQueryChange = vi.fn();
    const onSettingsClick = vi.fn();
    const onViewChange = vi.fn();
    const sidebar = (query: string, activeView: "overview" | "agent-forge") => (
        <AgentsSidebar
            activeView={activeView}
            agents={agents}
            capacityTotal={4}
            capacityUsed={3}
            copy={copy}
            onQueryChange={onQueryChange}
            onSettingsClick={onSettingsClick}
            onViewChange={onViewChange}
            query={query}
            workItems={workItems}
        />
    );
    const view = createRenderer()
        .render(() => sidebar("", "overview"), { width: 312, height: 704, padding: 12 })
        .render(() => sidebar("forge", "agent-forge"), {
            width: 312,
            height: 704,
            padding: 12,
        });
    await view.ready();

    const full = view.$('[data-rigged-ui="agents-sidebar"]');
    expect(full.bounds()).toEqual({ x: 12, y: 12, width: 288, height: 680 });
    expect(
        full.computedStyles([
            "background-color",
            "box-sizing",
            "color",
            "display",
            "flex-direction",
            "font-family",
            "height",
            "min-height",
            "width",
        ]),
    ).toEqual({
        "background-color": "rgb(247, 245, 251)",
        "box-sizing": "border-box",
        color: "rgb(64, 54, 78)",
        display: "flex",
        "flex-direction": "column",
        "font-family":
            server.browser === "webkit"
                ? "Rigged Manrope, sans-serif"
                : '"Rigged Manrope", sans-serif',
        height: "680px",
        "min-height": "0px",
        width: "288px",
    });

    expect(
        full.element.querySelectorAll('[data-rigged-ui="agents-sidebar-agent-row"]'),
    ).toHaveLength(3);
    expect(
        full.element.querySelectorAll('[data-rigged-ui="agents-sidebar-work-row"]'),
    ).toHaveLength(4);
    expect(view.$('[data-rigged-ui="agents-sidebar-header"]').bounds()).toEqual({
        x: 12,
        y: 12,
        width: 288,
        height: 58,
    });
    expect(view.$('[data-rigged-ui="agents-sidebar-settings"]').bounds()).toEqual({
        x: 256,
        y: 25,
        width: 32,
        height: 32,
    });
    expect(view.$('[data-rigged-ui="agents-sidebar-search"]').bounds()).toEqual({
        x: 24,
        y: 82,
        width: 264,
        height: 32,
    });
    expect(
        view
            .$('[data-rigged-ui="agents-sidebar-search"]')
            .computedStyles([
                "background-color",
                "border-radius",
                "border-top-color",
                "border-top-width",
                "box-sizing",
                "height",
            ]),
    ).toEqual({
        "background-color": "rgb(255, 255, 255)",
        "border-radius": "7px",
        "border-top-color": "rgb(216, 211, 223)",
        "border-top-width": "1px",
        "box-sizing": "border-box",
        height: "32px",
    });
    expect(view.$('[data-rigged-ui="agents-sidebar-overview-row"]').bounds()).toEqual({
        x: 24,
        y: 126,
        width: 264,
        height: 36,
    });
    expect(view.$('[data-agent-id="agent-forge"]').bounds()).toEqual({
        x: 24,
        y: 193,
        width: 264,
        height: 44,
    });
    expect(
        view
            .$('[data-agent-id="agent-forge"]')
            .computedStyles([
                "align-items",
                "background-color",
                "border-radius",
                "box-sizing",
                "display",
                "height",
                "padding-left",
                "padding-right",
            ]),
    ).toEqual({
        "align-items": "center",
        "background-color": "rgba(0, 0, 0, 0)",
        "border-radius": "7px",
        "box-sizing": "border-box",
        display: "flex",
        height: "44px",
        "padding-left": "8px",
        "padding-right": "8px",
    });
    expect(view.$('[data-work-id="work-active"]').bounds()).toMatchObject({
        x: 24,
        width: 264,
        height: 32,
    });
    expect(view.$('[data-rigged-ui="agents-sidebar-footer"]').bounds()).toEqual({
        x: 12,
        y: 591,
        width: 288,
        height: 101,
    });
    expect(view.$('[data-rigged-ui="agents-sidebar-capacity-fill"]').computedStyle("width")).toBe(
        "181.5px",
    );

    const heading = view.$('[data-rigged-ui="agents-sidebar-heading"]');
    expect(heading.textMetrics()).toMatchObject({
        font: {
            family: "Rigged Manrope, sans-serif",
            letterSpacing: -0.4,
            lineHeight: 16,
            size: 16,
            weight: "800",
        },
        text: "Agents",
    });
    const agentName = view.$('[data-rigged-ui="agents-sidebar-agent-name"]');
    expect(agentName.textMetrics()).toMatchObject({
        font: { family: "Rigged Manrope, sans-serif", lineHeight: 11, size: 11, weight: "800" },
        text: "Forge",
    });

    for (const selector of [
        '[data-rigged-ui="agents-sidebar-settings-mark"]',
        '[data-rigged-ui="agents-sidebar-search-mark"]',
        '[data-rigged-ui="agents-sidebar-overview-icon"] svg',
    ]) {
        const mark = view.$(selector);
        const metrics = await mark.visibleMetrics();
        expect(metrics.pixelCount).toBeGreaterThan(0);
        expect(metrics.bounds.width).toBeGreaterThan(0);
        expect(metrics.bounds.height).toBeGreaterThan(0);
        expect(
            Math.abs(metrics.center.x - mark.width() / 2),
            `${selector} horizontal optical center`,
        ).toBeLessThanOrEqual(0.55);
        expect(
            Math.abs(metrics.center.y - mark.height() / 2),
            `${selector} vertical optical center`,
        ).toBeLessThanOrEqual(0.55);
    }

    for (const icon of ["active", "review", "queued", "complete"] as const) {
        const mark = view.$(`[data-rigged-ui="agents-sidebar-work-mark"][data-icon="${icon}"]`);
        const metrics = await mark.visibleMetrics();
        expect(metrics.pixelCount, `${icon} icon visible pixels`).toBeGreaterThan(0);
        expect(
            Math.abs(metrics.center.x - mark.width() / 2),
            `${icon} horizontal optical center`,
        ).toBeLessThanOrEqual(0.75);
        expect(
            Math.abs(metrics.center.y - mark.height() / 2),
            `${icon} vertical optical center`,
        ).toBeLessThanOrEqual(0.75);
    }

    const avatar = view.$('[data-agent-id="agent-forge"] [data-rigged-ui="avatar"]');
    expect(avatar.bounds()).toMatchObject({ width: 18, height: 18 });
    const initials = view.$('[data-agent-id="agent-forge"] [data-rigged-ui="avatar-initials"]');
    const initialsVisible = await initials.visibleMetrics();
    const initialsOffsets = initials.offsets();
    expect(initialsVisible.pixelCount).toBeGreaterThan(0);
    expect(Math.abs(initialsVisible.center.x + initialsOffsets.left - 9)).toBeLessThanOrEqual(0.75);
    expect(Math.abs(initialsVisible.center.y + initialsOffsets.top - 9)).toBeLessThanOrEqual(0.75);

    await view.screenshot("AgentsSidebar.test");

    const search = full.element.querySelector<HTMLInputElement>(
        '[data-rigged-ui="agents-sidebar-search-input"]',
    )!;
    search.value = "patch";
    search.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
    expect(onQueryChange).toHaveBeenCalledWith("patch");
    full.element.querySelector<HTMLButtonElement>('[data-agent-id="agent-forge"]')!.click();
    expect(onViewChange).toHaveBeenCalledWith("agent-forge");
    full.element
        .querySelector<HTMLButtonElement>('[data-rigged-ui="agents-sidebar-settings"]')!
        .click();
    expect(onSettingsClick).toHaveBeenCalledOnce();

    const surfaces = view.container.querySelectorAll<HTMLElement>("[data-rigged-ui-surface]");
    expect(
        surfaces[1]!.querySelectorAll('[data-rigged-ui="agents-sidebar-agent-row"]'),
    ).toHaveLength(1);
    expect(
        surfaces[1]!.querySelectorAll('[data-rigged-ui="agents-sidebar-work-row"]'),
    ).toHaveLength(0);
    expect(
        getComputedStyle(surfaces[1]!.querySelector('[data-agent-id="agent-forge"]')!)
            .backgroundColor,
    ).toBe("rgb(220, 208, 235)");
});
