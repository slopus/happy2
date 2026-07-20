import { expect, it } from "vitest";
import "./theme.css";
import "./styles/icon.css";
import "./styles/button.css";
import "./styles/banner.css";
import "./styles/modal.css";
import "./styles/plugin-install-dialog.css";
import { PluginUninstallDialog } from "./PluginUninstallDialog";
import { createRenderer } from "./testing";

it("confirms the destructive uninstall with its full blast radius, pending, and failure states", async () => {
    const confirmed: number[] = [];
    const cancelled: number[] = [];
    const view = createRenderer()
        .render(
            () => (
                <div
                    style={{
                        width: "560px",
                        height: "340px",
                        background: "#f5f5f5",
                        display: "flex",
                    }}
                >
                    <PluginUninstallDialog
                        data-testid="confirm"
                        installationVersion="2.1.0"
                        onCancel={() => cancelled.push(1)}
                        onConfirm={() => confirmed.push(1)}
                        pluginName="Project Search"
                        sourceLabel="GitHub"
                    />
                </div>
            ),
            { width: 560, height: 340 },
        )
        .render(
            () => (
                <div
                    style={{
                        width: "560px",
                        height: "340px",
                        background: "#f5f5f5",
                        display: "flex",
                    }}
                >
                    <PluginUninstallDialog
                        data-testid="pending"
                        installationVersion="2.0.0"
                        lastInstallation
                        onCancel={() => undefined}
                        onConfirm={() => undefined}
                        pending
                        pluginName="Linked Tools"
                        sourceLabel="ZIP URL"
                    />
                </div>
            ),
            { width: 560, height: 340 },
        )
        .render(
            () => (
                <div
                    style={{
                        width: "560px",
                        height: "400px",
                        background: "#f5f5f5",
                        display: "flex",
                    }}
                >
                    <PluginUninstallDialog
                        data-testid="failed"
                        error="Plugin installation was not found"
                        installationVersion="1.2.0"
                        onCancel={() => undefined}
                        onConfirm={() => confirmed.push(2)}
                        pluginName="Uploaded Tools"
                        sourceLabel="Uploaded ZIP"
                    />
                </div>
            ),
            { width: 560, height: 400 },
        );
    await view.ready();

    // Confirmations use the small 360px danger modal.
    const dialog = view.$('[data-testid="confirm"] [data-happy2-ui="modal-dialog"]');
    expect(dialog.bounds().width).toBe(360);
    expect(dialog.element.getAttribute("data-tone")).toBe("danger");

    // The copy names the plugin, its source, the exact installation version, and
    // every class of destroyed data including persistent /workspace contents. It
    // also states that other installations of the plugin are left in place.
    const message = view.$('[data-testid="confirm"] [data-happy2-ui="plugin-uninstall-message"]');
    expect(message.element.textContent).toContain("v2.1.0 installation of Project Search");
    expect(message.element.textContent).toContain("(GitHub)");
    expect(message.element.textContent).toContain("dedicated container");
    expect(message.element.textContent).toContain("configured secrets");
    expect(message.element.textContent).toContain("/workspace");
    expect(message.element.textContent).toContain("left in place");
    expect(message.element.textContent).toContain("cannot be undone");
    // The last installation removes the plugin and its stored package too.
    expect(
        view.$('[data-testid="pending"] [data-happy2-ui="plugin-uninstall-message"]').element
            .textContent,
    ).toContain("last installation");

    // The destructive action is the danger variant and routes the callback;
    // cancel stays a ghost action.
    const confirm = view.container.querySelector<HTMLButtonElement>(
        '[data-testid="confirm"] [data-testid="plugin-uninstall-confirm"]',
    )!;
    expect(confirm.getAttribute("data-variant")).toBe("danger");
    confirm.click();
    expect(confirmed).toEqual([1]);
    const footerButtons = Array.from(
        view.container.querySelectorAll<HTMLButtonElement>(
            '[data-testid="confirm"] [data-happy2-ui="modal-footer"] button',
        ),
    );
    footerButtons.find((button) => button.textContent === "Cancel")!.click();
    expect(cancelled).toEqual([1]);

    // While the uninstall is in flight both actions disable, the header close
    // affordance is absent, and the action label shows progress.
    const pendingConfirm = view.container.querySelector<HTMLButtonElement>(
        '[data-testid="pending"] [data-testid="plugin-uninstall-confirm"]',
    )!;
    expect(pendingConfirm.disabled).toBe(true);
    expect(pendingConfirm.textContent).toContain("Uninstalling…");
    expect(
        Array.from(
            view.container.querySelectorAll<HTMLButtonElement>(
                '[data-testid="pending"] [data-happy2-ui="modal-footer"] button',
            ),
        ).every((button) => button.disabled),
    ).toBe(true);
    expect(view.container.querySelector('[data-testid="pending"] .happy2-modal__close')).toBeNull();
    expect(
        view.container.querySelector('[data-testid="confirm"] .happy2-modal__close'),
    ).not.toBeNull();

    // A terminal failure renders a danger banner above the message for retry.
    expect(
        view.$('[data-testid="failed"] [data-testid="plugin-uninstall-error"]').element.textContent,
    ).toContain("Plugin installation was not found");
    view.container
        .querySelector<HTMLButtonElement>(
            '[data-testid="failed"] [data-testid="plugin-uninstall-confirm"]',
        )!
        .click();
    expect(confirmed).toEqual([1, 2]);

    await view.screenshot("PluginUninstallDialog.test");
}, 120_000);
