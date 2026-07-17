import type { JSX } from "solid-js";
import { Button } from "../../src/Button";
import { Modal } from "../../src/Modal";
import { ModalOverlay } from "../../src/ModalOverlay";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/*
 * The overlay is `position: fixed`; a transformed wrapper establishes a
 * containing block so the specimen renders it inside a bounded, screenshot-safe
 * window frame instead of escaping to the viewport.
 */
function WindowFrame(props: { children: JSX.Element; width: number; height: number }) {
    return (
        <div
            style={{
                position: "relative",
                width: `${props.width}px`,
                height: `${props.height}px`,
                overflow: "hidden",
                transform: "translateZ(0)",
                "border-radius": "8px",
                border: "1px solid var(--happy2-border-strong)",
                background: "var(--happy2-bg-app)",
            }}
        >
            {props.children}
        </div>
    );
}

export function ModalOverlayPage() {
    return (
        <ComponentPage
            number="C-058"
            summary="The single backdrop every modal-class surface sits on — one dim (scrim), one stacking level, fixed to the app window, centering a single card inside a 24px safe-area gutter. Clicking the dim outside the card dismisses when wired."
            title="Modal overlay"
        >
            <div class="specimen-grid">
                <Specimen
                    detail="scrim dim · card centered · 24px safe-area gutter"
                    label="Backdrop"
                    number="O-01"
                    stage="app"
                >
                    <WindowFrame height={420} width={720}>
                        <ModalOverlay onDismiss={() => {}}>
                            <Modal
                                footer={
                                    <>
                                        <Button size="medium" variant="ghost">
                                            Cancel
                                        </Button>
                                        <Button size="medium" variant="primary">
                                            Create channel
                                        </Button>
                                    </>
                                }
                                icon="hash"
                                onClose={() => {}}
                                size="medium"
                                title="Create a channel"
                            >
                                Channels organize conversation around a topic. People can join or
                                leave them at any time.
                            </Modal>
                        </ModalOverlay>
                    </WindowFrame>
                </Specimen>
            </div>

            <div class="specimen-grid">
                <Specimen
                    detail="fixed inset:0 · z-index var(--happy2-z-overlay) · 24px gutter"
                    label="Anatomy"
                    number="O-02"
                    stage="app"
                >
                    <div style={{ display: "flex", "flex-direction": "column", gap: "10px" }}>
                        <DimensionRule label="24px safe-area gutter" />
                        <WindowFrame height={300} width={560}>
                            <ModalOverlay onDismiss={() => {}}>
                                <Modal
                                    icon="link"
                                    onClose={() => {}}
                                    size="small"
                                    title="Copy link"
                                >
                                    Anyone with this link can join as a guest until it is revoked.
                                </Modal>
                            </ModalOverlay>
                        </WindowFrame>
                    </div>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
