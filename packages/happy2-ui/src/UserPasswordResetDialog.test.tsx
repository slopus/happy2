import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";
import "./theme.css";
import "./styles/banner.css";
import "./styles/button.css";
import "./styles/icon.css";
import "./styles/modal-overlay.css";
import "./styles/modal.css";
import "./styles/secret-reveal.css";
import "./styles/user-password-reset-dialog.css";
import { createRenderer } from "./testing";
import { UserPasswordResetDialog } from "./UserPasswordResetDialog";

function WindowFrame(props: { children: ReactNode }) {
    return (
        <div
            data-testid="frame"
            style={{
                background: "var(--groupped-background)",
                height: "600px",
                overflow: "hidden",
                position: "relative",
                transform: "translateZ(0)",
                width: "760px",
            }}
        >
            {props.children}
        </div>
    );
}

it("shows a client-generated password and routes every preflight action", async () => {
    const close = vi.fn();
    const copy = vi.fn();
    const regenerate = vi.fn();
    const submit = vi.fn();
    const toggle = vi.fn();
    const view = createRenderer();
    view.render(
        () => (
            <WindowFrame>
                <UserPasswordResetDialog
                    displayName="Ada Lovelace"
                    onClose={close}
                    onCopy={copy}
                    onRegenerate={regenerate}
                    onSubmit={submit}
                    onToggleReveal={toggle}
                    password="R8!mQ2#vT7-pL4@xK9_w"
                    revealed
                    status="ready"
                    username="ada"
                />
            </WindowFrame>
        ),
        { width: 800, height: 640, padding: 20 },
    );
    await view.ready();

    const overlay = view.$('[data-testid="password-reset"]');
    expect(overlay.bounds()).toMatchObject({ width: 760, height: 600 });
    expect(overlay.offsets()).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    const dialog = view.$('[data-happy2-ui="modal-dialog"]');
    expect(dialog.width()).toBe(480);
    expect(dialog.element.getAttribute("aria-label")).toBe("Reset user password");

    const content = view.$('[data-happy2-ui="user-password-reset-dialog-content"]');
    expect(content.computedStyles(["display", "flex-direction", "gap", "width"])).toEqual({
        display: "flex",
        "flex-direction": "column",
        gap: "16px",
        width: "438px",
    });
    const description = view.$('[data-happy2-ui="user-password-reset-dialog-description"]');
    expect(description.computedStyles(["color", "font-size", "line-height", "margin-top"])).toEqual(
        {
            color: "rgb(142, 142, 147)",
            "font-size": "13px",
            "line-height": "20px",
            "margin-top": "0px",
        },
    );
    expect(view.container.textContent).toContain("Ada Lovelace");
    expect(view.container.textContent).toContain("@ada");
    expect(view.container.textContent).toContain("R8!mQ2#vT7-pL4@xK9_w");
    expect(view.container.textContent).toContain("signs the user out of every existing session");

    (view.container.querySelector('button[aria-label="Hide secret"]') as HTMLButtonElement).click();
    Array.from(view.container.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent?.trim() === "Copy")!
        .click();
    Array.from(view.container.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent?.trim() === "Generate another")!
        .click();
    Array.from(view.container.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent?.trim() === "Reset password")!
        .click();
    (view.container.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(copy).toHaveBeenCalledTimes(1);
    expect(regenerate).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);

    await view.screenshot("UserPasswordResetDialog.test");
}, 120000);

it("locks submission controls while pending and presents the session cutoff after success", async () => {
    const close = vi.fn();
    const common = {
        displayName: "Grace Hopper",
        username: "grace",
        password: "M4#xN8!pR2_vT7@kQ6-w",
        onClose: close,
        onCopy: vi.fn(),
        onRegenerate: vi.fn(),
        onSubmit: vi.fn(),
        onToggleReveal: vi.fn(),
    } as const;
    const view = createRenderer();
    view.render(
        () => (
            <WindowFrame>
                <UserPasswordResetDialog {...common} revealed status="submitting" />
            </WindowFrame>
        ),
        { width: 800, height: 640, padding: 20 },
    );
    view.render(
        () => (
            <WindowFrame>
                <UserPasswordResetDialog
                    {...common}
                    copied
                    revealed
                    revokedSessionCount={2}
                    status="succeeded"
                />
            </WindowFrame>
        ),
        { width: 800, height: 640, padding: 20 },
    );
    await view.ready();

    const frames = Array.from(
        view.container.querySelectorAll<HTMLElement>('[data-testid="frame"]'),
    );
    expect(frames).toHaveLength(2);
    const pendingButtons = Array.from(frames[0]!.querySelectorAll<HTMLButtonElement>("button"));
    expect(
        pendingButtons
            .filter((button) =>
                ["Cancel", "Generate another", "Resetting…"].includes(
                    button.textContent?.trim() ?? "",
                ),
            )
            .every((button) => button.disabled),
    ).toBe(true);
    expect(frames[0]!.querySelector('button[aria-label="Close"]')).toBeNull();

    expect(frames[1]!.textContent).toContain("Password reset");
    expect(frames[1]!.textContent).toContain("2 active sessions were revoked");
    expect(frames[1]!.textContent).toContain("will not be shown again");
    expect(
        Array.from(frames[1]!.querySelectorAll<HTMLButtonElement>("button")).map((button) =>
            button.textContent?.trim(),
        ),
    ).toEqual(["", "", "Copied", "Done"]);
}, 120000);
