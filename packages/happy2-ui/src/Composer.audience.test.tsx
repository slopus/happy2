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
import { Composer, type Mentionable } from "./Composer";
import type { AudienceValue } from "./AudienceToggle";
import { createRenderer } from "./testing";

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
    return (
        <Composer
            audience={audience}
            data-testid={props.testid}
            emoji={props.withEmoji ? [{ char: "✅", id: "check", name: "check" }] : undefined}
            mentions={props.withMentions ? mentions : undefined}
            onAudienceChange={(next) => {
                props.onAudienceChange?.(next);
                setAudience(next);
            }}
            onSend={() => {}}
            onValueChange={setValue}
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
    const card = () => view.$('[data-testid="composer-shift-tab"]').element as HTMLElement;
    await userEvent.click(textarea);
    await userEvent.keyboard("hello team");
    expect(toggleValue()).toBe("people");
    expect(card().hasAttribute("data-agents")).toBe(false);
    await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
    expect(changes).toEqual(["agents"]);
    expect(toggleValue()).toBe("agents");
    // Agents mode marks the whole card; the textarea keeps its DOM node,
    // focus, and draft. No chip row is added above the input.
    expect(card().hasAttribute("data-agents")).toBe(true);
    expect(
        view.container.querySelector(
            '[data-testid="composer-shift-tab"] [data-happy2-ui="composer-agents"]',
        ),
    ).toBeNull();
    const currentTextarea = view.$(
        '[data-testid="composer-shift-tab"] [data-happy2-ui="composer-textarea"]',
    ).element;
    expect(currentTextarea).toBe(textarea);
    expect(document.activeElement).toBe(textarea);
    expect(textarea.value).toBe("hello team");
    // The focused agents-mode selector owns the accent hairline. Keep this
    // lifecycle test independent of Firefox's cosmetic transition scheduling.
    expect(card().matches(":focus-within")).toBe(true);
    await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
    expect(changes).toEqual(["agents", "people"]);
    expect(card().hasAttribute("data-agents")).toBe(false);
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

it("reports textarea focus and blur without replacing the controlled DOM node", async () => {
    const transitions: boolean[] = [];
    const view = createRenderer().render(
        () => (
            <div>
                <HarnessWithFocus
                    onFocusChange={(focused) => transitions.push(focused)}
                    testid="composer-focus"
                />
                <button data-testid="after-composer" type="button">
                    after
                </button>
            </div>
        ),
        { width: 620, height: 220, padding: 20 },
    );
    await view.ready();
    const textarea = view.$('[data-testid="composer-focus"] [data-happy2-ui="composer-textarea"]')
        .element as HTMLTextAreaElement;
    await userEvent.click(textarea);
    await userEvent.keyboard("local text");
    expect(document.activeElement).toBe(textarea);
    expect(
        view.$('[data-testid="composer-focus"] [data-happy2-ui="composer-textarea"]').element,
    ).toBe(textarea);
    await userEvent.click(view.$('[data-testid="after-composer"]').element);
    expect(transitions.slice(-2)).toEqual([true, false]);
    expect(textarea.value).toBe("local text");
});

function HarnessWithFocus(props: { onFocusChange(focused: boolean): void; testid: string }) {
    const [value, setValue] = useState("");
    return (
        <Composer
            data-testid={props.testid}
            onFocusChange={props.onFocusChange}
            onSend={() => undefined}
            onValueChange={setValue}
            value={value}
        />
    );
}

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

it("marks Agents mode with a quiet accent frame instead of a chip row", async () => {
    const view = createRenderer().render(
        () => <Harness audience="agents" testid="composer-agents" />,
        { width: 620, height: 320, padding: 20 },
    );
    await view.ready();
    const card = view.$('[data-testid="composer-agents"]');
    const cardEl = card.element as HTMLElement;
    // The whole input is the signal: agents mode adds no rows, labels, chips,
    // or pickers — only the accent-tinted hairline on the card itself.
    expect(cardEl.hasAttribute("data-agents")).toBe(true);
    expect(view.container.querySelector('[data-happy2-ui="composer-agents"]')).toBeNull();
    expect(view.container.querySelector('[data-happy2-ui="composer-agent-chip"]')).toBeNull();
    expect(view.container.querySelector('[aria-label="Add agent"]')).toBeNull();
    // At rest the frame uses Happy's selected-surface role.
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(getComputedStyle(cardEl).borderTopColor).toBe("rgb(198, 198, 200)");
    // Focus resolves the frame to the full accent, then back on blur.
    const textarea = view.$('[data-testid="composer-agents"] [data-happy2-ui="composer-textarea"]')
        .element as HTMLTextAreaElement;
    // Programmatic focus keeps this deterministic across engines; pointer
    // focus timing is covered by the Shift+Tab case above.
    textarea.focus();
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(getComputedStyle(cardEl).borderTopColor).toBe("rgb(0, 122, 255)");
    textarea.blur();
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(getComputedStyle(cardEl).borderTopColor).toBe("rgb(198, 198, 200)");
    await view.screenshot("Composer.agents.test");
});

it("keeps only one mention or emoji picker open", async () => {
    const view = createRenderer().render(
        () => (
            <Harness audience="agents" testid="composer-exclusive-pickers" withEmoji withMentions />
        ),
        { width: 620, height: 320, padding: 20 },
    );
    await view.ready();
    const mentionPopover = () =>
        view.container.querySelector(
            '[data-testid="composer-exclusive-pickers"] [data-happy2-ui="composer-popover"]',
        );
    const emojiPopover = () =>
        view.container.querySelector(
            '[data-testid="composer-exclusive-pickers"] [data-happy2-ui="composer-emoji-popover"]',
        );
    view.container
        .querySelector<HTMLButtonElement>(
            '[data-testid="composer-exclusive-pickers"] [aria-label="Mention someone"]',
        )!
        .click();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(mentionPopover()).not.toBeNull();
    view.container
        .querySelector<HTMLButtonElement>(
            '[data-testid="composer-exclusive-pickers"] [aria-label="Add emoji"]',
        )!
        .click();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(mentionPopover()).toBeNull();
    expect(emojiPopover()).not.toBeNull();
});
