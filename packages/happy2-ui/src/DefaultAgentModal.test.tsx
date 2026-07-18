import { expect, it } from "vitest";
import { type ReactNode } from "react";
import "./theme.css";
import "./styles/modal.css";
import "./styles/modal-overlay.css";
import "./styles/button.css";
import "./styles/icon.css";
import "./styles/text-field.css";
import "./styles/default-agent-modal.css";
import { DefaultAgentModal, DEFAULT_AGENT_LUCKY_LABEL } from "./DefaultAgentModal";
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

/*
 * ModalOverlay is `position: fixed`; a transformed wrapper establishes a
 * containing block so each specimen is bounded and screenshot-safe.
 */
function Frame(props: { children: ReactNode }) {
    return (
        <div
            style={{
                position: "relative",
                width: "720px",
                height: "560px",
                overflow: "hidden",
                transform: "translateZ(0)",
                background: "var(--happy2-bg-app)",
            }}
        >
            {props.children}
        </div>
    );
}

const input = (view: ReturnType<typeof createRenderer>, testid: string) =>
    view.$(`[data-testid="${testid}"] input`).element as HTMLInputElement;

it("names the default agent through a non-dismissible medium modal", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <Frame>
                <DefaultAgentModal
                    data-testid="da"
                    name="Happy"
                    onLucky={() => {}}
                    onNameChange={() => {}}
                    onSubmit={() => {}}
                    onUsernameChange={() => {}}
                    username="happy"
                />
            </Frame>
        ),
        { width: 760, height: 600, padding: 0 },
    );
    await view.ready();

    /* ---- Non-dismissible: no close control anywhere in the card ---------- */
    expect(view.container.querySelector('[data-testid="da"] .happy2-modal__close')).toBeNull();

    /* ---- One fixed overlay, centered inside the 24px safe-area gutter ---- */
    const overlay = view.$('[data-testid="da"]');
    expect(overlay.bounds()).toMatchObject({ width: 720, height: 560 });
    expect(overlay.offsets()).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    expect(
        overlay.computedStyles([
            "align-items",
            "background-color",
            "box-sizing",
            "display",
            "justify-content",
            "padding-bottom",
            "padding-left",
            "padding-right",
            "padding-top",
            "position",
            "z-index",
        ]),
    ).toEqual({
        "align-items": "center",
        "background-color": "rgba(0, 0, 0, 0.6)",
        "box-sizing": "border-box",
        display: "flex",
        "justify-content": "center",
        "padding-bottom": "24px",
        "padding-left": "24px",
        "padding-right": "24px",
        "padding-top": "24px",
        position: "fixed",
        "z-index": "1000",
    });

    /* ---- Medium dialog card (480), centered on both axes ---------------- */
    const dialog = view.$('[data-testid="da"] [data-happy2-ui="modal-dialog"]');
    expect(dialog.element.getAttribute("role")).toBe("dialog");
    expect(dialog.element.getAttribute("aria-modal")).toBe("true");
    expect(dialog.width()).toBe(480);
    expect(
        dialog.computedStyles([
            "background-color",
            "border-top-color",
            "border-top-left-radius",
            "border-top-width",
            "box-shadow",
            "box-sizing",
            "display",
            "flex-direction",
            "overflow-y",
        ]),
    ).toEqual({
        "background-color": "rgb(36, 34, 43)",
        "border-top-color": "rgba(255, 255, 255, 0.13)",
        "border-top-left-radius": "14px",
        "border-top-width": "1px",
        "box-shadow": "rgba(0, 0, 0, 0.5) 0px 24px 64px 0px",
        "box-sizing": "border-box",
        display: "flex",
        "flex-direction": "column",
        "overflow-y": "hidden",
    });
    const overlayBounds = overlay.bounds();
    const dialogBounds = dialog.bounds();
    const horizontalGaps = [
        dialogBounds.x - overlayBounds.x,
        overlayBounds.x + overlayBounds.width - dialogBounds.x - dialogBounds.width,
    ];
    const verticalGaps = [
        dialogBounds.y - overlayBounds.y,
        overlayBounds.y + overlayBounds.height - dialogBounds.y - dialogBounds.height,
    ];
    expect(Math.abs(horizontalGaps[0]! - horizontalGaps[1]!)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(verticalGaps[0]! - verticalGaps[1]!)).toBeLessThanOrEqual(0.5);
    expect(Math.min(...horizontalGaps, ...verticalGaps)).toBeGreaterThanOrEqual(24);

    /* ---- Header and title typography ------------------------------------ */
    const header = view.$('[data-testid="da"] [data-happy2-ui="modal-header"]');
    expect(header.bounds().height).toBe(60);
    expect(header.offsets().top).toBe(1);
    expect(
        header.computedStyles(["align-items", "display", "padding-left", "padding-top"]),
    ).toEqual({
        "align-items": "center",
        display: "flex",
        "padding-left": "20px",
        "padding-top": "16px",
    });
    const title = view.$('[data-testid="da"] [data-happy2-ui="modal-title"]');
    expect(title.textMetrics()).toMatchObject({
        text: "Name your agent",
        font: { size: 16, weight: "700", lineHeight: 24 },
    });
    expect(title.computedStyle("color")).toBe("rgb(237, 234, 242)");
    expect((await title.visibleMetrics()).pixelCount).toBeGreaterThan(0);
    const modalGlyph = await glyphDrift(
        view,
        '[data-testid="da"] [data-happy2-ui="modal-icon"]',
        '[data-testid="da"] [data-happy2-ui="modal-icon"] svg',
    );
    expect(Math.abs(modalGlyph.dx), "modal glyph horizontal centroid").toBeLessThanOrEqual(0.45);
    expect(Math.abs(modalGlyph.dy), "modal glyph vertical centroid").toBeLessThanOrEqual(0.45);

    /* ---- Controlled fields carry the proposed identity ------------------ */
    expect(input(view, "default-agent-name").value).toBe("Happy");
    expect(input(view, "default-agent-username").value).toBe("happy");
    expect(input(view, "default-agent-name").disabled).toBe(false);

    /* ---- Form is a single flex column; submit links to it by id --------- */
    const form = view.$('[data-testid="da"] [data-happy2-ui="default-agent-form"]');
    expect(form.element.tagName).toBe("FORM");
    expect(form.computedStyles(["display", "flex-direction"])).toEqual({
        display: "flex",
        "flex-direction": "column",
    });
    const submit = view.$('[data-testid="da"] [data-testid="default-agent-submit"]');
    const formId = form.element.getAttribute("id");
    expect(formId).toBeTruthy();
    expect(submit.element.getAttribute("form")).toBe(formId);
    expect((submit.element as HTMLButtonElement).type).toBe("submit");
    expect((form.element as HTMLFormElement).noValidate).toBe(true);
    expect(form.computedStyles(["box-sizing", "gap", "margin-top", "width"])).toEqual({
        "box-sizing": "border-box",
        gap: "16px",
        "margin-top": "0px",
        width: "438px",
    });

    /* The body is a full-bleed scrollport; Modal's inner wrapper owns the
     * 20px inset while the form keeps its 16px rhythm. */
    const body = view.$('[data-testid="da"] [data-happy2-ui="modal-body"]');
    expect(body.bounds().width).toBe(478);
    expect(
        body.computedStyles(["padding-bottom", "padding-left", "padding-right", "padding-top"]),
    ).toEqual({
        "padding-bottom": "0px",
        "padding-left": "0px",
        "padding-right": "0px",
        "padding-top": "0px",
    });
    const bodyContent = view.$('[data-testid="da"] [data-happy2-ui="modal-body-content"]');
    expect(
        bodyContent.computedStyles([
            "padding-bottom",
            "padding-left",
            "padding-right",
            "padding-top",
        ]),
    ).toEqual({
        "padding-bottom": "20px",
        "padding-left": "20px",
        "padding-right": "20px",
        "padding-top": "4px",
    });
    const description = view.$('[data-testid="da"] [data-happy2-ui="default-agent-description"]');
    expect(
        description.computedStyles([
            "color",
            "font-size",
            "font-weight",
            "line-height",
            "margin-top",
        ]),
    ).toEqual({
        color: "rgb(165, 160, 176)",
        "font-size": "13px",
        "font-weight": "400",
        "line-height": "20px",
        "margin-top": "0px",
    });
    expect(description.textMetrics().font).toMatchObject({
        size: 13,
        weight: "400",
        lineHeight: 20,
    });
    expect((await description.visibleMetrics()).pixelCount).toBeGreaterThan(0);
    const nameField = view.$('[data-testid="da"] [data-testid="default-agent-name"]');
    const usernameField = view.$('[data-testid="da"] [data-testid="default-agent-username"]');
    const preset = view.$('[data-testid="da"] [data-happy2-ui="default-agent-preset"]');
    for (const part of [description, nameField, usernameField, preset]) {
        expect(part.bounds().width).toBe(438);
        expect(Math.abs(part.bounds().x - form.bounds().x)).toBeLessThanOrEqual(0.05);
    }
    expect(nameField.bounds().y - description.bounds().y - description.bounds().height).toBe(16);
    expect(usernameField.bounds().y - nameField.bounds().y - nameField.bounds().height).toBe(16);
    expect(preset.bounds().y - usernameField.bounds().y - usernameField.bounds().height).toBe(16);

    /* ---- Preset button carries the exact label -------------------------- */
    const lucky = view.$('[data-testid="da"] [data-testid="default-agent-lucky"]');
    expect(lucky.element.textContent).toBe(DEFAULT_AGENT_LUCKY_LABEL);
    expect(DEFAULT_AGENT_LUCKY_LABEL).toBe("Happy, I’m feeling lucky");
    expect(lucky.bounds().height).toBe(36);
    const luckyGlyph = await glyphDrift(
        view,
        '[data-testid="da"] [data-testid="default-agent-lucky"] [data-happy2-ui="button-icon"]',
        '[data-testid="da"] [data-testid="default-agent-lucky"] [data-happy2-ui="button-icon"] svg',
    );
    expect(Math.abs(luckyGlyph.dx), "lucky glyph horizontal centroid").toBeLessThanOrEqual(0.45);
    expect(Math.abs(luckyGlyph.dy), "lucky glyph vertical centroid").toBeLessThanOrEqual(0.45);

    /* ---- Idle primary action -------------------------------------------- */
    expect(submit.element.textContent).toBe("Create agent");
    expect((submit.element as HTMLButtonElement).disabled).toBe(false);
    expect(submit.bounds().height).toBe(36);
    expect(submit.offsets().right).toBe(20);
    expect(submit.offsets().top).toBe(17);
    const submitLabel = view.$(
        '[data-testid="da"] [data-testid="default-agent-submit"] [data-happy2-ui="button-label"]',
    );
    expect(submitLabel.textMetrics().font).toMatchObject({
        size: 13,
        weight: "700",
        lineHeight: 18,
    });
    expect((await submitLabel.visibleMetrics()).pixelCount).toBeGreaterThan(0);

    await view.screenshot("DefaultAgentModal");
}, 120_000);

