import { useState, type ReactNode } from "react";
import { expect, it } from "vitest";
import { userEvent } from "vitest/browser";
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

/* Top-placement fixtures use a real-sized, non-transformed host. The inline
 * absolute position keeps the production overlay bounded by that host without
 * introducing a transformed containing block, so cqh resolves from the
 * overlay's own size container. */
function TopWindowFrame(props: { children: ReactNode; height: number; width: number }): ReactNode {
    return (
        <div
            data-testid="top-frame"
            style={{
                position: "relative",
                width: `${props.width}px`,
                height: `${props.height}px`,
                overflow: "hidden",
            }}
        >
            {props.children}
        </div>
    );
}

function TopCard(): ReactNode {
    return (
        <div
            data-testid="top-card"
            style={{
                boxSizing: "border-box",
                flex: "none",
                height: "461px",
                maxHeight: "100%",
                width: "640px",
                background: "var(--surface-high)",
                border: "1px solid var(--divider)",
                borderRadius: "var(--happy2-radius-shell)",
            }}
        />
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
        "background-color": "rgba(15, 15, 15, 0.75)",
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
    /* Capped 80px under the safe box (460 - 48 = 412 → 332): a clear slice
     * stays free, and the resolved height is a whole pixel for an integer
     * window so the card's hairlines land on physical pixels at 2×. */
    const safeBox = overlayBounds.height - 48;
    expect(dialogBounds.height).toBe(safeBox - 80);
    expect(Number.isInteger(dialogBounds.height)).toBe(true);
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

it("keeps explicit center byte-identical to the attribute-free default placement", async () => {
    const view = createRenderer();
    const centeredModal = (overlay: "default" | "explicit") => (
        <WindowFrame>
            <ModalOverlay
                data-testid={overlay}
                placement={overlay === "explicit" ? "center" : undefined}
            >
                <Modal icon="hash" size="medium" title="Create a channel">
                    Channels organize conversation around a topic.
                </Modal>
            </ModalOverlay>
        </WindowFrame>
    );
    view.render(() => centeredModal("default"), { width: 800, height: 540, padding: 40 });
    view.render(() => centeredModal("explicit"), { width: 800, height: 540, padding: 40 });
    await view.ready();

    const defaultOverlay = view.$('[data-testid="default"]');
    const explicitOverlay = view.$('[data-testid="explicit"]');
    expect(defaultOverlay.element.getAttribute("data-placement")).toBeNull();
    expect(explicitOverlay.element.getAttribute("data-placement")).toBeNull();
    expect(
        explicitOverlay.computedStyles([
            "align-items",
            "container-type",
            "justify-content",
            "padding-top",
        ]),
    ).toEqual(
        defaultOverlay.computedStyles([
            "align-items",
            "container-type",
            "justify-content",
            "padding-top",
        ]),
    );
    expect(view.$('[data-testid="explicit"] [data-happy2-ui="modal-dialog"]').bounds()).toEqual(
        view.$('[data-testid="default"] [data-happy2-ui="modal-dialog"]').bounds(),
    );
}, 120000);

it("anchors top placement at the 720x480 Electron minimum and dismisses from real backdrop coordinates", async () => {
    const dismissed: string[] = [];
    const view = createRenderer();
    view.render(
        () => (
            <TopWindowFrame height={480} width={720}>
                <ModalOverlay
                    data-testid="top-minimum"
                    onDismiss={() => dismissed.push("dismissed")}
                    placement="top"
                    style={{ position: "absolute" }}
                >
                    <TopCard />
                </ModalOverlay>
            </TopWindowFrame>
        ),
        { width: 720, height: 480 },
    );
    await view.ready();

    const overlay = view.$('[data-testid="top-minimum"]');
    const layout = view.$(
        '[data-testid="top-minimum"] [data-happy2-ui="modal-overlay-top-layout"]',
    );
    const card = view.$('[data-testid="top-card"]');
    expect(overlay.element.getAttribute("data-placement")).toBe("top");
    expect(overlay.bounds()).toEqual({ x: 0, y: 0, width: 720, height: 480 });
    expect(
        overlay.computedStyles(["align-items", "container-type", "justify-content", "padding-top"]),
    ).toEqual({
        "align-items": "flex-start",
        "container-type": "size",
        "justify-content": "center",
        "padding-top": "0px",
    });
    expect(
        layout.computedStyles([
            "align-items",
            "justify-content",
            "padding-bottom",
            "padding-left",
            "padding-right",
            "padding-top",
        ]),
    ).toEqual({
        "align-items": "flex-start",
        "justify-content": "center",
        "padding-bottom": "24px",
        "padding-left": "24px",
        "padding-right": "24px",
        "padding-top": "24px",
    });
    expect(card.bounds()).toEqual({ x: 40, y: 24, width: 640, height: 432 });
    expect(card.bounds().x).toBeGreaterThanOrEqual(24);
    expect(overlay.bounds().height - card.bounds().y - card.bounds().height).toBe(24);

    const realPointerClick = async (x: number, y: number) => {
        const rect = layout.element.getBoundingClientRect();
        expect(document.elementFromPoint(rect.left + x, rect.top + y)).toBe(layout.element);
        await userEvent.click(layout.element, { position: { x, y } });
    };
    await realPointerClick(360, 12); // above
    await realPointerClick(20, 252); // beside
    await realPointerClick(360, 468); // below
    expect(dismissed).toEqual(["dismissed", "dismissed", "dismissed"]);

    await view.screenshot("ModalOverlay.top.minimum.test");
}, 120000);

it("anchors top placement at the 1024x704 design reference", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <TopWindowFrame height={704} width={1024}>
                <ModalOverlay
                    data-testid="top-reference"
                    placement="top"
                    style={{ position: "absolute" }}
                >
                    <TopCard />
                </ModalOverlay>
            </TopWindowFrame>
        ),
        { width: 1024, height: 704 },
    );
    await view.ready();

    const overlay = view.$('[data-testid="top-reference"]');
    const layout = view.$(
        '[data-testid="top-reference"] [data-happy2-ui="modal-overlay-top-layout"]',
    );
    const card = view.$('[data-testid="top-card"]');
    expect(overlay.element.getAttribute("data-placement")).toBe("top");
    expect(overlay.bounds()).toEqual({ x: 0, y: 0, width: 1024, height: 704 });
    expect(overlay.computedStyle("container-type")).toBe("size");
    expect(layout.computedStyle("padding-top")).toBe("128px");
    expect(card.bounds()).toEqual({ x: 192, y: 128, width: 640, height: 461 });
    expect(card.bounds().x).toBeGreaterThanOrEqual(24);
    expect(overlay.bounds().height - card.bounds().y - card.bounds().height).toBe(115);

    await view.screenshot("ModalOverlay.top.reference.test");
}, 120000);

