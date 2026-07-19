import { expect, it } from "vitest";
import { type ReactNode } from "react";
import "./theme.css";
import "./styles/button.css";
import "./styles/icon.css";
import "./styles/text-field.css";
import "./styles/default-agent-form.css";
import { Button } from "./Button";
import {
    DefaultAgentForm,
    DEFAULT_AGENT_LUCKY_LABEL,
    type DefaultAgentFormProps,
} from "./DefaultAgentForm";
import { createRenderer } from "./testing";

type Renderer = ReturnType<typeof createRenderer>;

async function glyphDrift(view: Renderer, hostSelector: string, partSelector: string) {
    const host = view.$(hostSelector);
    const part = view.$(partSelector);
    const visible = await part.visibleMetrics();
    expect(visible.pixelCount, `${partSelector} paints no pixels`).toBeGreaterThan(0);
    const partBounds = part.bounds();
    expect(visible.bounds.x, `${partSelector} ink clipped left`).toBeGreaterThan(0);
    expect(visible.bounds.y, `${partSelector} ink clipped top`).toBeGreaterThan(0);
    expect(
        visible.bounds.x + visible.bounds.width,
        `${partSelector} ink clipped right`,
    ).toBeLessThan(partBounds.width);
    expect(
        visible.bounds.y + visible.bounds.height,
        `${partSelector} ink clipped bottom`,
    ).toBeLessThan(partBounds.height);
    const hostBounds = host.bounds();
    return {
        dx: visible.center.x + partBounds.x - hostBounds.x - hostBounds.width / 2,
        dy: visible.center.y + partBounds.y - hostBounds.y - hostBounds.height / 2,
    };
}

function Frame(props: { children: ReactNode }) {
    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                gap: "20px",
                width: "480px",
                boxSizing: "border-box",
                padding: "20px",
                border: "1px solid var(--happy2-border-strong)",
                borderRadius: "var(--happy2-radius-shell)",
                background: "var(--happy2-bg-surface)",
            }}
        >
            {props.children}
        </div>
    );
}

function Fixture(
    props: Omit<
        DefaultAgentFormProps,
        "formId" | "onLucky" | "onNameChange" | "onSubmit" | "onUsernameChange"
    >,
) {
    const formId = "stable-default-agent-form";
    return (
        <Frame>
            <DefaultAgentForm
                {...props}
                formId={formId}
                onLucky={() => {}}
                onNameChange={() => {}}
                onSubmit={() => {}}
                onUsernameChange={() => {}}
            />
            <Button
                data-testid="default-agent-submit"
                disabled={props.submitting || props.submitDisabled}
                form={formId}
                fullWidth
                type="submit"
            >
                {props.submitting ? "Creating agent…" : "Create agent"}
            </Button>
        </Frame>
    );
}

const input = (view: Renderer, testid: string) =>
    view.$(`[data-testid="${testid}"] input`).element as HTMLInputElement;

