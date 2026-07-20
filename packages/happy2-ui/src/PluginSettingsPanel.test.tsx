import { expect, it, vi } from "vitest";
import "./theme.css";
import "./styles/button.css";
import "./styles/switch.css";
import "./styles/badge.css";
import "./styles/empty-state.css";
import "./styles/plugin-settings.css";
import { PluginSettingsPanel, type PluginSettingsAppRow } from "./PluginSettingsPanel";
import { createRenderer } from "./testing";

const rows: readonly PluginSettingsAppRow[] = [
    {
        id: "inst-1",
        title: "TODO Lists",
        description: "Shared task lists",
        hidden: false,
        available: true,
        canMoveUp: false,
        canMoveDown: true,
    },
    {
        id: "inst-2",
        title: "Groceries",
        description: "Hidden from the sidebar",
        hidden: true,
        available: false,
        canMoveUp: true,
        canMoveDown: false,
    },
];

it("lists every visible instance with immediate hide/unhide and reorder controls", async () => {
    const onHiddenChange = vi.fn((_id: string, _hidden: boolean) => undefined);
    const onMoveUp = vi.fn((_id: string) => undefined);
    const onMoveDown = vi.fn((_id: string) => undefined);
    const view = createRenderer().render(
        () => (
            <PluginSettingsPanel
                apps={rows}
                data-testid="settings"
                onHiddenChange={onHiddenChange}
                onMoveDown={onMoveDown}
                onMoveUp={onMoveUp}
            />
        ),
        { width: 640, height: 360, padding: 16 },
    );
    const panel = view.$('[data-testid="settings"]');
    const listRows = panel.element.querySelectorAll("[data-happy2-ui='plugin-settings-row']");
    expect(listRows.length).toBe(2);
    // The hidden instance is still listed and flagged unavailable.
    expect(listRows[1]!.getAttribute("data-hidden")).toBe("");
    expect(listRows[1]!.textContent).toContain("UNAVAILABLE");
    // Toggling the visible instance's switch hides it (checked = shown).
    const shownSwitch = listRows[0]!.querySelector("[role=switch]") as HTMLButtonElement;
    expect(shownSwitch.getAttribute("aria-checked")).toBe("true");
    shownSwitch.click();
    expect(onHiddenChange).toHaveBeenCalledWith("inst-1", true);
    // The first row cannot move up; the last cannot move down.
    const upFirst = listRows[0]!.querySelector(
        "button[aria-label='Move TODO Lists up']",
    ) as HTMLButtonElement;
    const downLast = listRows[1]!.querySelector(
        "button[aria-label='Move Groceries down']",
    ) as HTMLButtonElement;
    expect(upFirst.disabled).toBe(true);
    expect(downLast.disabled).toBe(true);
    // The first row can move down.
    const downFirst = listRows[0]!.querySelector(
        "button[aria-label='Move TODO Lists down']",
    ) as HTMLButtonElement;
    downFirst.click();
    expect(onMoveDown).toHaveBeenCalledWith("inst-1");
    await view.screenshot("PluginSettingsPanel.test");
}, 120000);
