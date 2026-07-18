import { type ReactNode } from "react";
import { expect, it } from "vitest";
import "./theme.css";
import "./styles/modal-overlay.css";
import "./styles/modal.css";
import "./styles/button.css";
import "./styles/icon.css";
import { Modal } from "./Modal";
import { ModalOverlay } from "./ModalOverlay";
import { createRenderer } from "./testing";
/*
 * The overlay is `position: fixed`; a transformed wrapper establishes a
 * containing block so it fills a bounded, measurable window frame in the test
 * surface instead of escaping to the viewport. No border/padding on the frame,
 * so `inset: 0` resolves to exact edge offsets.
 */
function WindowFrame(props: { children: ReactNode }): ReactNode {
    return (
        <div
            data-testid="frame"
            style={{
                position: "relative",
                width: "720px",
                height: "460px",
                overflow: "hidden",
                transform: "translateZ(0)",
            }}
        >
            {props.children}
        </div>
    );
}
it("holds ModalOverlay backdrop geometry, centering, and backdrop-only dismiss", async () => {
    const dismissed: string[] = [];
    const view = createRenderer();
    view.render(
        () => (
            <WindowFrame>
                <ModalOverlay data-testid="ov" onDismiss={() => dismissed.push("ov")}>
                    <Modal icon="hash" onClose={() => {}} size="medium" title="Create a channel">
                        Channels organize conversation around a topic.
                    </Modal>
                </ModalOverlay>
            </WindowFrame>
        ),
        { width: 800, height: 540, padding: 40 },
    );
    await view.ready();
    /* ---- Backdrop layer: one dim, one stacking level, fixed to the window --- */
    const overlay = view.$('[data-testid="ov"]');
    expect(overlay.element.getAttribute("data-happy2-ui")).toBe("modal-overlay");
    expect(
        overlay.computedStyles([
            "position",
            "z-index",
            "background-color",
            "display",
            "align-items",
            "justify-content",
            "box-sizing",
            "padding-top",
            "padding-right",
            "padding-bottom",
            "padding-left",
        ]),
    ).toEqual({
        position: "fixed",
        "z-index": "1000",
        "background-color": "rgba(0, 0, 0, 0.6)",
        display: "flex",
        "align-items": "center",
        "justify-content": "center",
        "box-sizing": "border-box",
        "padding-top": "24px",
        "padding-right": "24px",
        "padding-bottom": "24px",
        "padding-left": "24px",
    });
    /* Fixed inset:0 fills the containing frame exactly. */
    const inset = overlay.offsets();
    expect(inset.top).toBe(0);
    expect(inset.right).toBe(0);
    expect(inset.bottom).toBe(0);
    expect(inset.left).toBe(0);
    expect(overlay.bounds().width).toBe(720);
    expect(overlay.bounds().height).toBe(460);
    /* ---- Hosted card is centered inside the 24px safe-area gutter --------- */
    const dialog = view.$('[data-testid="ov"] [data-happy2-ui="modal-dialog"]');
    const overlayBounds = overlay.bounds();
    const dialogBounds = dialog.bounds();
    const leftGap = dialogBounds.x - overlayBounds.x;
    const rightGap = overlayBounds.x + overlayBounds.width - (dialogBounds.x + dialogBounds.width);
    const topGap = dialogBounds.y - overlayBounds.y;
    const bottomGap =
        overlayBounds.y + overlayBounds.height - (dialogBounds.y + dialogBounds.height);
    expect(Math.abs(leftGap - rightGap)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(topGap - bottomGap)).toBeLessThanOrEqual(0.5);
    expect(leftGap).toBeGreaterThanOrEqual(24);
    expect(topGap).toBeGreaterThanOrEqual(24);
    /* ---- Dismiss is backdrop-only -------------------------------------- */
    /* A click inside the card must not dismiss (target !== the backdrop). */
    (dialog.element as HTMLElement).click();
    expect(dismissed).toEqual([]);
    /* A click on the dim outside the card dismisses. */
    (overlay.element as HTMLElement).click();
    expect(dismissed).toEqual(["ov"]);
    await view.screenshot("ModalOverlay.test");
}, 120000);
it("caps a taller-than-window card inside the gutter so its body scrolls, not the window", async () => {
    const view = createRenderer();
    /* A card whose content far exceeds the 460px window: without a height cap it
     * would grow past the overlay and clip its header/footer at the window edge. */
    const tall = Array.from({ length: 40 }, (_, i) => (
        <p data-line={i} key={i}>
            Preference row {i + 1}
        </p>
    ));
    view.render(
        () => (
            <WindowFrame>
                <ModalOverlay data-testid="ov">
                    <Modal
                        icon="settings"
                        onClose={() => {}}
                        size="large"
                        title="Profile and settings"
                    >
                        {tall}
                    </Modal>
                </ModalOverlay>
            </WindowFrame>
        ),
        { width: 800, height: 540, padding: 40 },
    );
    await view.ready();
    const overlay = view.$('[data-testid="ov"]');
    const dialog = view.$('[data-testid="ov"] [data-happy2-ui="modal-dialog"]');
    const header = view.$('[data-testid="ov"] [data-happy2-ui="modal-header"]');
    const body = view.$('[data-testid="ov"] [data-happy2-ui="modal-body"]');
    /* ---- Card keeps a clear margin; it never fills the window height ------ */
    const overlayBounds = overlay.bounds();
    const dialogBounds = dialog.bounds();
    const topGap = dialogBounds.y - overlayBounds.y;
    const bottomGap =
        overlayBounds.y + overlayBounds.height - (dialogBounds.y + dialogBounds.height);
    /* The card is centered with equal gutters well beyond the 24px minimum, so
     * it reads as a floating dialog rather than a full-height panel. */
    expect(Math.abs(topGap - bottomGap)).toBeLessThanOrEqual(0.5);
    expect(topGap).toBeGreaterThan(36);
    /* Capped at 88% of the safe box (460 - 48 = 412): a clear slice stays free. */
    const safeBox = overlayBounds.height - 48;
    expect(dialogBounds.height).toBeLessThanOrEqual(safeBox * 0.88 + 1);
    expect(dialogBounds.height).toBeGreaterThan(safeBox * 0.88 - 2);
    /* ---- The body scrolls; the header/footer stay pinned and unclipped ---- */
    const bodyEl = body.element as HTMLElement;
    /* Overflowing content lives in the body's scroll region, not off-window. */
    expect(bodyEl.scrollHeight).toBeGreaterThan(bodyEl.clientHeight);
    /* Header sits fully inside the (capped) dialog — its top is not clipped. */
    expect(header.bounds().height).toBe(60);
    expect(header.bounds().y).toBeGreaterThanOrEqual(dialogBounds.y);
    expect(header.bounds().y + header.bounds().height).toBeLessThanOrEqual(
        dialogBounds.y + dialogBounds.height + 0.5,
    );
    await view.screenshot("ModalOverlay.tall.test");
}, 120000);
it("does not dismiss when no onDismiss is wired (a click-away-safe surface)", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <WindowFrame>
                <ModalOverlay data-testid="fixed">
                    <Modal icon="doc" size="large" title="Editing file.ts">
                        Unsaved work must not be lost to a stray backdrop click.
                    </Modal>
                </ModalOverlay>
            </WindowFrame>
        ),
        { width: 800, height: 540, padding: 40 },
    );
    await view.ready();
    const overlay = view.$('[data-testid="fixed"]');
    /* No throw, no handler: clicking the backdrop is inert. */
    (overlay.element as HTMLElement).click();
    expect(overlay.element.getAttribute("data-happy2-ui")).toBe("modal-overlay");
}, 120000);
