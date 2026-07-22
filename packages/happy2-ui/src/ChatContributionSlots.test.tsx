import { expect, it } from "vitest";
import "./theme.css";
import "./styles/icon.css";
import "./styles/button.css";
import "./styles/avatar.css";
import "./styles/badge.css";
import "./styles/composer.css";
import "./styles/message.css";
import { Composer } from "./Composer";
import { Message } from "./Message";
import { createRenderer } from "./testing";

it("renders composer contribution triggers immediately before the attachment control", async () => {
    const view = createRenderer().render(
        () => (
            <Composer
                contributions={
                    <button data-testid="composer-trigger" type="button">
                        Insert
                    </button>
                }
                onAttachFile={() => undefined}
                onSend={() => undefined}
                onValueChange={() => undefined}
                value=""
            />
        ),
        { width: 640, height: 200, padding: 16 },
    );
    const slot = view.$('[data-happy2-ui="composer-contributions"]');
    expect(slot.element).not.toBeNull();
    const trailing = view.$('[data-happy2-ui="composer-trailing"]').element;
    expect(trailing.contains(slot.element)).toBe(true);
    const attachment = view.$('[aria-label="Attach file"]').element;
    expect(slot.element.nextElementSibling).toBe(attachment);
    expect(
        attachment.getBoundingClientRect().x -
            (slot.element.getBoundingClientRect().x + slot.element.getBoundingClientRect().width),
    ).toBeCloseTo(8, 1);
    expect(slot.element.querySelector('[data-testid="composer-trigger"]')).not.toBeNull();
    await view.screenshot("ChatContributionSlots.composer.test");
}, 120000);

it("renders message contribution triggers in the message hover action toolbar", async () => {
    const view = createRenderer().render(
        () => (
            <Message
                actionsVisible
                author="Ada"
                body="Shipping the feature."
                contributions={
                    <button data-testid="message-trigger" type="button">
                        Pin
                    </button>
                }
                onReactionSelect={() => undefined}
                reactionOptions={[{ id: "+1", name: "thumbs up", char: "👍" }]}
                time="12:40"
            />
        ),
        { width: 640, height: 200, padding: 16 },
    );
    const slot = view.$('[data-happy2-ui="message-contributions"]');
    expect(slot.element).not.toBeNull();
    const actions = view.$('[data-happy2-ui="message-actions"]').element;
    expect(actions.contains(slot.element)).toBe(true);
    expect(slot.element.querySelector('[data-testid="message-trigger"]')).not.toBeNull();
    await view.screenshot("ChatContributionSlots.message.test");
}, 120000);
