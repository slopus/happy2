import { type ReactNode } from "react";
import { userEvent } from "vitest/browser";
import { expect, it, vi } from "vitest";
import "../../styles.css";
import { createRenderer } from "../../testing";
import { ChatProjectCreateDialog } from "./ChatProjectCreateDialog";

function WindowFrame(props: { children: ReactNode }) {
    return (
        <div
            data-testid="frame"
            style={{
                background: "var(--groupped-background)",
                height: "820px",
                overflow: "hidden",
                position: "relative",
                transform: "translateZ(0)",
                width: "800px",
            }}
        >
            {props.children}
        </div>
    );
}

it("collects a project and its required first channel in one desktop dialog", async () => {
    const create = vi.fn();
    const view = createRenderer();
    view.render(
        () => (
            <WindowFrame>
                <ChatProjectCreateDialog busy={false} onClose={() => {}} onCreate={create} />
            </WindowFrame>
        ),
        { width: 840, height: 860, padding: 20 },
    );
    await view.ready();

    const overlay = view.$('[data-happy2-ui="modal-overlay"]');
    expect(overlay.bounds()).toMatchObject({ width: 800, height: 820 });
    expect(overlay.offsets()).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    const dialog = view.$('[data-happy2-ui="modal-dialog"]');
    expect(dialog.width()).toBe(480);
    expect(dialog.element.getAttribute("aria-label")).toBe("Create project");
    const formControls = [
        ...view.container.querySelectorAll<HTMLElement>('[data-happy2-ui="form-row-control"]'),
    ];
    expect(formControls).toHaveLength(5);
    for (const control of formControls) expect(control.getBoundingClientRect().width).toBe(438);
    const fieldControls = [
        ...view.container.querySelectorAll<HTMLElement>(
            '[data-happy2-ui="text-field"], [data-happy2-ui="select"]',
        ),
    ];
    expect(fieldControls).toHaveLength(5);
    for (const control of fieldControls) expect(control.getBoundingClientRect().width).toBe(438);
    const inputControls = [
        ...view.container.querySelectorAll<HTMLElement>(
            '[data-happy2-ui="text-field-control"], [data-happy2-ui="select-control"]',
        ),
    ];
    expect(inputControls).toHaveLength(5);
    for (const control of inputControls) expect(control.getBoundingClientRect().width).toBe(438);

    const inputs = [...view.container.querySelectorAll<HTMLInputElement>("input")];
    expect(inputs).toHaveLength(4);
    await userEvent.fill(inputs[0]!, "Launch");
    await userEvent.fill(inputs[1]!, "Coordinate the release");
    await userEvent.fill(inputs[2]!, "Planning Room");
    expect(inputs[3]!.value).toBe("planning-room");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    for (const control of fieldControls) expect(control.getBoundingClientRect().width).toBe(438);
    for (const control of inputControls) expect(control.getBoundingClientRect().width).toBe(438);

    const submit = view.container.querySelector<HTMLButtonElement>(
        '[data-happy2-ui="modal-footer"] button:last-of-type',
    )!;
    expect(submit.disabled).toBe(false);
    submit.click();
    expect(create).toHaveBeenCalledWith({
        name: "Launch",
        description: "Coordinate the release",
        initialChannel: {
            kind: "public_channel",
            name: "Planning Room",
            slug: "planning-room",
        },
    });

    await view.screenshot("ChatProjectCreateDialog.test");
}, 120000);

it("requires a usable first-channel slug and lets the user replace the derived value", async () => {
    const create = vi.fn();
    const view = createRenderer();
    view.render(
        () => (
            <WindowFrame>
                <ChatProjectCreateDialog busy={false} onClose={() => {}} onCreate={create} />
            </WindowFrame>
        ),
        { width: 840, height: 860, padding: 20 },
    );
    await view.ready();

    const inputs = [...view.container.querySelectorAll<HTMLInputElement>("input")];
    const submit = view.container.querySelector<HTMLButtonElement>(
        '[data-happy2-ui="modal-footer"] button:last-of-type',
    )!;
    await userEvent.fill(inputs[0]!, "Launch");
    await userEvent.fill(inputs[2]!, "🚀");
    expect(inputs[3]!.value).toBe("");
    expect(submit.disabled).toBe(true);

    await userEvent.fill(inputs[3]!, "launch-room");
    expect(submit.disabled).toBe(false);
    submit.click();
    expect(create).toHaveBeenCalledWith({
        name: "Launch",
        initialChannel: {
            kind: "public_channel",
            name: "🚀",
            slug: "launch-room",
        },
    });
});
