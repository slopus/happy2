import { expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import "./styles.css";
import { RigInstallScreen } from "./RigInstallScreen";
import { createRenderer } from "./testing";

it("shows the immutable install command and waits for explicit confirmation", async () => {
    const confirm = vi.fn();
    const changeMode = vi.fn();
    const view = createRenderer().render(
        () => (
            <RigInstallScreen
                command="npm install --global @slopus/rig"
                onChangeMode={changeMode}
                onConfirm={confirm}
                onInput={() => undefined}
                onResize={() => undefined}
                onRetry={() => undefined}
                output=""
                status="awaitingConfirmation"
            />
        ),
        { width: 720, height: 600 },
    );
    await view.ready();

    expect(view.$('[data-happy2-ui="onboarding-screen"]').bounds()).toMatchObject({
        width: 720,
        height: 600,
    });
    expect(view.container.querySelectorAll("input")).toHaveLength(0);
    expect(view.$('[data-happy2-ui="rig-install-command"]').element.textContent).toContain(
        "npm install --global @slopus/rig",
    );
    const buttons = Array.from(view.container.querySelectorAll<HTMLButtonElement>("button"));
    await userEvent.click(buttons.find((button) => button.textContent === "Install Rig")!);
    await userEvent.click(buttons.find((button) => button.textContent === "Change connection")!);
    expect(confirm).toHaveBeenCalledOnce();
    expect(changeMode).toHaveBeenCalledOnce();

    await view.screenshot("RigInstallScreen.test");
});

it("keeps interactive PTY output visible and strips terminal control sequences", async () => {
    const input = vi.fn();
    const retry = vi.fn();
    const view = createRenderer().render(
        () => (
            <RigInstallScreen
                command="npm install --global @slopus/rig"
                error="npm exited with status 1."
                exitCode={1}
                onChangeMode={() => undefined}
                onConfirm={() => undefined}
                onInput={input}
                onResize={() => undefined}
                onRetry={retry}
                output={"\u001b[31mnpm error\u001b[0m permission denied\n"}
                status="exited"
                verified={false}
            />
        ),
        { width: 720, height: 600 },
    );
    await view.ready();

    const output = view.$('[data-happy2-ui="rig-install-output"]');
    expect(output.element.textContent).toBe("npm error permission denied\n");
    expect(output.computedStyles(["font-family", "white-space"])["white-space"]).toBe("pre-wrap");
    expect(view.container.querySelector("textarea")).toBeNull();
    await userEvent.click(view.$('[data-happy2-ui="rig-install-terminal"]').element);
    await userEvent.keyboard("y");
    const retryButton = Array.from(
        view.container.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent === "Try again")!;
    await userEvent.click(retryButton);
    expect(retry).toHaveBeenCalledOnce();
    expect(input).not.toHaveBeenCalled();

    await view.screenshot("RigInstallScreen.states.test");
});
