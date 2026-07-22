import { expect, it, vi } from "vitest";
import "./styles.css";
import { DesktopStartupScreen, type DesktopStartupValues } from "./DesktopStartupScreen";
import { createRenderer } from "./testing";

const cloudValues: DesktopStartupValues = {
    mode: "cloud",
    cloudUrl: "https://happy.example.com",
};

it("renders the two-mode cloud chooser inside a full-bleed Retina scrollport", async () => {
    const change = vi.fn();
    const submit = vi.fn();
    const view = createRenderer();
    view.render(
        () => (
            <DesktopStartupScreen
                onChange={change}
                onSubmit={submit}
                phase="choosing"
                values={cloudValues}
            />
        ),
        { width: 720, height: 720 },
    );
    await view.ready();

    expect(view.$('[data-happy2-ui="onboarding-screen"]').bounds()).toMatchObject({
        width: 720,
        height: 720,
    });
    expect(view.$('[data-happy2-ui="onboarding-card"]').bounds()).toMatchObject({
        width: 640,
        height: 600,
    });
    expect(
        view
            .$('[data-happy2-ui="onboarding-body"]')
            .computedStyles(["display", "margin", "overflow-y", "padding", "width"]),
    ).toEqual({
        display: "flex",
        margin: "0px",
        "overflow-y": "auto",
        padding: "0px",
        width: "558px",
    });
    expect(view.container.textContent).toContain("Where should Happy run?");
    expect(view.container.textContent).toContain("Local on this machine");
    expect(view.container.textContent).toContain("Connect to cloud");
    expect(view.container.textContent).not.toContain("Cloudflare");
    expect(view.container.textContent).not.toContain("Rig");
    // Exactly two mode cards; no rig or tunnel options remain.
    expect(view.container.querySelectorAll('[data-happy2-ui="setup-option"]')).toHaveLength(2);
    expect(
        Array.from(
            view.container.querySelectorAll<HTMLButtonElement>('[data-happy2-ui="setup-option"]'),
        )
            .filter((button) => button.hasAttribute("data-selected"))
            .map((button) => button.textContent),
    ).toEqual([expect.stringContaining("Connect to cloud")]);
    // Cloud mode reveals exactly one field: the HTTPS origin.
    const inputs = view.container.querySelectorAll("input");
    expect(inputs).toHaveLength(1);
    expect(inputs[0]!.value).toBe("https://happy.example.com");

    const local = Array.from(
        view.container.querySelectorAll<HTMLButtonElement>('[data-happy2-ui="setup-option"]'),
    ).find((button) => button.textContent?.includes("Local on this machine"));
    local?.click();
    expect(change).toHaveBeenCalledWith({ ...cloudValues, mode: "local" });
    const form = view.container.querySelector("form")!;
    form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
    expect(submit).toHaveBeenCalledOnce();

    await view.screenshot("DesktopStartupScreen.test");
});

it("keeps local mode fieldless and starting/error states in one stable card", async () => {
    const retry = vi.fn();
    const reset = vi.fn();
    const localValues: DesktopStartupValues = { mode: "local", cloudUrl: "" };
    const view = createRenderer();
    view.render(
        () => (
            <DesktopStartupScreen
                error="The local Happy server stopped before it was ready."
                onChange={() => undefined}
                onChangeMode={reset}
                onRetry={retry}
                onSubmit={() => undefined}
                phase="error"
                update={{ availableVersion: "0.0.19", status: "downloaded" }}
                values={localValues}
            />
        ),
        { width: 720, height: 480 },
    );
    await view.ready();

    expect(view.$('[data-happy2-ui="onboarding-card"]').bounds().width).toBe(640);
    expect(view.container.textContent).toContain("Happy couldn't start.");
    expect(view.container.textContent).toContain(
        "The local Happy server stopped before it was ready.",
    );
    const buttons = Array.from(view.container.querySelectorAll<HTMLButtonElement>("button"));
    buttons.find((button) => button.textContent === "Change mode")?.click();
    buttons.find((button) => button.textContent === "Try again")?.click();
    expect(reset).toHaveBeenCalledOnce();
    expect(retry).toHaveBeenCalledOnce();

    await view.screenshot("DesktopStartupScreen.states.test");
});

it("hides every field in local mode so a first launch needs no configuration", async () => {
    const localValues: DesktopStartupValues = { mode: "local", cloudUrl: "" };
    const view = createRenderer();
    view.render(
        () => (
            <DesktopStartupScreen
                onChange={() => undefined}
                onSubmit={() => undefined}
                phase="choosing"
                values={localValues}
            />
        ),
        { width: 720, height: 480 },
    );
    await view.ready();

    expect(view.container.querySelectorAll('[data-happy2-ui="setup-option"]')).toHaveLength(2);
    expect(view.container.querySelectorAll("input")).toHaveLength(0);
    expect(
        Array.from(
            view.container.querySelectorAll<HTMLButtonElement>('[data-happy2-ui="setup-option"]'),
        )
            .filter((button) => button.hasAttribute("data-selected"))
            .map((button) => button.textContent),
    ).toEqual([expect.stringContaining("Local on this machine")]);
    const submitButton = Array.from(
        view.container.querySelectorAll<HTMLButtonElement>('button[type="submit"]'),
    )[0]!;
    expect(submitButton.textContent).toBe("Start locally");
});
