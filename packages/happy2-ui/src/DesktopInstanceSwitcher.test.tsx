import { expect, it, vi } from "vitest";
import { server } from "vitest/browser";
import "./styles.css";
import { DesktopInstanceSwitcher } from "./DesktopInstanceSwitcher";
import { createRenderer } from "./testing";

const targets = [
    { id: "local", kind: "local" as const, label: "This machine", detail: "Private loopback" },
    {
        id: "cloud:happy",
        kind: "cloud" as const,
        label: "Cloud",
        detail: "happy.example.com",
    },
];
const fontFamily = () =>
    server.browser === "webkit"
        ? "happy2 Figtree, system-ui, sans-serif"
        : '"happy2 Figtree", system-ui, sans-serif';

it("keeps local and cloud instance identity distinct and keyboard selectable", async () => {
    const select = vi.fn();
    const changeMode = vi.fn();
    const view = createRenderer();
    view.render(
        () => (
            <DesktopInstanceSwitcher
                activeTargetId="local"
                onChangeMode={changeMode}
                onTargetSelect={select}
                status={{ label: "Local server · two instances", tone: "success" }}
                targets={targets}
            />
        ),
        { width: 320, height: 96 },
    );
    await view.ready();

    const root = view.$('[data-happy2-ui="instance-switcher"]');
    expect(root.bounds()).toMatchObject({ width: 320, height: 89 });
    expect(
        root.computedStyles([
            "border-bottom-width",
            "display",
            "flex-direction",
            "font-family",
            "gap",
            "padding",
        ]),
    ).toEqual({
        "border-bottom-width": "1px",
        display: "flex",
        "flex-direction": "column",
        "font-family": fontFamily(),
        gap: "6px",
        padding: "0px 8px 8px",
    });

    const buttons = Array.from(
        view.container.querySelectorAll<HTMLButtonElement>(".happy2-instance-switcher__target"),
    );
    expect(buttons).toHaveLength(2);
    expect(buttons.map((button) => button.getAttribute("aria-pressed"))).toEqual(["true", "false"]);
    expect(buttons.map((button) => button.dataset.kind)).toEqual(["local", "cloud"]);
    expect(buttons.map((button) => button.textContent)).toEqual([
        expect.stringContaining("LOCAL"),
        expect.stringContaining("CLOUD"),
    ]);
    expect(
        view
            .$('[data-kind="local"] [data-happy2-ui="instance-switcher-target-icon"]')
            .computedStyles(["color"]),
    ).toEqual({ color: "rgb(43, 172, 204)" });
    expect(
        view
            .$('[data-kind="cloud"] [data-happy2-ui="instance-switcher-target-icon"]')
            .computedStyles(["color"]),
    ).toEqual({ color: "rgb(0, 122, 255)" });

    buttons[1]!.click();
    expect(select).toHaveBeenCalledWith("cloud:happy");
    buttons[0]!.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" }));
    expect(select).toHaveBeenLastCalledWith("cloud:happy");
    expect(document.activeElement).toBe(buttons[1]);
    (view.container.querySelector('button[data-happy2-ui="button"]') as HTMLButtonElement).click();
    expect(changeMode).toHaveBeenCalledOnce();

    await view.screenshot("DesktopInstanceSwitcher.test");
});

it("renders single-instance local and downloaded-update states without changing width", async () => {
    const install = vi.fn();
    const view = createRenderer();
    view.render(
        () => (
            <DesktopInstanceSwitcher
                activeTargetId="local"
                onChangeMode={() => undefined}
                onInstallUpdate={install}
                onTargetSelect={() => undefined}
                status={{ label: "Waiting for local server to start", tone: "warning" }}
                targets={targets.slice(0, 1)}
                update={{ availableVersion: "0.0.19", status: "downloaded" }}
            />
        ),
        { width: 320, height: 96 },
    );
    await view.ready();

    expect(view.$('[data-happy2-ui="instance-switcher"]').bounds().width).toBe(320);
    expect(view.container.querySelectorAll(".happy2-instance-switcher__target")).toHaveLength(1);
    expect(view.$('[data-happy2-ui="instance-switcher-status"]').element.textContent).toBe(
        "Happy 0.0.19 ready",
    );
    const installButton = Array.from(view.container.querySelectorAll("button")).find(
        (button) => button.textContent === "Install",
    );
    installButton?.click();
    expect(install).toHaveBeenCalledOnce();

    await view.screenshot("DesktopInstanceSwitcher.states.test");
});
