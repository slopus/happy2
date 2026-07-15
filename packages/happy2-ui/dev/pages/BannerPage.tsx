import { Banner } from "../../src/Banner";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

const noop = () => {};

export function BannerPage() {
    return (
        <ComponentPage
            number="C-023"
            summary="Inline alert — soft tone fill, hairline border, tone-colored leading icon. Five tones, optional title, action, and dismiss."
            title="Banner"
        >
            <div class="specimen-grid">
                <Specimen
                    detail="info · success · warning · danger · neutral — 66px (title + message)"
                    label="Tones"
                    number="C-023-01"
                    stage="surface"
                >
                    <div style={{ display: "grid", width: "460px", gap: "16px", padding: "24px" }}>
                        <DimensionRule label="width 460 · radius 10 · height 66" />
                        <Banner
                            icon="spark"
                            onDismiss={noop}
                            title="New retention policy"
                            tone="info"
                        >
                            Messages in #eng-core now expire 30 days after they are read.
                        </Banner>
                        <Banner
                            icon="check-circle"
                            onDismiss={noop}
                            title="Backup complete"
                            tone="success"
                        >
                            Last night&rsquo;s workspace snapshot finished and was verified.
                        </Banner>
                        <Banner
                            icon="shield"
                            onDismiss={noop}
                            title="Approval required"
                            tone="warning"
                        >
                            An agent is waiting to edit a guarded configuration file.
                        </Banner>
                        <Banner icon="bell" onDismiss={noop} title="Delivery failed" tone="danger">
                            Two automation webhooks could not be reached and were retried.
                        </Banner>
                        <Banner icon="eye" onDismiss={noop} title="Read receipts on" tone="neutral">
                            Everyone in this channel can see when you have read a message.
                        </Banner>
                    </div>
                </Specimen>
            </div>

            <div class="specimen-grid">
                <Specimen
                    detail="message only · no icon · with action — 44px single line"
                    label="Content states"
                    number="C-023-02"
                    stage="surface"
                >
                    <div style={{ display: "grid", width: "460px", gap: "16px", padding: "24px" }}>
                        <DimensionRule label="single line · height 44" />
                        <Banner icon="spark" tone="info">
                            Your workspace switched to the new retention policy.
                        </Banner>
                        <Banner tone="neutral">
                            No icon — the message leads at the 15px content inset.
                        </Banner>
                        <Banner icon="bell" onDismiss={noop} tone="danger">
                            A scheduled message could not be sent.
                        </Banner>
                    </div>
                </Specimen>
            </div>

            <div class="specimen-grid">
                <Specimen
                    detail="action Button (small · secondary) + dismiss"
                    label="Actions"
                    number="C-023-03"
                    stage="surface"
                >
                    <div style={{ display: "grid", width: "460px", gap: "16px", padding: "24px" }}>
                        <DimensionRule label="action row · dismiss pinned right (inset 15)" />
                        <Banner
                            action={{ label: "Review", onClick: noop }}
                            icon="shield"
                            onDismiss={noop}
                            title="Guarded change pending"
                            tone="warning"
                        >
                            An agent requested access to production credentials.
                        </Banner>
                        <Banner
                            action={{ label: "Retry", onClick: noop }}
                            icon="bell"
                            tone="danger"
                        >
                            The nightly digest failed to deliver to 3 members.
                        </Banner>
                    </div>
                </Specimen>

                <Specimen
                    detail="constrained width — the message wraps and the icon rides the block center"
                    label="Wrapping"
                    number="C-023-04"
                    stage="surface"
                >
                    <div style={{ display: "grid", width: "300px", gap: "16px", padding: "24px" }}>
                        <DimensionRule label="width 300 · message wraps" />
                        <Banner icon="spark" title="Heads up" tone="info">
                            This channel is archived, so new messages are disabled until an admin
                            restores it.
                        </Banner>
                    </div>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
