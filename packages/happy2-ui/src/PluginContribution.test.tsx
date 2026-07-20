import { expect, it, vi } from "vitest";
import type {
    PluginButtonControl,
    PluginContributionActionValue,
    PluginInteractiveControl,
    PluginTextControl,
} from "happy2-state";
import "./theme.css";
import "./styles/button.css";
import "./styles/checkbox.css";
import "./styles/text-field.css";
import "./styles/plugin-contribution.css";
import { PluginContributionMenuButton, PluginContributionSection } from "./PluginContribution";
import { createRenderer } from "./testing";

const action = { toolName: "todos_toggle" } as const;

const controls: readonly (PluginInteractiveControl | PluginTextControl)[] = [
    { kind: "text", id: "note", title: "About", description: "", text: "Two lists shared." },
    {
        kind: "checkbox",
        id: "notify",
        title: "Notify me",
        description: "On new items",
        checked: true,
        action,
    },
    {
        kind: "checkboxGroup",
        id: "days",
        title: "Digest days",
        description: "When to summarize",
        options: [
            { id: "mon", title: "Monday", description: "" },
            { id: "fri", title: "Friday", description: "" },
        ],
        selectedOptionIds: ["mon"],
        action,
    },
    {
        kind: "input",
        id: "alias",
        title: "Alias",
        description: "Shown to teammates",
        value: "Sam",
        action,
    },
];

it("renders a native contribution section with accessible typed controls", async () => {
    const invoke = vi.fn((_actionId: string, _value?: PluginContributionActionValue) => undefined);
    const view = createRenderer().render(
        () => (
            <PluginContributionSection
                controls={controls}
                data-testid="section"
                description="From the TODOs plugin"
                onInvoke={invoke}
                title="Collaborative TODOs"
            />
        ),
        { width: 420, height: 420, padding: 16 },
    );
    const section = view.$('[data-testid="section"]');
    expect(section.element.getAttribute("data-happy2-ui")).toBe("plugin-section");
    // Text control shows its title and plain copy, never plugin markup.
    expect(section.element.textContent).toContain("Two lists shared.");
    // The checkbox reflects the authoritative value and invokes on toggle.
    const checkbox = section.element.querySelector(
        "input[type=checkbox][aria-label='Notify me']",
    ) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    checkbox.click();
    expect(invoke).toHaveBeenCalledWith("notify", false);
    // The input commits its edited draft on submit.
    const input = section.element.querySelector(".happy2-text-field__input") as HTMLInputElement;
    expect(input.value).toBe("Sam");
    await view.screenshot("PluginContribution.test");
}, 120000);

it("opens a static menu contribution and invokes the chosen item", async () => {
    const items: readonly PluginButtonControl[] = [
        {
            kind: "button",
            id: "archive",
            title: "Archive",
            description: "Archive list",
            assetId: "a1",
            action,
        },
        {
            kind: "button",
            id: "clear",
            title: "Clear done",
            description: "Remove completed",
            assetId: "a2",
            action,
        },
    ];
    const invoke = vi.fn((_actionId: string) => undefined);
    const view = createRenderer().render(
        () => (
            <PluginContributionMenuButton
                actionId="list-menu"
                data-testid="menu"
                description="List actions"
                items={items}
                kind="staticMenu"
                onInvoke={invoke}
                title="Actions"
            />
        ),
        { width: 260, height: 220, padding: 16 },
    );
    const menu = view.$('[data-testid="menu"]');
    expect(menu.element.querySelector("[role=menu]")).toBeNull();
    (menu.element.querySelector("button") as HTMLButtonElement).click();
    await vi.waitFor(() => expect(menu.element.querySelector("[role=menu]")).not.toBeNull());
    const menuItems = menu.element.querySelectorAll("[role=menuitem]");
    expect(menuItems.length).toBe(2);
    (menuItems[1] as HTMLButtonElement).click();
    expect(invoke).toHaveBeenCalledWith("clear");
    await view.screenshot("PluginContribution.menu.test");
}, 120000);
