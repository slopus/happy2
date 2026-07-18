import { useState } from "react";
import { expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import "./theme.css";
import "./styles/avatar.css";
import "./styles/badge.css";
import "./styles/button.css";
import "./styles/composer.css";
import "./styles/icon.css";
import "./styles/menu.css";
import "./styles/segmented-control.css";
import "./styles/audience-toggle.css";
import { Composer, type ComposerAgent, type Mentionable } from "./Composer";
import type { AudienceValue } from "./AudienceToggle";
import { createRenderer } from "./testing";

const defaultAgent: ComposerAgent = { id: "happy", initials: "HP", name: "Happy", tone: "violet" };
const agentOptions: ComposerAgent[] = [
    { id: "codex", initials: "CX", name: "Codex", tone: "mint" },
    { id: "claude", initials: "CL", name: "Claude", tone: "violet" },
];
const mentions: Mentionable[] = [
    { id: "codex", initials: "CX", name: "Codex", tone: "mint" },
    { id: "ada", initials: "AL", name: "Ada", tone: "amber" },
];

function Harness(props: {
    audience?: AudienceValue;
    onAudienceChange?: (value: AudienceValue) => void;
    testid: string;
    withEmoji?: boolean;
    withMentions?: boolean;
}) {
    const [value, setValue] = useState("");
    const [audience, setAudience] = useState<AudienceValue | undefined>(props.audience);
    const [selected, setSelected] = useState<string[]>([]);
    return (
        <Composer
            agentOptions={agentOptions}
            audience={audience}
            data-testid={props.testid}
            defaultAgent={defaultAgent}
            emoji={props.withEmoji ? [{ char: "✅", id: "check", name: "check" }] : undefined}
            mentions={props.withMentions ? mentions : undefined}
            onAgentAdd={(id) => setSelected((current) => [...current, id])}
            onAgentRemove={(id) => setSelected((current) => current.filter((item) => item !== id))}
            onAudienceChange={(next) => {
                props.onAudienceChange?.(next);
                setAudience(next);
            }}
            onSend={() => {}}
            onValueChange={setValue}
            selectedAgentIds={selected}
            value={value}
        />
    );
}

it("flips the audience on Shift+Tab, keeps focus, draft, and textarea identity", async () => {
    const changes: AudienceValue[] = [];
    const view = createRenderer().render(
        () => (
            <Harness
                audience="people"
                onAudienceChange={(value) => changes.push(value)}
                testid="composer-shift-tab"
            />
        ),
        { width: 620, height: 260, padding: 20 },
    );
    await view.ready();
    const textarea = view.$(
        '[data-testid="composer-shift-tab"] [data-happy2-ui="composer-textarea"]',
    ).element as HTMLTextAreaElement;
    const toggleValue = () =>
        view.container
            .querySelector('[data-testid="composer-shift-tab"] [data-happy2-ui="audience-toggle"]')
            ?.getAttribute("data-value");
    const agentsRow = () =>
        view.container.querySelector(
            '[data-testid="composer-shift-tab"] [data-happy2-ui="composer-agents"]',
        );
    await userEvent.click(textarea);
    await userEvent.keyboard("hello team");
    expect(toggleValue()).toBe("people");
    expect(agentsRow()).toBeNull();
    await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
    expect(changes).toEqual(["agents"]);
    expect(toggleValue()).toBe("agents");
    // The agents row appears; the textarea keeps its DOM node, focus, and draft.
    expect(agentsRow()).not.toBeNull();
    const currentTextarea = view.$(
        '[data-testid="composer-shift-tab"] [data-happy2-ui="composer-textarea"]',
    ).element;
    expect(currentTextarea).toBe(textarea);
    expect(document.activeElement).toBe(textarea);
    expect(textarea.value).toBe("hello team");
    // The default agent is visible without typing any mention.
    expect(
        view.container.querySelector(
            '[data-testid="composer-shift-tab"] [data-happy2-ui="composer-agent-chip"][data-default]',
        )?.textContent,
    ).toContain("Happy");
    await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
    expect(changes).toEqual(["agents", "people"]);
    expect(agentsRow()).toBeNull();
    expect(document.activeElement).toBe(textarea);
    // A composing (IME) Shift+Tab is never intercepted.
    textarea.dispatchEvent(
        new KeyboardEvent("keydown", {
            bubbles: true,
            cancelable: true,
            isComposing: true,
            key: "Tab",
            shiftKey: true,
        }),
    );
    expect(changes).toEqual(["agents", "people"]);
    // Let the shared SegmentedControl's 160ms pill transition settle before
    // the renderer audits nested-corner geometry and captures the specimen.
    await new Promise((resolve) => setTimeout(resolve, 200));
    await view.screenshot("Composer.audience.test");
});

it("keeps plain Tab mention selection working and lets Shift+Tab through the picker", async () => {
    const view = createRenderer().render(
        () => <Harness audience="people" testid="composer-mention-tab" withMentions />,
        { width: 620, height: 320, padding: 20 },
    );
    await view.ready();
    const textarea = view.$(
        '[data-testid="composer-mention-tab"] [data-happy2-ui="composer-textarea"]',
    ).element as HTMLTextAreaElement;
    const popover = () =>
        view.container.querySelector(
            '[data-testid="composer-mention-tab"] [data-happy2-ui="composer-popover"]',
        );
    const toggleValue = () =>
        view.container
            .querySelector(
                '[data-testid="composer-mention-tab"] [data-happy2-ui="audience-toggle"]',
            )
            ?.getAttribute("data-value");
    await userEvent.click(textarea);
    await userEvent.keyboard("@cod");
    expect(popover()).not.toBeNull();
    await userEvent.keyboard("{Tab}");
    expect(textarea.value).toBe("@Codex ");
    expect(popover()).toBeNull();
    expect(toggleValue()).toBe("people");
    // With the picker open, Shift+Tab still switches the audience.
    await userEvent.keyboard("@");
    expect(popover()).not.toBeNull();
    await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
    expect(toggleValue()).toBe("agents");
    expect(document.activeElement).toBe(textarea);
});

it("does not intercept Shift+Tab when the composer has no audience routing", async () => {
    const changes: AudienceValue[] = [];
    const view = createRenderer().render(
        () => (
            <div>
                <button data-testid="before" type="button">
                    before
                </button>
                <Composer
                    data-testid="composer-no-audience"
                    onSend={() => {}}
                    onValueChange={() => {}}
                    value=""
                />
            </div>
        ),
        { width: 620, height: 220, padding: 20 },
    );
    await view.ready();
    const textarea = view.$(
        '[data-testid="composer-no-audience"] [data-happy2-ui="composer-textarea"]',
    ).element as HTMLTextAreaElement;
    await userEvent.click(textarea);
    await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
    expect(changes).toEqual([]);
    expect(document.activeElement).not.toBe(textarea);
});

it("keeps the audience and capability actions inside a panel-constrained composer", async () => {
    const view = createRenderer().render(
        () => (
            <Composer
                audience="people"
                data-testid="composer-compact"
                emoji={[{ char: "✅", id: "check", name: "check" }]}
                hint="Enter to send · Shift+Tab to switch audience"
                mentions={mentions}
                onAttachFile={() => undefined}
                onAudienceChange={() => undefined}
                onSend={() => undefined}
                onValueChange={() => undefined}
                value=""
            />
        ),
        { width: 340, height: 180, padding: 20 },
    );
    await view.ready();
    const composer = view.$('[data-testid="composer-compact"]');
    const toggle = view.$('[data-testid="composer-compact"] [data-happy2-ui="segmented-control"]');
    expect(toggle.bounds().width).toBe(120);
    expect(
        view
            .$('[data-testid="composer-compact"] [data-happy2-ui="segmented-control-icon"]')
            .computedStyle("display"),
    ).toBe("none");
    expect(
        view
            .$('[data-testid="composer-compact"] [data-happy2-ui="composer-hint"]')
            .computedStyle("display"),
    ).toBe("none");
    expect((composer.element as HTMLElement).scrollWidth).toBe(
        (composer.element as HTMLElement).clientWidth,
    );
    await view.screenshot("Composer.compact-audience.test");
});

it("adds and removes additional agents through the picker while keeping chip identity", async () => {
    const view = createRenderer().render(
        () => <Harness audience="agents" testid="composer-agents" />,
        { width: 620, height: 320, padding: 20 },
    );
    await view.ready();
    const chip = (id: string) =>
        view.container.querySelector(
            `[data-testid="composer-agents"] [data-happy2-ui="composer-agent-chip"][data-agent-id="${id}"]`,
        );
    const addButton = () =>
        view.container.querySelector<HTMLButtonElement>(
            '[data-testid="composer-agents"] [aria-label="Add agent"]',
        )!;
    const menuItems = () =>
        Array.from(
            view.container.querySelectorAll<HTMLButtonElement>(
                '[data-testid="composer-agents"] [data-happy2-ui="composer-agent-popover"] [role="menuitem"]',
            ),
        );
    expect(chip("happy")).not.toBeNull();
    await userEvent.click(addButton());
    expect(menuItems().map((item) => item.textContent)).toEqual(["Codex", "Claude"]);
    await userEvent.click(menuItems()[0]!);
    expect(chip("codex")).not.toBeNull();
    const codexChip = chip("codex");
    await userEvent.click(addButton());
    expect(menuItems().map((item) => item.textContent)).toEqual(["Claude"]);
    await userEvent.click(menuItems()[0]!);
    expect(chip("claude")).not.toBeNull();
    // Adding Claude must not replace Codex's chip DOM node.
    expect(chip("codex")).toBe(codexChip);
    // The picker hides once every option is selected.
    expect(
        view.container.querySelector('[data-testid="composer-agents"] [aria-label="Add agent"]'),
    ).toBeNull();
    const removeCodex = codexChip!.querySelector<HTMLButtonElement>(
        '[data-happy2-ui="composer-agent-remove"]',
    )!;
    await userEvent.click(removeCodex);
    expect(chip("codex")).toBeNull();
    expect(chip("claude")).not.toBeNull();
    expect(chip("happy")).not.toBeNull();
    await view.screenshot("Composer.agents.test");
});

it("keeps only one agent, mention, or emoji picker open", async () => {
    const view = createRenderer().render(
        () => (
            <Harness audience="agents" testid="composer-exclusive-pickers" withEmoji withMentions />
        ),
        { width: 620, height: 320, padding: 20 },
    );
    await view.ready();
    const agentPicker = () =>
        view.container.querySelector(
            '[data-testid="composer-exclusive-pickers"] [data-happy2-ui="composer-agent-popover"]',
        );
    await userEvent.click(
        view.container.querySelector<HTMLButtonElement>(
            '[data-testid="composer-exclusive-pickers"] [aria-label="Add agent"]',
        )!,
    );
    expect(agentPicker()).not.toBeNull();
    view.container
        .querySelector<HTMLButtonElement>(
            '[data-testid="composer-exclusive-pickers"] [aria-label="Mention someone"]',
        )!
        .click();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(agentPicker()).toBeNull();
    expect(
        view.container.querySelector(
            '[data-testid="composer-exclusive-pickers"] [data-happy2-ui="composer-popover"]',
        ),
    ).not.toBeNull();
    view.container
        .querySelector<HTMLButtonElement>(
            '[data-testid="composer-exclusive-pickers"] [aria-label="Add agent"]',
        )!
        .click();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(agentPicker()).not.toBeNull();
    view.container
        .querySelector<HTMLButtonElement>(
            '[data-testid="composer-exclusive-pickers"] [aria-label="Add emoji"]',
        )!
        .click();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(agentPicker()).toBeNull();
    expect(
        view.container.querySelector(
            '[data-testid="composer-exclusive-pickers"] [data-happy2-ui="composer-emoji-popover"]',
        ),
    ).not.toBeNull();
});
