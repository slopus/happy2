import "./styles.css";
import type { CSSProperties } from "react";
import { expect, it } from "vitest";
import { AppShell } from "./AppShell";
import { createRenderer, type RenderedElement } from "./testing";

function slot(id: string, style: CSSProperties) {
    return <div data-testid={id} style={{ height: "100%", width: "100%", ...style }} />;
}

/** Dispatches a pointer press → move → release gesture with real client coordinates. */
async function drag(handle: RenderedElement<Element>, deltaX: number) {
    const rect = handle.element.getBoundingClientRect();
    const startX = rect.x + rect.width / 2;
    const startY = rect.y + rect.height / 2;
    const common = { bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse" as const };
    handle.element.dispatchEvent(
        new PointerEvent("pointerdown", {
            ...common,
            button: 0,
            buttons: 1,
            clientX: startX,
            clientY: startY,
        }),
    );
    handle.element.dispatchEvent(
        new PointerEvent("pointermove", {
            ...common,
            buttons: 1,
            clientX: startX + deltaX,
            clientY: startY,
        }),
    );
    handle.element.dispatchEvent(
        new PointerEvent("pointerup", {
            ...common,
            button: 0,
            buttons: 0,
            clientX: startX + deltaX,
            clientY: startY,
        }),
    );
}

function press(handle: RenderedElement<Element>, key: string) {
    handle.element.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key }),
    );
}

const shellSize = { height: 800, width: 1280 };

function interactiveShell() {
    return (
        <AppShell
            data-testid="shell"
            panel={slot("panel-slot", { background: "var(--surface)" })}
            panelDefaultWidth={340}
            panelMaximizable
            panelMinWidth={280}
            panelMaxWidth={560}
            panelResizable
            sidebar={slot("sidebar-slot", {
                background: "var(--groupped-background)",
                width: "100%",
            })}
            sidebarCollapsible
            sidebarDefaultWidth={288}
            sidebarMinWidth={220}
            sidebarMaxWidth={480}
        >
            {slot("workspace-slot", { background: "var(--surface)" })}
        </AppShell>
    );
}

it("does not render resize or collapse chrome unless the interaction props are set", async () => {
    const view = createRenderer().render(
        () => (
            <AppShell
                data-testid="plain"
                panel={slot("panel", { background: "var(--surface)" })}
                sidebar={slot("sidebar", {
                    background: "var(--groupped-background)",
                    width: "100%",
                })}
            >
                {slot("workspace", { background: "var(--surface)" })}
            </AppShell>
        ),
        shellSize,
    );
    await view.ready();

    expect(view.container.querySelector('[data-happy2-ui="app-shell-resize-handle"]')).toBeNull();
    expect(
        view.container.querySelector('[data-happy2-ui="app-shell-sidebar-collapse"]'),
    ).toBeNull();
    expect(view.container.querySelector('[data-happy2-ui="app-shell-panel-toggle"]')).toBeNull();
    // The fixed sidebar keeps its 30vw clamp contract (1280 → 360).
    expect(view.$('[data-happy2-ui="app-shell-sidebar"]').bounds().width).toBe(360);
});

it("contains a Sidebar within the width owned by the resizable shell", async () => {
    const view = createRenderer().render(
        () => (
            <AppShell
                data-testid="shell"
                sidebar={<div className="happy2-sidebar" data-testid="sidebar-content" />}
                sidebarCollapsible
                sidebarDefaultWidth={288}
                sidebarMinWidth={220}
                sidebarMaxWidth={480}
            >
                {slot("workspace", { background: "var(--surface)" })}
            </AppShell>
        ),
        shellSize,
    );
    await view.ready();

    const shellSidebar = view.$('[data-happy2-ui="app-shell-sidebar"]').bounds();
    const sidebarContent = view.$('[data-testid="sidebar-content"]');
    const contentSidebar = sidebarContent.bounds();
    expect(contentSidebar.width).toBe(shellSidebar.width);
    expect(contentSidebar.right).toBe(shellSidebar.right);
    expect(sidebarContent.computedStyle("background-color")).toBe("rgb(245, 245, 245)");
});

