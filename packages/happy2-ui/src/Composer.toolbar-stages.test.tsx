import { expect, it } from "vitest";
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
import { createRenderer } from "./testing";

const mentions: Mentionable[] = [
    { id: "codex", initials: "CX", name: "Codex", tone: "mint" },
    { id: "ada", initials: "AL", name: "Ada", tone: "amber" },
];
const noop = () => undefined;
type Stage = {
    audience: boolean;
    compactHint: boolean;
    contentWidth: number;
    fullHint: boolean;
    provideCompactHint: boolean;
    testid: string;
};
const stages: readonly Stage[] = [
    {
        audience: true,
        compactHint: false,
        contentWidth: 621,
        fullHint: true,
        provideCompactHint: true,
        testid: "audience-621",
    },
    {
        audience: true,
        compactHint: true,
        contentWidth: 620,
        fullHint: false,
        provideCompactHint: true,
        testid: "audience-620",
    },
    {
        audience: true,
        compactHint: true,
        contentWidth: 530,
        fullHint: false,
        provideCompactHint: true,
        testid: "audience-530",
    },
    {
        audience: true,
        compactHint: true,
        contentWidth: 421,
        fullHint: false,
        provideCompactHint: true,
        testid: "audience-421",
    },
    {
        audience: true,
        compactHint: false,
        contentWidth: 420,
        fullHint: false,
        provideCompactHint: true,
        testid: "audience-420",
    },
    {
        audience: false,
        compactHint: true,
        contentWidth: 433,
        fullHint: false,
        provideCompactHint: true,
        testid: "generic-433",
    },
    {
        audience: false,
        compactHint: true,
        contentWidth: 432,
        fullHint: false,
        provideCompactHint: true,
        testid: "generic-432",
    },
    {
        audience: false,
        compactHint: false,
        contentWidth: 432,
        fullHint: false,
        provideCompactHint: false,
        testid: "generic-432-without-companion",
    },
];

function ToolbarStage(props: {
    audience: boolean;
    contentWidth: number;
    provideCompactHint: boolean;
    testid: string;
}) {
    return (
        <Composer
            audience={props.audience ? "people" : undefined}
            compactHint={props.provideCompactHint ? "Enter to send" : undefined}
            data-testid={props.testid}
            emoji={[{ char: "✅", id: "check", name: "check" }]}
            hint="Enter to send · Shift+Tab to switch audience"
            mentions={mentions}
            onAttachFile={noop}
            onAudienceChange={props.audience ? noop : undefined}
            onSend={noop}
            onValueChange={noop}
            style={{ width: `${props.contentWidth + 2}px` }}
            value="Ready to send"
        />
    );
}

it("keeps the send action inside every measured toolbar stage", async () => {
    const view = createRenderer();
    for (const stage of stages) {
        view.render(
            () => (
                <ToolbarStage
                    audience={stage.audience}
                    contentWidth={stage.contentWidth}
                    provideCompactHint={stage.provideCompactHint}
                    testid={stage.testid}
                />
            ),
            { width: stage.contentWidth + 42, height: 120, padding: 20 },
        );
    }
    await view.ready();

    for (const stage of stages) {
        const rootSelector = `[data-testid="${stage.testid}"]`;
        const composer = view.$(rootSelector);
        const toolbar = view.$(`${rootSelector} [data-happy2-ui="composer-toolbar"]`);
        const send = view.$(`${rootSelector} .happy2-composer__send`);
        const composerBounds = composer.bounds();
        const sendBounds = send.bounds();
        const composerElement = composer.element as HTMLElement;
        const toolbarElement = toolbar.element as HTMLElement;

        expect(composerElement.clientWidth).toBe(stage.contentWidth);
        expect(sendBounds.x + sendBounds.width, `${stage.testid} send right inset`).toBe(
            composerBounds.x + composerBounds.width - 16,
        );
        expect(composerElement.scrollWidth).toBeLessThanOrEqual(composerElement.clientWidth);
        expect(toolbarElement.scrollWidth).toBeLessThanOrEqual(toolbarElement.clientWidth);
        expect(
            view.container.querySelector(`${rootSelector} [data-happy2-ui="composer-hint"]`),
        ).toBeNull();
        expect(
            view.container.querySelector(
                `${rootSelector} [data-happy2-ui="composer-hint-compact"]`,
            ),
        ).toBeNull();

        for (const label of ["Attach file", "Mention someone", "Add emoji"]) {
            const action = view.$(`${rootSelector} [aria-label="${label}"]`);
            expect(action.bounds().width).toBe(32);
            expect(action.computedStyle("display")).not.toBe("none");
        }

        if (stage.audience) {
            const toggle = view.$(`${rootSelector} [data-happy2-ui="segmented-control"]`);
            const icon = view.$(`${rootSelector} [data-happy2-ui="segmented-control-icon"]`);
            expect(composerElement.hasAttribute("data-audience")).toBe(true);
            expect(toggle.bounds().width).toBe(stage.contentWidth <= 421 ? 120 : 184);
            expect(icon.computedStyle("display") === "none").toBe(stage.contentWidth <= 421);
        } else {
            expect(composerElement.hasAttribute("data-audience")).toBe(false);
        }
    }

    await view.screenshot("Composer.toolbar-stages.test");
});
