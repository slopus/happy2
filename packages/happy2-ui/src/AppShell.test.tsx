import "./styles.css";
import type { CSSProperties } from "react";
import { expect, it } from "vitest";
import { AppShell } from "./AppShell";
import { createRenderer } from "./testing";

function slot(id: string, style: CSSProperties) {
    return <div data-testid={id} style={{ height: "100%", width: "100%", ...style }} />;
}

it("composes Happy's flat desktop shell with clamped navigation and inspector surfaces", async () => {
    const view = createRenderer().render(
        () => (
            <AppShell
                data-testid="shell"
                panel={slot("panel-slot", { background: "var(--colors-surface)" })}
                rail={slot("rail-slot", {
                    background: "var(--colors-header-background)",
                    width: "64px",
                })}
                sidebar={slot("sidebar-slot", {
                    background: "var(--colors-groupped-background)",
                    width: "100%",
                })}
                titleBar={slot("title-slot", {
                    background: "var(--colors-header-background)",
                    height: "56px",
                })}
            >
                {slot("workspace-slot", { background: "var(--colors-surface)" })}
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
                    background: "var(--colors-header-background)",
                    width: "64px",
                })}
                titleBar={slot("bare-title", {
                    background: "var(--colors-header-background)",
                    height: "56px",
                })}
            >
                {slot("bare-workspace", { background: "var(--colors-surface)" })}
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