it("resizes the sidebar by pointer drag and clamps to its min/max bounds", async () => {
    const view = createRenderer().render(
        () => (
            <AppShell
                className="happy2-theme-dark"
                data-testid="shell"
                sidebar={slot("sidebar", {
                    background: "var(--groupped-background)",
                    width: "100%",
                })}
                sidebarCollapsible
                sidebarDefaultWidth={288}
                sidebarMinWidth={220}
                sidebarMaxWidth={480}
            >
                {slot("workspace", { background: "var(--surface)" })}
            </AppShell>
        ),
        shellSize,
    );
    await view.ready();

    const sidebar = () => view.$('[data-happy2-ui="app-shell-sidebar"]');
    const handle = () => view.$('[data-happy2-ui="app-shell-resize-handle"]');
    const line = () => view.$('[data-happy2-ui="app-shell-resize-line"]');
    expect(sidebar().bounds().width).toBe(288);
    expect(sidebar().computedStyle("background-color")).toBe("rgb(30, 30, 30)");
    expect(line().computedStyles(["background-color", "width"])).toEqual({
        "background-color": "rgb(41, 41, 41)",
        width: "1px",
    });
    expect(sidebar().bounds().x + sidebar().bounds().width).toBe(line().bounds().x);

    await drag(handle(), 60);
    await view.ready();
    expect(sidebar().bounds().width).toBe(348);

    // Drag far past the minimum: width clamps to 220, not below.
    await drag(handle(), -400);
    await view.ready();
    expect(sidebar().bounds().width).toBe(220);

    // Drag far past the maximum: width clamps to 480, not above.
    await drag(handle(), 1000);
    await view.ready();
    expect(sidebar().bounds().width).toBe(480);
});

it("exposes accessible separator semantics and resizes with the keyboard", async () => {
    const view = createRenderer().render(
        () => (
            <AppShell
                className="happy2-theme-dark"
                data-testid="shell"
                sidebar={slot("sidebar", {
                    background: "var(--groupped-background)",
                    width: "100%",
                })}
                sidebarCollapsible
                sidebarDefaultWidth={300}
                sidebarMinWidth={220}
                sidebarMaxWidth={480}
            >
                {slot("workspace", { background: "var(--surface)" })}
            </AppShell>
        ),
        shellSize,
    );
    await view.ready();

    const handle = () => view.$('[data-happy2-ui="app-shell-resize-handle"]');
    const sidebar = () => view.$('[data-happy2-ui="app-shell-sidebar"]');
    expect(handle().computedStyles(["cursor"])).toEqual({ cursor: "col-resize" });
    expect(handle().element.getAttribute("role")).toBe("separator");
    expect(handle().element.getAttribute("aria-orientation")).toBe("vertical");
    expect(handle().element.getAttribute("aria-valuemin")).toBe("220");
    expect(handle().element.getAttribute("aria-valuemax")).toBe("480");
    expect(handle().element.getAttribute("aria-valuenow")).toBe("300");

    (handle().element as HTMLElement).focus();
    expect(document.activeElement).toBe(handle().element);
    expect(handle().computedStyle("outline-style")).toBe("none");
    expect(
        view
            .$('[data-happy2-ui="app-shell-resize-line"]')
            .computedStyles(["background-color", "width"]),
    ).toEqual({
        "background-color": "rgb(44, 44, 46)",
        width: "2px",
    });

    press(handle(), "ArrowRight");
    await view.ready();
    expect(sidebar().bounds().width).toBe(316);
    expect(handle().element.getAttribute("aria-valuenow")).toBe("316");

    press(handle(), "ArrowLeft");
    await view.ready();
    expect(sidebar().bounds().width).toBe(300);

    press(handle(), "Home");
    await view.ready();
    expect(sidebar().bounds().width).toBe(220);

    press(handle(), "End");
    await view.ready();
    expect(sidebar().bounds().width).toBe(480);
});

