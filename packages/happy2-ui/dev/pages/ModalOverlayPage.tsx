import { type ReactNode } from "react";
import { Button } from "../../src/Button";
import { CommandPalette } from "../../src/CommandPalette";
import { EmptyState } from "../../src/EmptyState";
import { Modal } from "../../src/Modal";
import { ModalOverlay } from "../../src/ModalOverlay";
import { ComponentPage, DimensionRule, Specimen } from "../kit";
/*
 * The overlay is `position: fixed`; a transformed wrapper establishes a
 * containing block so the specimen renders it inside a bounded, screenshot-safe
 * window frame instead of escaping to the viewport.
 */
function WindowFrame(props: { children: ReactNode; width: number; height: number }) {
    return (
        <div
            style={{
                position: "relative",
                width: `${props.width}px`,
                height: `${props.height}px`,
                overflow: "hidden",
                transform: "translateZ(0)",
                borderRadius: "8px",
                border: "1px solid var(--surface-pressed-overlay)",
                background: "var(--groupped-background)",
            }}
        >
            {props.children}
        </div>
    );
}

/* Top-placement specimens use a real-sized, non-transformed host. Positioning
 * the overlay absolutely bounds it to this frame while its cqh gutter resolves
 * from the overlay's own size container. The inset shadow marks the frame edge
 * without consuming any of its declared dimensions. */
function TopWindowFrame(props: { children: ReactNode; width: number; height: number }) {
    return (
        <div
            style={{
                position: "relative",
                width: `${props.width}px`,
                height: `${props.height}px`,
                overflow: "hidden",
                borderRadius: "8px",
                background: "var(--groupped-background)",
                boxShadow: "inset 0 0 0 1px var(--surface-pressed-overlay)",
            }}
        >
            {props.children}
        </div>
    );
}

function TopPalette() {
    return (
        <CommandPalette
            autoFocus={false}
            onClose={() => {}}
            onQueryChange={() => {}}
            placeholder="Search Happy (2)…"
            query=""
        >
            <EmptyState
                description="Find channels, people, messages, and files across your workspace."
                icon="search"
                size="inline"
                title="Search Happy (2)"
            />
        </CommandPalette>
    );
}
export function ModalOverlayPage() {
    return (
        <ComponentPage
            number="C-058"
            summary="The single backdrop every modal-class surface sits on — one dim and stacking level with a 24px minimum safe area. Dialogs center by default; transient type-ahead surfaces may use the adaptive top placement."
            title="Modal overlay"
        >
            <div className="specimen-grid">
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

            <div className="specimen-grid">
                <Specimen
                    detail="fixed inset:0 · z-index var(--happy2-z-overlay) · 24px gutter"
                    label="Anatomy"
                    number="O-02"
                    stage="app"
                >
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
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

            <div className="specimen-grid">
                <Specimen
                    detail="720 × 480 Electron minimum · 48px top · 24px bottom · palette shrinks to 408px"
                    label="Top — Electron minimum"
                    number="O-03"
                    stage="app"
                >
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        <DimensionRule label="720 × 480 host · top gutter 48" />
                        <TopWindowFrame height={480} width={720}>
                            <ModalOverlay
                                onDismiss={() => {}}
                                placement="top"
                                style={{ position: "absolute" }}
                            >
                                <TopPalette />
                            </ModalOverlay>
                        </TopWindowFrame>
                    </div>
                </Specimen>
            </div>

            <div className="specimen-grid">
                <Specimen
                    detail="1024 × 704 design reference · 128px top · full 461px palette frame"
                    label="Top — design reference"
                    number="O-04"
                    stage="app"
                >
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        <DimensionRule label="1024 × 704 host · top gutter 128" />
                        <TopWindowFrame height={704} width={1024}>
                            <ModalOverlay
                                onDismiss={() => {}}
                                placement="top"
                                style={{ position: "absolute" }}
                            >
                                <TopPalette />
                            </ModalOverlay>
                        </TopWindowFrame>
                    </div>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
