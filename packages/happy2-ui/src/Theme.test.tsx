import { expect, it } from "vitest";
import "./styles.css";
import { AppShell } from "./AppShell";
import { Button } from "./Button";
import { WindowDragRegion } from "./TitleBar";
import { createRenderer } from "./testing";

function shell(theme: "light" | "dark") {
    return (
        <div className={`happy2-theme-${theme}`} style={{ height: "100%", width: "100%" }}>
            <AppShell
                data-testid={`${theme}-shell`}
                rail={<div />}
                titleBar={<WindowDragRegion data-testid={`${theme}-drag`} />}
            >
                <Button data-testid={`${theme}-primary`} variant="primary">
                    Continue
                </Button>
            </AppShell>
        </div>
    );
}

it("follows Happy's light and dark system palettes through shared component tokens", async () => {
    const view = createRenderer()
        .render(() => shell("light"), { height: 800, width: 1280 })
        .render(() => shell("dark"), { height: 800, width: 1280 });

    await view.ready();

    expect(
        view.$('[data-testid="light-shell"]').computedStyles(["background-color", "color"]),
    ).toEqual({
        "background-color": "rgb(255, 255, 255)",
        color: "rgb(0, 0, 0)",
    });
    expect(
        view.$('[data-testid="dark-shell"]').computedStyles(["background-color", "color"]),
    ).toEqual({
        "background-color": "rgb(24, 23, 28)",
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
        "background-color": "rgb(255, 255, 255)",
        color: "rgb(0, 0, 0)",
    });
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
