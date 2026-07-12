import { expect, it, vi } from "vitest";
import "./styles.css";
import { Sidebar, type SidebarSection } from "./Sidebar";
import { createRenderer } from "./testing";

const sections: SidebarSection[] = [
    {
        id: "channels",
        icon: "channels",
        label: "Channels",
        items: [
            { id: "general", kind: "channel", name: "general" },
            { id: "design", kind: "channel", name: "design", badge: 3 },
        ],
    },
    {
        id: "messages",
        icon: "messages",
        label: "Direct messages",
        items: [
            {
                id: "forge",
                kind: "app",
                name: "Forge",
                initials: "F",
                avatarClass: "bg-[#765c95]",
                online: true,
            },
            {
                id: "steve",
                kind: "person",
                name: "Steve",
                initials: "S",
            },
        ],
    },
];

it("holds Sidebar geometry, controlled states, events, typography, and optical alignment", async () => {
    const onCompose = vi.fn();
    const onDirectory = vi.fn();
    const onHuddles = vi.fn();
    const onInvite = vi.fn();
    const onItemChange = vi.fn();
    const onQueryChange = vi.fn();
    const onSettings = vi.fn();
    const onWorkspaceMenu = vi.fn();
    const view = createRenderer()
        .render(
            () => (
                <Sidebar
                    data-testid="sidebar-full"
                    activeItemId="design"
                    onCompose={onCompose}
                    onDirectory={onDirectory}
                    onHuddles={onHuddles}
                    onInvite={onInvite}
                    onItemChange={onItemChange}
                    onQueryChange={onQueryChange}
                    onSettings={onSettings}
                    onWorkspaceMenu={onWorkspaceMenu}
                    query=""
                    sections={sections}
                    setupProgress={0.5}
                    workspaceName="Acme Studio"
                />
            ),
            { width: 320, height: 560, padding: 16 },
        )
        .render(
            () => (
                <Sidebar
                    data-testid="sidebar-filtered"
                    activeItemId="forge"
                    onItemChange={onItemChange}
                    onQueryChange={onQueryChange}
                    query="forge"
                    sections={sections}
                    workspaceName="Acme Studio"
                />
            ),
            { width: 320, height: 420, padding: 16 },
        );
    view.container.style.flexDirection = "row";
    await view.ready();

    const sidebar = view.$('[data-testid="sidebar-full"]');
    expect(sidebar.bounds()).toEqual({ x: 16, y: 16, width: 288, height: 528 });
    expect(
        sidebar.computedStyles([
            "background-color",
            "box-sizing",
            "color",
            "display",
            "flex-direction",
            "font-family",
            "height",
            "overflow-x",
            "overflow-y",
            "width",
        ]),
    ).toEqual({
        "background-color": "rgb(247, 245, 251)",
        "box-sizing": "border-box",
        color: "rgb(64, 54, 78)",
        display: "flex",
        "flex-direction": "column",
        "font-family": expect.stringMatching(/Rigged Manrope/),
        height: "528px",
        "overflow-x": "hidden",
        "overflow-y": "hidden",
        width: "288px",
    });

    expect(
        view.$('[data-testid="sidebar-full"] [data-rigged-ui="sidebar-header"]').bounds(),
    ).toEqual({ x: 16, y: 16, width: 288, height: 58 });
    expect(
        view.$('[data-testid="sidebar-full"] [data-rigged-ui="sidebar-setup"]').bounds(),
    ).toEqual({ x: 28, y: 86, width: 264, height: 46 });
    expect(
        view.$('[data-testid="sidebar-full"] [data-rigged-ui="sidebar-search"]').bounds(),
    ).toEqual({ x: 28, y: 144, width: 264, height: 32 });
    expect(
        view.$('[data-testid="sidebar-full"] [data-rigged-ui="sidebar-footer"]').bounds(),
    ).toEqual({ x: 16, y: 458, width: 288, height: 86 });

    const active = view.$(
        '[data-testid="sidebar-full"] [data-rigged-ui="sidebar-item"][data-item-id="design"]',
    );
    expect(active.bounds()).toMatchObject({ width: 264, height: 32 });
    expect(
        active.computedStyles([
            "align-items",
            "background-color",
            "border-radius",
            "border-top-width",
            "font-size",
            "font-weight",
            "height",
            "line-height",
            "padding-left",
            "padding-right",
            "width",
        ]),
    ).toEqual({
        "align-items": "center",
        "background-color": "rgb(220, 208, 235)",
        "border-radius": "7px",
        "border-top-width": "0px",
        "font-size": "12px",
        "font-weight": "700",
        height: "32px",
        "line-height": "16px",
        "padding-left": "8px",
        "padding-right": "8px",
        width: "264px",
    });

    const workspaceName = view.$(
        '[data-testid="sidebar-full"] [data-rigged-ui="sidebar-workspace-name"]',
    );
    expect(workspaceName.textMetrics()).toMatchObject({
        font: {
            letterSpacing: -0.4,
            lineHeight: 20,
            size: 16,
            weight: "800",
        },
        text: "Acme Studio",
    });
    const itemLabel = view.$(
        '[data-testid="sidebar-full"] [data-rigged-ui="sidebar-item"][data-item-id="design"] [data-rigged-ui="sidebar-item-label"]',
    );
    expect(itemLabel.textMetrics()).toMatchObject({
        font: { letterSpacing: 0, lineHeight: 16, size: 12, weight: "700" },
        text: "design",
    });

    const searchIcon = view.$(
        '[data-testid="sidebar-full"] [data-rigged-ui="sidebar-search"] [data-icon="search"]',
    );
    expect(searchIcon.bounds()).toMatchObject({ width: 16, height: 16 });
    const iconPixels = await searchIcon.visibleMetrics();
    expect(iconPixels.pixelCount).toBeGreaterThan(40);
    expect(iconPixels.bounds.width).toBeGreaterThanOrEqual(11);
    expect(iconPixels.bounds.height).toBeGreaterThanOrEqual(11);
    expect(Math.abs(iconPixels.center.x - 8)).toBeLessThan(1.5);
    expect(Math.abs(iconPixels.center.y - 8)).toBeLessThan(1.5);

    const progress = view.$(
        '[data-testid="sidebar-full"] [data-rigged-ui="sidebar-setup-progress"]',
    );
    expect(progress.bounds()).toMatchObject({ width: 24, height: 24 });
    expect(progress.computedStyle("background-image")).toContain("50%");

    const filtered = view.$('[data-testid="sidebar-filtered"]');
    expect(filtered.bounds()).toEqual({ x: 16, y: 16, width: 288, height: 388 });
    expect(filtered.element.querySelectorAll('[data-rigged-ui="sidebar-item"]')).toHaveLength(1);
    expect(filtered.element.textContent).toContain("Forge");
    expect(filtered.element.textContent).not.toContain("general");

    await view.screenshot("Sidebar.test");

    const query = sidebar.element.querySelector<HTMLInputElement>(
        '[data-rigged-ui="sidebar-query"]',
    )!;
    query.value = "for";
    query.dispatchEvent(new InputEvent("input", { bubbles: true, data: "r" }));
    expect(onQueryChange).toHaveBeenCalledWith("for");
    active.element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onItemChange).toHaveBeenCalledWith("design");
    sidebar.element.querySelector<HTMLElement>('[data-action="settings"]')!.click();
    sidebar.element.querySelector<HTMLElement>('[data-action="huddles"]')!.click();
    sidebar.element.querySelector<HTMLElement>('[data-action="directory"]')!.click();
    sidebar.element
        .querySelector<HTMLElement>('[data-rigged-ui="sidebar-workspace-menu"]')!
        .click();
    sidebar.element.querySelector<HTMLElement>('[data-rigged-ui="sidebar-invite"]')!.click();
    expect(onSettings).toHaveBeenCalledOnce();
    expect(onHuddles).toHaveBeenCalledOnce();
    expect(onDirectory).toHaveBeenCalledOnce();
    expect(onWorkspaceMenu).toHaveBeenCalledOnce();
    expect(onInvite).toHaveBeenCalledOnce();
});