it("locks every control and relabels the action while a create request is in flight", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <Frame>
                <DefaultAgentModal
                    data-testid="da"
                    name="Happy"
                    onLucky={() => {}}
                    onNameChange={() => {}}
                    onSubmit={() => {}}
                    onUsernameChange={() => {}}
                    submitting
                    username="happy"
                />
            </Frame>
        ),
        { width: 760, height: 600, padding: 0 },
    );
    await view.ready();

    expect(input(view, "default-agent-name").disabled).toBe(true);
    expect(input(view, "default-agent-username").disabled).toBe(true);
    const lucky = view.$('[data-testid="da"] [data-testid="default-agent-lucky"]');
    expect((lucky.element as HTMLButtonElement).disabled).toBe(true);
    const submit = view.$('[data-testid="da"] [data-testid="default-agent-submit"]');
    expect((submit.element as HTMLButtonElement).disabled).toBe(true);
    expect(submit.element.textContent).toBe("Creating agent…");
    expect(submit.computedStyle("opacity")).toBe("0.48");
    expect(
        view.$('[data-testid="da"] [data-testid="default-agent-name"]').computedStyle("opacity"),
    ).toBe("0.5");

    await view.screenshot("DefaultAgentModal.submitting");
}, 120_000);

it("shows per-field validation and a whole-form conflict in the danger tone", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <Frame>
                <DefaultAgentModal
                    data-testid="da"
                    formError="The default agent username is already taken."
                    name=""
                    nameError="Enter a display name."
                    onLucky={() => {}}
                    onNameChange={() => {}}
                    onSubmit={() => {}}
                    onUsernameChange={() => {}}
                    submitDisabled
                    username="No"
                    usernameError="Use 3–32 lowercase letters, digits, underscores, or hyphens."
                />
            </Frame>
        ),
        { width: 760, height: 600, padding: 0 },
    );
    await view.ready();

    const nameError = view.$(
        '[data-testid="da"] [data-testid="default-agent-name"] [data-happy2-ui="text-field-error"]',
    );
    expect(nameError.element.textContent).toBe("Enter a display name.");
    const usernameError = view.$(
        '[data-testid="da"] [data-testid="default-agent-username"] [data-happy2-ui="text-field-error"]',
    );
    expect(usernameError.element.textContent).toBe(
        "Use 3–32 lowercase letters, digits, underscores, or hyphens.",
    );

    const formError = view.$('[data-testid="da"] [data-happy2-ui="default-agent-error"]');
    expect(formError.element.getAttribute("role")).toBe("alert");
    expect(formError.element.textContent).toBe("The default agent username is already taken.");
    expect(formError.computedStyle("color")).toBe("rgb(248, 113, 113)");
    expect(formError.textMetrics().font).toMatchObject({ size: 13, weight: "400", lineHeight: 20 });
    expect((await formError.visibleMetrics()).pixelCount).toBeGreaterThan(0);

    const submit = view.$('[data-testid="da"] [data-testid="default-agent-submit"]');
    expect((submit.element as HTMLButtonElement).disabled).toBe(true);

    await view.screenshot("DefaultAgentModal.invalid");
}, 120_000);
