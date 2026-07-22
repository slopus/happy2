import "./styles.css";
import type { CSSProperties } from "react";
import { expect, it } from "vitest";
import { server, userEvent } from "vitest/browser";
import { AppShell } from "./AppShell";
import { Button } from "./Button";
import { ChannelHeader } from "./ChannelHeader";
import { Sidebar } from "./Sidebar";
import { createRenderer } from "./testing";

function slot(id: string, style: CSSProperties) {
    return <div data-testid={id} style={{ height: "100%", width: "100%", ...style }} />;
}

function appRegion(element: Element): string {
    const style = getComputedStyle(element);
    return style.getPropertyValue("app-region") || style.getPropertyValue("-webkit-app-region");
}

it("composes Happy's flat desktop shell with clamped navigation and inspector surfaces", async () => {
    const view = createRenderer().render(
        () => (
            <AppShell
                data-testid="shell"
                panel={slot("panel-slot", { background: "var(--surface)" })}
                rail={slot("rail-slot", {
                    background: "var(--header-background)",
                    width: "64px",
                })}
                sidebar={slot("sidebar-slot", {
                    background: "var(--groupped-background)",
                    width: "100%",
                })}
                titleBar={slot("title-slot", {
                    background: "var(--header-background)",
                    height: "56px",
                })}
            >
                {slot("workspace-slot", { background: "var(--surface)" })}
            </AppShell>
        ),
        { height: 800, width: 1280 },
    );

    await view.ready();

    const shell = view.$('[data-testid="shell"]');
    expect(shell.bounds()).toEqual({ height: 800, width: 1280, x: 0, y: 0 });
    expect(shell.computedStyles(["background-color", "min-height", "min-width"])).toEqual({
        "background-color": "rgb(255, 255, 255)",
        "min-height": "480px",
        "min-width": "720px",
    });
    expect(view.$('[data-happy2-ui="app-shell-title-bar"]').bounds()).toEqual({
        height: 56,
        width: 1280,
        x: 0,
        y: 0,
    });
    expect(view.$('[data-happy2-ui="app-shell-rail"]').bounds()).toEqual({
        height: 744,
        width: 64,
        x: 0,
        y: 56,
    });
    expect(view.$('[data-happy2-ui="app-shell-content"]').bounds()).toEqual({
        height: 744,
        width: 1216,
        x: 64,
        y: 56,
    });
    expect(view.$('[data-happy2-ui="app-shell-main"]').bounds()).toEqual({
        height: 744,
        width: 856,
        x: 64,
        y: 56,
    });
    expect(view.$('[data-happy2-ui="app-shell-sidebar"]').bounds()).toEqual({
        height: 744,
        width: 360,
        x: 64,
        y: 56,
    });
    expect(
        view
            .$('[data-happy2-ui="app-shell-panel"]')
            .computedStyles(["border-left-width", "border-radius", "width"]),
    ).toEqual({
        "border-left-width": "1px",
        "border-radius": "0px",
        width: "360px",
    });
});

it("keeps a workspace-only shell flat and free of legacy card insets", async () => {
    const view = createRenderer().render(
        () => (
            <AppShell
                data-testid="bare-shell"
                rail={slot("bare-rail", {
                    background: "var(--header-background)",
                    width: "64px",
                })}
                titleBar={slot("bare-title", {
                    background: "var(--header-background)",
                    height: "56px",
                })}
            >
                {slot("bare-workspace", { background: "var(--surface)" })}
            </AppShell>
        ),
        { height: 800, width: 1280 },
    );

    await view.ready();

    const main = view.$('[data-testid="bare-shell"] [data-happy2-ui="app-shell-main"]');
    expect(main.bounds()).toEqual({ height: 744, width: 1216, x: 64, y: 56 });
    expect(main.computedStyles(["border-top-width", "border-radius", "padding-bottom"])).toEqual({
        "border-top-width": "0px",
        "border-radius": "0px",
        "padding-bottom": "0px",
    });
});

it("reserves macOS chrome and keeps real desktop header controls clickable", async () => {
    let memberClicks = 0;
    let searchClicks = 0;
    const view = createRenderer().render(
        () => (
            <AppShell
                sidebar={
                    <Sidebar
                        activeItemId="general"
                        brand
                        onItemSelect={() => undefined}
                        sections={[
                            {
                                id: "chats",
                                items: [
                                    {
                                        id: "general",
                                        kind: "channel",
                                        label: "General",
                                    },
                                ],
                            },
                        ]}
                    />
                }
                windowControls
            >
                <ChannelHeader
                    actions={
                        <Button
                            aria-label="Search"
                            icon="search"
                            iconOnly
                            onClick={() => searchClicks++}
                            size="small"
                            variant="ghost"
                        />
                    }
                    memberCount={3}
                    onMembersClick={() => memberClicks++}
                    title="Checks"
                />
            </AppShell>
        ),
        { height: 600, width: 900 },
    );

    await view.ready();

    expect(view.container.querySelector('[data-happy2-ui="window-drag-region"]')).toBeNull();
    const sidebarHeader = view.$('[data-happy2-ui="sidebar-header"]');
    const logo = view.$('[data-happy2-ui="sidebar-brand-logo"]');
    const channelHeader = view.$('[data-happy2-ui="channel-header"]');
    const members = view.$('[data-happy2-ui="channel-header-members"]');
    const search = view.$('button[aria-label="Search"]');
    expect(sidebarHeader.computedStyle("padding-left")).toBe("90px");
    expect(logo.bounds().x).toBeGreaterThanOrEqual(90);
    if (server.browser === "chromium") {
        expect(appRegion(sidebarHeader.element)).toBe("drag");
        expect(appRegion(channelHeader.element)).toBe("drag");
        expect(appRegion(members.element)).toBe("no-drag");
        expect(appRegion(search.element)).toBe("no-drag");
    }

    await userEvent.click(members.element);
    await userEvent.click(search.element);
    expect(memberClicks).toBe(1);
    expect(searchClicks).toBe(1);
});

it("reserves a non-overlapping drag row for a standalone desktop surface", async () => {
    const view = createRenderer().render(
        () => (
            <AppShell windowControls>
                <button data-testid="standalone-control" type="button">
                    Settings control
                </button>
            </AppShell>
        ),
        { height: 600, width: 900 },
    );

    await view.ready();

    const titleBar = view.$('[data-happy2-ui="app-shell-standalone-title-bar"]');
    const control = view.$('[data-testid="standalone-control"]');
    expect(titleBar.bounds()).toEqual({ height: 56, width: 900, x: 0, y: 0 });
    expect(control.bounds().y).toBeGreaterThanOrEqual(56);
    if (server.browser === "chromium") expect(appRegion(titleBar.element)).toBe("drag");
});