it("hides and shows the sidebar while keeping the workspace DOM node mounted", async () => {
    const view = createRenderer().render(interactiveShell, shellSize);
    await view.ready();

    const workspaceBefore = view.$('[data-happy2-ui="app-shell-workspace"]').element;
    expect(view.$('[data-happy2-ui="app-shell-sidebar"]').computedStyle("display")).not.toBe(
        "none",
    );
    const collapse = view.$('[data-happy2-ui="app-shell-sidebar-collapse"]');
    const collapseIcon = view.$(
        '[data-happy2-ui="app-shell-sidebar-collapse"] [data-happy2-ui="icon"]',
    );
    expect(collapseIcon.element.getAttribute("data-glyph")).toBe("sidebar-collapse");
    expect(collapse.computedStyles(["background-color", "border-top-width"])).toEqual({
        "background-color": "rgba(0, 0, 0, 0)",
        "border-top-width": "0px",
    });
    expect(collapseIcon.computedStyle("font-size")).toBe("14px");

    (collapse.element as HTMLButtonElement).click();
    await view.ready();

    // Collapsed: the sidebar stays in the DOM (identity preserved) but is hidden,
    // and a reveal control appears in its place.
    expect(view.$('[data-happy2-ui="app-shell-sidebar"]').computedStyle("display")).toBe("none");
    const reveal = view.$('[data-happy2-ui="app-shell-reveal-button"]');
    expect(reveal.element.getAttribute("aria-label")).toBe("Show sidebar");
    const revealIcon = view.$('[data-happy2-ui="app-shell-reveal-button"] [data-happy2-ui="icon"]');
    expect(revealIcon.element.getAttribute("data-glyph")).toBe("sidebar-expand");
    expect(reveal.computedStyles(["background-color", "border-top-width"])).toEqual({
        "background-color": "rgba(0, 0, 0, 0)",
        "border-top-width": "0px",
    });
    expect(revealIcon.computedStyle("font-size")).toBe("14px");
    expect(view.$('[data-happy2-ui="app-shell-workspace"]').element).toBe(workspaceBefore);

    (reveal.element as HTMLButtonElement).click();
    await view.ready();

    expect(view.$('[data-happy2-ui="app-shell-sidebar"]').computedStyle("display")).not.toBe(
        "none",
    );
    expect(view.$('[data-happy2-ui="app-shell-workspace"]').element).toBe(workspaceBefore);
});

it("resizes the panel by pointer drag within its min/max bounds", async () => {
    const view = createRenderer().render(interactiveShell, shellSize);
    await view.ready();

    const panel = () => view.$('[data-happy2-ui="app-shell-panel"]');
    const panelHandle = () =>
        view.$('[data-happy2-ui="app-shell-resize-handle"][data-edge="left"]');
    expect(panel().bounds().width).toBe(340);

    // The panel handle sits on the panel's left edge: dragging left grows it.
    await drag(panelHandle(), -80);
    await view.ready();
    expect(panel().bounds().width).toBe(420);

    await drag(panelHandle(), 1000);
    await view.ready();
    expect(panel().bounds().width).toBe(280);

    await drag(panelHandle(), -1000);
    await view.ready();
    expect(panel().bounds().width).toBe(560);
});

it("keeps both resized sidebars fully reachable at the minimum desktop width", async () => {
    const view = createRenderer().render(
        () => (
            <AppShell
                data-testid="tight-shell"
                panel={slot("tight-panel", { background: "var(--surface)" })}
                panelDefaultWidth={340}
                panelMinWidth={280}
                panelMaxWidth={560}
                panelResizable
                rail={slot("tight-rail", {
                    background: "var(--groupped-background)",
                    width: 64,
                })}
                sidebar={slot("tight-sidebar", {
                    background: "var(--groupped-background)",
                    width: "100%",
                })}
                sidebarCollapsible
                sidebarDefaultWidth={288}
                sidebarMinWidth={220}
                sidebarMaxWidth={480}
            >
                {slot("tight-workspace", { background: "var(--surface)" })}
            </AppShell>
        ),
        { height: 600, width: 720 },
    );
    await view.ready();

    const sidebarHandle = view.$('[data-happy2-ui="app-shell-resize-handle"][data-edge="right"]');
    const panelHandle = view.$('[data-happy2-ui="app-shell-resize-handle"][data-edge="left"]');
    await drag(sidebarHandle, 1000);
    await view.ready();
    await drag(panelHandle, -1000);
    await view.ready();

    const main = view.$('[data-happy2-ui="app-shell-main"]').bounds();
    const content = view.$('[data-happy2-ui="app-shell-content"]').bounds();
    const sidebar = view.$('[data-happy2-ui="app-shell-sidebar"]').bounds();
    const workspace = view.$('[data-happy2-ui="app-shell-workspace"]').bounds();
    const panel = view.$('[data-happy2-ui="app-shell-panel"]').bounds();

    expect(sidebar.width).toBe(220);
    expect(workspace.width).toBe(140);
    expect(panel.width).toBe(280);
    expect(sidebar.x).toBe(main.x);
    expect(panel.x + panel.width).toBe(content.x + content.width);
});

