import { type ReactNode } from "react";
import { PolicyControl } from "../../src/PolicyControl";
import { ComponentPage, DimensionRule, Specimen } from "../kit";
function Panel(props: { children: ReactNode; width?: number }) {
    return <div style={{ width: `${props.width ?? 400}px` }}>{props.children}</div>;
}
export function PolicyControlPage() {
    return (
        <ComponentPage
            number="C-041"
            summary="Disappearing / retention policy editor composing SegmentedControl, Select, Switch, and FormRow. Conditional rows reveal a duration Select and after-read Switch only when the mode calls for them."
            title="Policy control"
        >
            <div className="specimen-grid">
                <Specimen
                    detail="expiry Off — segmented only, no timer, no retention"
                    label="Disabled"
                    number="P-01"
                    stage="app"
                >
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        <Panel>
                            <PolicyControl afterReadScope="any_reader" expiryMode="none" />
                        </Panel>
                        <DimensionRule label="card 400 · padding 20 · radius 10" />
                    </div>
                </Specimen>

                <Specimen
                    detail="after sending — timer Select revealed, no after-read switch"
                    label="After sending"
                    number="P-02"
                    stage="app"
                >
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        <Panel>
                            <PolicyControl
                                afterReadScope="any_reader"
                                expiryMode="after_send"
                                selfDestructSeconds={3600}
                            />
                        </Panel>
                        <DimensionRule label="segmented 36 · section gap 16" />
                    </div>
                </Specimen>
            </div>

            <div className="specimen-grid">
                <Specimen
                    detail="after reading — timer Select + wait-for-all-readers Switch + retention section"
                    label="Full policy"
                    number="P-03"
                    stage="app"
                >
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        <Panel>
                            <PolicyControl
                                afterReadScope="all_readers"
                                expiryMode="after_read"
                                retentionMode="duration"
                                retentionSeconds={2592000}
                                selfDestructSeconds={86400}
                            />
                        </Panel>
                        <DimensionRule label="two sections · 1px rule · 20px gap" />
                    </div>
                </Specimen>

                <Specimen
                    detail="retention inherit / keep forever — duration Select stays hidden"
                    label="Retention modes"
                    number="P-04"
                    stage="app"
                >
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        <Panel>
                            <PolicyControl
                                afterReadScope="any_reader"
                                expiryMode="none"
                                retentionMode="forever"
                            />
                        </Panel>
                        <DimensionRule label="retention forever · no duration row" />
                    </div>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