it("renders the controlled form with a stable external-submit link and calibrated lucky action", async () => {
    const view = createRenderer();
    view.render(() => <Fixture data-testid="da" name="Happy" username="happy" />, {
        width: 520,
        height: 480,
        padding: 0,
    });
    await view.ready();

    const form = view.$('[data-testid="da"]');
    expect(form.element.tagName).toBe("FORM");
    expect(form.element.getAttribute("id")).toBe("stable-default-agent-form");
    expect((form.element as HTMLFormElement).noValidate).toBe(true);
    expect(form.element.getAttribute("aria-busy")).toBeNull();
    expect(
        form.computedStyles(["box-sizing", "display", "flex-direction", "gap", "width"]),
    ).toEqual({
        "box-sizing": "border-box",
        display: "flex",
        "flex-direction": "column",
        gap: "16px",
        width: "438px",
    });

    const name = input(view, "default-agent-name");
    const username = input(view, "default-agent-username");
    expect(name.value).toBe("Happy");
    expect(username.value).toBe("happy");
    expect(name.required).toBe(true);
    expect(username.required).toBe(true);
    expect(name.getAttribute("autocomplete")).toBe("name");
    expect(username.getAttribute("autocomplete")).toBe("username");
    expect(name.name).toBe("default-agent-name");
    expect(username.name).toBe("default-agent-username");

    const submit = view.$('[data-testid="default-agent-submit"]');
    expect(submit.element.getAttribute("form")).toBe("stable-default-agent-form");
    expect((submit.element as HTMLButtonElement).type).toBe("submit");
    expect((submit.element as HTMLButtonElement).disabled).toBe(false);
    expect(submit.element.textContent).toBe("Create agent");
    expect(submit.bounds()).toMatchObject({ width: 438, height: 36 });

    const description = view.$('[data-testid="da"] [data-happy2-ui="default-agent-description"]');
    expect(
        description.computedStyles([
            "color",
            "font-family",
            "font-size",
            "font-weight",
            "line-height",
        ]),
    ).toMatchObject({
        color: "rgb(142, 142, 147)",
        "font-size": "13px",
        "font-weight": "400",
        "line-height": "20px",
    });
    expect(description.textMetrics().font).toMatchObject({
        size: 13,
        weight: "400",
        lineHeight: 20,
    });
    expect((await description.visibleMetrics()).pixelCount).toBeGreaterThan(0);

    const lucky = view.$('[data-testid="default-agent-lucky"]');
    expect(lucky.element.textContent).toBe(DEFAULT_AGENT_LUCKY_LABEL);
    expect(DEFAULT_AGENT_LUCKY_LABEL).toBe("Happy, I’m feeling lucky");
    expect(lucky.bounds().height).toBe(36);
    const luckyGlyph = await glyphDrift(
        view,
        '[data-testid="default-agent-lucky"] [data-happy2-ui="button-icon"]',
        '[data-testid="default-agent-lucky"] [data-happy2-ui="button-icon"] svg',
    );
    expect(Math.abs(luckyGlyph.dx), "lucky glyph horizontal centroid").toBeLessThanOrEqual(0.45);
    expect(Math.abs(luckyGlyph.dy), "lucky glyph vertical centroid").toBeLessThanOrEqual(0.45);

    await view.screenshot("DefaultAgentForm");
}, 120_000);

it("locks every control and exposes a busy form while creation is in flight", async () => {
    const view = createRenderer();
    view.render(() => <Fixture data-testid="da" name="Happy" submitting username="happy" />, {
        width: 520,
        height: 480,
        padding: 0,
    });
    await view.ready();

    const form = view.$('[data-testid="da"]');
    expect(form.element.getAttribute("aria-busy")).toBe("true");
    expect(form.element.getAttribute("data-submitting")).toBe("");
    expect(input(view, "default-agent-name").disabled).toBe(true);
    expect(input(view, "default-agent-username").disabled).toBe(true);
    expect(
        (view.$('[data-testid="default-agent-lucky"]').element as HTMLButtonElement).disabled,
    ).toBe(true);
    const submit = view.$('[data-testid="default-agent-submit"]');
    expect((submit.element as HTMLButtonElement).disabled).toBe(true);
    expect(submit.element.textContent).toBe("Creating agent…");
    expect(submit.computedStyle("opacity")).toBe("0.48");

    await view.screenshot("DefaultAgentForm.submitting");
}, 120_000);

it("shows field errors and a server conflict while the linked submit is disabled", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <Fixture
                data-testid="da"
                formError="The default agent username is already taken."
                name=""
                nameError="Enter a display name."
                submitDisabled
                username="No"
                usernameError="Use 3–32 lowercase letters, digits, underscores, or hyphens."
            />
        ),
        { width: 520, height: 560, padding: 0 },
    );
    await view.ready();

    const nameError = view.$(
        '[data-testid="default-agent-name"] [data-happy2-ui="text-field-error"]',
    );
    expect(nameError.element.textContent).toBe("Enter a display name.");
    const usernameError = view.$(
        '[data-testid="default-agent-username"] [data-happy2-ui="text-field-error"]',
    );
    expect(usernameError.element.textContent).toBe(
        "Use 3–32 lowercase letters, digits, underscores, or hyphens.",
    );

    const formError = view.$('[data-testid="da"] [data-happy2-ui="default-agent-error"]');
    expect(formError.element.getAttribute("role")).toBe("alert");
    expect(formError.element.textContent).toBe("The default agent username is already taken.");
    expect(formError.computedStyle("color")).toBe("rgb(255, 59, 48)");
    expect(formError.textMetrics().font).toMatchObject({ size: 13, weight: "400", lineHeight: 20 });
    expect((await formError.visibleMetrics()).pixelCount).toBeGreaterThan(0);

    const submit = view.$('[data-testid="default-agent-submit"]');
    expect((submit.element as HTMLButtonElement).disabled).toBe(true);

    await view.screenshot("DefaultAgentForm.invalid");
}, 120_000);
