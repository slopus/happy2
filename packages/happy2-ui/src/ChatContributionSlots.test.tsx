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

it("withholds composer contribution triggers so attachment remains the leftmost control", async () => {
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
    expect(view.container.querySelector('[data-happy2-ui="composer-contributions"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="composer-trigger"]')).toBeNull();
    const leading = view.$('[data-happy2-ui="composer-leading"]').element;
    const attachment = view.$('[aria-label="Attach file"]').element;
    expect(leading.firstElementChild).toBe(attachment);
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
