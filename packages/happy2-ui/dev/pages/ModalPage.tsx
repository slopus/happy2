import { Button } from "../../src/Button";
import { Modal } from "../../src/Modal";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

function ConfirmFooter(props: { confirmLabel: string; danger?: boolean }) {
    return (
        <>
            <Button size="medium" variant="ghost">
                Cancel
            </Button>
            <Button size="medium" variant={props.danger ? "danger" : "primary"}>
                {props.confirmLabel}
            </Button>
        </>
    );
}

export function ModalPage() {
    return (
        <ComponentPage
            number="C-028"
            summary="Dialog card — header (leading icon chip · title · close) / body / right-aligned footer actions, three fixed widths on a 14px shell radius. Rendered as a specimen card; a host portals it over its own backdrop."
            title="Modal"
        >
            <div className="specimen-grid specimen-grid--sizes">
                <Specimen detail="width 360" label="Small" number="M-01" stage="app">
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        <DimensionRule label="width 360" />
                        <Modal icon="link" onClose={() => {}} size="small" title="Copy invite link">
                            Anyone with this link can join #launch-week as a guest until it is
                            revoked.
                        </Modal>
                    </div>
                </Specimen>
                <Specimen detail="width 480" label="Medium" number="M-02" stage="app">
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        <DimensionRule label="width 480" />
                        <Modal
                            footer={<ConfirmFooter confirmLabel="Create channel" />}
                            icon="hash"
                            onClose={() => {}}
                            size="medium"
                            title="Create a channel"
                        >
                            Channels organize conversation around a topic. People can join or leave
                            them at any time.
                        </Modal>
                    </div>
                </Specimen>
                <Specimen detail="width 640" label="Large" number="M-03" stage="app">
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        <DimensionRule label="width 640" />
                        <Modal
                            footer={
                                <>
                                    <Button size="medium" variant="ghost">
                                        Back
                                    </Button>
                                    <Button size="medium" variant="primary">
                                        Save changes
                                    </Button>
                                </>
                            }
                            icon="settings"
                            onClose={() => {}}
                            size="large"
                            title="Channel settings"
                        >
                            Update the channel name, topic, retention policy, and membership.
                            Changes apply immediately for everyone in the channel.
                        </Modal>
                    </div>
                </Specimen>
            </div>

            <div className="specimen-grid">
                <Specimen
                    detail="tone default (accent chip) vs danger (danger chip + danger action)"
                    label="Tone"
                    number="M-04"
                    stage="app"
                >
                    <div
                        style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "24px",
                            padding: "8px",
                        }}
                    >
                        <Modal
                            footer={<ConfirmFooter confirmLabel="Save" />}
                            icon="bell"
                            onClose={() => {}}
                            size="small"
                            title="Notification defaults"
                        >
                            Choose how you are notified about activity in this workspace.
                        </Modal>
                        <Modal
                            footer={<ConfirmFooter confirmLabel="Delete run" danger />}
                            icon="shield"
                            onClose={() => {}}
                            size="small"
                            title="Delete agent run"
                            tone="danger"
                        >
                            This permanently deletes the run and its transcript. This action cannot
                            be undone.
                        </Modal>
                    </div>
                </Specimen>
            </div>

            <div className="specimen-grid">
                <Specimen
                    detail="header 60 · body · footer 69 (with 1px top hairline)"
                    label="Anatomy"
                    number="M-05"
                    stage="app"
                >
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        <DimensionRule label="header 60 · footer 69" />
                        <Modal
                            footer={<ConfirmFooter confirmLabel="Confirm" />}
                            icon="spark"
                            onClose={() => {}}
                            size="medium"
                            title="Header, body, footer"
                        >
                            The header is a fixed 60px control row; the body is a scrollable slot
                            with a 20px inset; the footer right-aligns its action buttons.
                        </Modal>
                    </div>
                </Specimen>
                <Specimen
                    detail="no icon · no footer · no close — title + body only"
                    label="Minimal"
                    number="M-06"
                    stage="app"
                >
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        <DimensionRule label="width 360 · header 60" />
                        <Modal size="small" title="Saving changes">
                            Your changes are being applied. This dialog closes automatically when
                            the update completes.
                        </Modal>
                    </div>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
