import { expect, it } from "vitest";
import "./styles.css";
import { AppShell } from "./AppShell";
import { Button } from "./Button";
import { ThemeScope } from "./ThemeScope";
import { WindowDragRegion } from "./TitleBar";
import { createRenderer } from "./testing";

function shell(theme: "light" | "dark") {
    return (
        <ThemeScope mode={theme}>
            <AppShell
                data-testid={`${theme}-shell`}
                rail={<div />}
                titleBar={<WindowDragRegion data-testid={`${theme}-drag`} />}
            >
                <Button data-testid={`${theme}-primary`} variant="primary">
                    Continue
                </Button>
            </AppShell>
        </ThemeScope>
    );
}

it("follows Happy's light and dark system palettes through shared component tokens", async () => {
    const view = createRenderer()
        .render(() => shell("light"), { height: 800, width: 1280 })
        .render(() => shell("dark"), { height: 800, width: 1280 });

    await view.ready();

    for (const theme of ["light", "dark"] as const) {
        const scope = view.$(`[data-happy2-ui="theme-scope"].happy2-theme-${theme}`);
        expect(scope.computedStyle("display")).toBe("contents");
    }

    expect(
        view.$('[data-testid="light-shell"]').computedStyles(["background-color", "color"]),
    ).toEqual({
        "background-color": "rgb(255, 255, 255)",
        // AppShell follows Happy's header tint rather than the generic text
        // role: #18171C is the exact light desktop-shell ink source value.
        color: "rgb(24, 23, 28)",
    });
    expect(
        view.$('[data-testid="dark-shell"]').computedStyles(["background-color", "color"]),
    ).toEqual({
        "background-color": "rgb(33, 33, 33)",
        color: "rgb(255, 255, 255)",
    });
    expect(
        view.$('[data-testid="light-primary"]').computedStyles(["background-color", "color"]),
    ).toEqual({
        "background-color": "rgb(0, 0, 0)",
        color: "rgb(255, 255, 255)",
    });
    expect(
        view.$('[data-testid="dark-primary"]').computedStyles(["background-color", "color"]),
    ).toEqual({
        "background-color": "rgb(0, 0, 0)",
        color: "rgb(255, 255, 255)",
    });
});

it("exposes Happy's direct light and dark color roles without a derived base palette", async () => {
    const view = createRenderer()
        .render(() => shell("light"), { height: 800, width: 1280 })
        .render(() => shell("dark"), { height: 800, width: 1280 });
    await view.ready();

    const light = view.$('[data-happy2-ui="theme-scope"].happy2-theme-light');
    expect(light.computedStyle("--text")).toBe("#000000");
    expect(light.computedStyle("--text-link")).toBe("#2baccc");
    expect(light.computedStyle("--surface")).toBe("#ffffff");
    expect(light.computedStyle("--surface-high")).toBe("#f8f8f8");
    expect(light.computedStyle("--surface-pressed")).toBe("#f0f0f2");
    expect(light.computedStyle("--groupped-background")).toBe("#f2f2f7");
    expect(light.computedStyle("--radio-active")).toBe("#007aff");
    expect(light.computedStyle("--button-primary-background")).toBe("#000000");
    expect(light.computedStyle("--user-message-background")).toBe("#f0eee6");

    const dark = view.$('[data-happy2-ui="theme-scope"].happy2-theme-dark');
    expect(dark.computedStyle("--text")).toBe("#ffffff");
    expect(dark.computedStyle("--text-link")).toBe("#2baccc");
    expect(dark.computedStyle("--surface")).toBe("#18171c");
    expect(dark.computedStyle("--surface-high")).toBe("#2c2c2e");
    expect(dark.computedStyle("--surface-pressed")).toBe("#2c2c2e");
    expect(dark.computedStyle("--groupped-background")).toBe("#1c1c1e");
    expect(dark.computedStyle("--radio-active")).toBe("#0a84ff");
    expect(dark.computedStyle("--button-primary-background")).toBe("#000000");
    expect(dark.computedStyle("--user-message-background")).toBe("#2c2c2e");
});

it("keeps Happy's native desktop dimensions at the shared component boundary", async () => {
    const view = createRenderer().render(() => shell("light"), { height: 800, width: 1280 });
    await view.ready();

    expect(
        view.$('[data-testid="light-shell"]').computedStyles(["min-height", "min-width"]),
    ).toEqual({
        "min-height": "480px",
        "min-width": "720px",
    });
    expect(view.$('[data-testid="light-drag"]').bounds().height).toBe(56);
    expect(view.$('[data-testid="light-primary"]').computedStyle("height")).toBe("36px");
});
