import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";
import "./theme.css";
import "./styles/banner.css";
import "./styles/button.css";
import "./styles/development-token-modal.css";
import "./styles/icon.css";
import "./styles/modal-overlay.css";
import "./styles/modal.css";
import "./styles/secret-reveal.css";
import { DevelopmentTokenModal } from "./DevelopmentTokenModal";
import { createRenderer } from "./testing";

function WindowFrame(props: { children: ReactNode }) {
    return (
        <div
            data-testid="frame"
            style={{
                background: "var(--happy2-bg-app)",
                height: "520px",
                overflow: "hidden",
                position: "relative",
                transform: "translateZ(0)",
                width: "720px",
            }}
        >
            {props.children}
        </div>
    );
}

it("hands off one session-bound development token in a controlled modal", async () => {
    const close = vi.fn();
    const copy = vi.fn();
    const toggle = vi.fn();
    const view = createRenderer();
    view.render(
        () => (
            <WindowFrame>
                <DevelopmentTokenModal
                    credential={{
                        token: "happy2_dev_visible_token",
                        sessionId: "session-1",
                        expiresAt: "2026-07-20T01:00:00.000Z",
                    }}
                    onClose={close}
                    onCopy={copy}
                    onToggleReveal={toggle}
                    revealed
                />
            </WindowFrame>
        ),
        { width: 760, height: 560, padding: 20 },
    );
    await view.ready();

    const overlay = view.$('[data-testid="development-token-modal"]');
    expect(overlay.bounds()).toMatchObject({ width: 720, height: 520 });
    expect(overlay.offsets()).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    const dialog = view.$(
        '[data-testid="development-token-modal"] [data-happy2-ui="modal-dialog"]',
    );
    expect(dialog.width()).toBe(480);
    expect(dialog.element.getAttribute("aria-label")).toBe("Development token created");

    const content = view.$('[data-happy2-ui="development-token-modal-content"]');
    expect(content.computedStyles(["display", "flex-direction", "gap", "width"])).toEqual({
        display: "flex",
        "flex-direction": "column",
        gap: "16px",
        width: "438px",
    });
    const description = view.$('[data-happy2-ui="development-token-modal-description"]');
    expect(description.computedStyles(["color", "font-size", "line-height", "margin-top"])).toEqual(
        {
            color: "rgb(142, 142, 147)",
            "font-size": "13px",
            "line-height": "20px",
            "margin-top": "0px",
        },
    );
    expect(view.container.textContent).toContain("happy2_dev_visible_token");
    expect(view.container.textContent).toContain("Jul 20, 2026");
    expect(view.container.textContent).toContain("UTC");

    overlay.element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    overlay.element.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    expect(close).not.toHaveBeenCalled();
    (view.container.querySelector('button[aria-label="Hide secret"]') as HTMLButtonElement).click();
    expect(toggle).toHaveBeenCalledTimes(1);
    Array.from(view.container.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent?.trim() === "Copy")!
        .click();
    expect(copy).toHaveBeenCalledTimes(1);
    (view.container.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
    expect(close).toHaveBeenCalledTimes(1);

    await view.screenshot("DevelopmentTokenModal.test");
}, 120000);