function FocusHarness(props: { onDismiss(): void; selfFocusing?: boolean }): ReactNode {
    const [open, setOpen] = useState(false);
    return (
        <WindowFrame>
            <button data-testid="opener" onClick={() => setOpen(true)} type="button">
                Open
            </button>
            {open ? (
                <ModalOverlay
                    onDismiss={() => {
                        props.onDismiss();
                        setOpen(false);
                    }}
                >
                    <Modal onClose={() => setOpen(false)} title="Focus contract">
                        <input
                            autoFocus={props.selfFocusing ? true : undefined}
                            data-testid="field"
                            type="text"
                        />
                    </Modal>
                </ModalOverlay>
            ) : null}
        </WindowFrame>
    );
}

it("moves focus into the dialog on open, closes on Escape without a click, and restores the opener", async () => {
    let dismissed = 0;
    const view = createRenderer().render(
        () => <FocusHarness onDismiss={() => (dismissed += 1)} />,
        { width: 760, height: 500, padding: 20 },
    );
    await view.ready();
    const opener = view.$('[data-testid="opener"]').element as HTMLButtonElement;
    // Open via keyboard: WebKit blurs buttons on pointer click, so keyboard
    // activation is the path where an invoker exists to restore in all three
    // engines (pointer users put focus back with their next click anyway).
    opener.focus();
    await userEvent.keyboard("{Enter}");
    // Focus lands on the dialog's first focusable control at open, so keyboard
    // dismissal works immediately — no preparatory click inside the card.
    const overlay = view.container.querySelector('[data-happy2-ui="modal-overlay"]')!;
    expect(overlay.contains(document.activeElement)).toBe(true);
    await userEvent.keyboard("{Escape}");
    expect(dismissed).toBe(1);
    expect(view.container.querySelector('[data-happy2-ui="modal-overlay"]')).toBeNull();
    // Closing hands focus back to the control that opened the dialog.
    expect(document.activeElement).toBe(opener);
});

it("does not steal focus from a card that already focused itself", async () => {
    const view = createRenderer().render(
        () => <FocusHarness onDismiss={() => undefined} selfFocusing />,
        { width: 760, height: 500, padding: 20 },
    );
    await view.ready();
    await userEvent.click(view.$('[data-testid="opener"]').element);
    expect(document.activeElement).toBe(view.$('[data-testid="field"]').element);
});