it("maximizes the panel over the whole content region and restores it without remounting", async () => {
    const view = createRenderer().render(interactiveShell, shellSize);
    await view.ready();

    const panelNode = view.$('[data-happy2-ui="app-shell-panel"]').element;
    const workspaceNode = view.$('[data-happy2-ui="app-shell-workspace"]').element;
    const sidebarNode = view.$('[data-happy2-ui="app-shell-sidebar"]').element;
    const content = view.$('[data-happy2-ui="app-shell-content"]').bounds();
    const sidebarLeft = view.$('[data-happy2-ui="app-shell-sidebar"]').bounds().x;

    const toggle = view.$('[data-happy2-ui="app-shell-panel-toggle"]');
    expect(toggle.element.getAttribute("aria-label")).toBe("Expand panel");
    (toggle.element as HTMLButtonElement).click();
    await view.ready();

    // Maximized: the panel overlays the full content region, including the sidebar.
    const maximized = view.$('[data-happy2-ui="app-shell-panel"]');
    expect(maximized.element.getAttribute("data-maximized")).toBe("");
    expect(maximized.bounds()).toEqual(content);
    expect(maximized.bounds().x).toBe(sidebarLeft);
    const collapse = view.$('[data-happy2-ui="app-shell-sidebar-collapse"]').bounds();
    const topmostAtCollapse = document.elementFromPoint(
        collapse.x + collapse.width / 2,
        collapse.y + collapse.height / 2,
    );
    expect(maximized.element.contains(topmostAtCollapse)).toBe(true);
    // Every region kept its identity and stays in the DOM under the overlay.
    expect(view.$('[data-happy2-ui="app-shell-panel"]').element).toBe(panelNode);
    expect(view.$('[data-happy2-ui="app-shell-workspace"]').element).toBe(workspaceNode);
    expect(view.$('[data-happy2-ui="app-shell-sidebar"]').element).toBe(sidebarNode);
    expect(
        view.$('[data-happy2-ui="app-shell-panel-toggle"]').element.getAttribute("aria-label"),
    ).toBe("Restore panel");

    (view.$('[data-happy2-ui="app-shell-panel-toggle"]').element as HTMLButtonElement).click();
    await view.ready();

    const restored = view.$('[data-happy2-ui="app-shell-panel"]');
    expect(restored.element.getAttribute("data-maximized")).toBeNull();
    expect(restored.bounds().width).toBe(340);
    expect(restored.element).toBe(panelNode);
    expect(view.$('[data-happy2-ui="app-shell-workspace"]').element).toBe(workspaceNode);
    expect(view.$('[data-happy2-ui="app-shell-sidebar"]').element).toBe(sidebarNode);
});

it("supports controlled maximize with a panel footer pinned below the body", async () => {
    const changes: boolean[] = [];
    const view = createRenderer().render(
        () => (
            <AppShell
                data-testid="shell"
                panel={slot("panel", { background: "var(--surface)" })}
                panelFooter={slot("footer", { background: "var(--surface-pressed)" })}
                panelMaximizable
                panelMaximized
                onPanelMaximizedChange={(value) => changes.push(value)}
                sidebar={slot("sidebar", {
                    background: "var(--groupped-background)",
                    width: "100%",
                })}
                sidebarCollapsible
            >
                {slot("workspace", { background: "var(--surface)" })}
            </AppShell>
        ),
        shellSize,
    );
    await view.ready();

    // Controlled maximized: the panel overlays the whole content region.
    const content = view.$('[data-happy2-ui="app-shell-content"]').bounds();
    const panel = view.$('[data-happy2-ui="app-shell-panel"]');
    expect(panel.element.getAttribute("data-maximized")).toBe("");
    expect(panel.bounds()).toEqual(content);

    // The footer sits below the panel body inside the same column, both full width.
    const body = view.$('[data-happy2-ui="app-shell-panel-content"]').bounds();
    const footer = view.$('[data-happy2-ui="app-shell-panel-footer"]').bounds();
    expect(footer.width).toBe(panel.bounds().width);
    expect(footer.y).toBe(body.y + body.height);
    expect(view.container.querySelector('[data-testid="footer"]')).not.toBeNull();

    const toggle = view.$('[data-happy2-ui="app-shell-panel-toggle"]');
    expect(toggle.element.getAttribute("aria-label")).toBe("Restore panel");
    // Controlled: clicking only reports intent; AppShell does not flip its own view.
    (toggle.element as HTMLButtonElement).click();
    await view.ready();
    expect(changes).toEqual([false]);
    expect(
        view.$('[data-happy2-ui="app-shell-panel"]').element.getAttribute("data-maximized"),
    ).toBe("");
});
