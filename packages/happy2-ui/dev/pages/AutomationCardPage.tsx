import { AutomationCard } from "../../src/AutomationCard";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

const noop = () => {};

export function AutomationCardPage() {
    return (
        <ComponentPage
            number="C-044"
            summary="Automation summary — trigger→action identity badges, an active toggle, run metadata, a run-now action, and a danger banner for the last error."
            title="Automation card"
        >
            <div className="specimen-grid">
                <Specimen
                    detail="400px card · 16px padding · radius 10 · 12px row rhythm"
                    label="Anatomy"
                    number="C-044·A"
                    stage="app"
                >
                    <div style={{ display: "grid", gap: "6px", width: "400px", padding: "28px" }}>
                        <DimensionRule label="width 400" />
                        <AutomationCard
                            active
                            actionLabel="Post to #general"
                            actionType="send_message"
                            lastRunLabel="Last run 2h ago"
                            name="Daily digest"
                            nextRunLabel="Next in 22h"
                            onRun={noop}
                            onToggleActive={noop}
                            triggerLabel="Every day at 09:00"
                            triggerType="schedule"
                        />
                    </div>
                </Specimen>
            </div>

            <div className="specimen-grid">
                <Specimen
                    detail="schedule info · event accent · webhook warning"
                    label="Trigger types"
                    number="C-044·B"
                    stage="app"
                >
                    <div
                        style={{
                            display: "flex",
                            flexWrap: "wrap",
                            alignItems: "flex-start",
                            gap: "24px",
                            padding: "28px",
                        }}
                    >
                        <div style={{ width: "400px" }}>
                            <AutomationCard
                                active
                                actionLabel="Post to #ops"
                                actionType="send_message"
                                lastRunLabel="Last run 2h ago"
                                name="Standup reminder"
                                nextRunLabel="Next in 22h"
                                onRun={noop}
                                onToggleActive={noop}
                                triggerLabel="Weekdays at 09:00"
                                triggerType="schedule"
                            />
                        </div>
                        <div style={{ width: "400px" }}>
                            <AutomationCard
                                active
                                actionLabel="Notify moderators"
                                actionType="call_webhook"
                                lastRunLabel="Ran 4m ago"
                                name="On new member"
                                onRun={noop}
                                onToggleActive={noop}
                                triggerLabel="When a member joins"
                                triggerType="event"
                            />
                        </div>
                        <div style={{ width: "400px" }}>
                            <AutomationCard
                                active
                                actionLabel="Escalate to on-call"
                                actionType="moderate"
                                lastRunLabel="Ran 12s ago"
                                name="Inbound alert relay"
                                onRun={noop}
                                onToggleActive={noop}
                                triggerLabel="POST /hooks/alerts"
                                triggerType="webhook"
                            />
                        </div>
                    </div>
                </Specimen>
            </div>

            <div className="specimen-grid">
                <Specimen
                    detail="active · paused (switch off) · error banner · minimal"
                    label="States"
                    number="C-044·C"
                    stage="app"
                >
                    <div
                        style={{
                            display: "flex",
                            flexWrap: "wrap",
                            alignItems: "flex-start",
                            gap: "24px",
                            padding: "28px",
                        }}
                    >
                        <div style={{ width: "400px" }}>
                            <AutomationCard
                                active={false}
                                actionLabel="Post to #general"
                                actionType="send_message"
                                lastRunLabel="Paused 3d ago"
                                name="Daily digest"
                                onRun={noop}
                                onToggleActive={noop}
                                triggerLabel="Every day at 09:00"
                                triggerType="schedule"
                            />
                        </div>
                        <div style={{ width: "400px" }}>
                            <AutomationCard
                                active
                                actionLabel="Escalate to on-call"
                                actionType="moderate"
                                error="Webhook returned 500 — 3 retries failed."
                                lastRunLabel="Failed 8m ago"
                                name="Inbound alert relay"
                                onRun={noop}
                                onToggleActive={noop}
                                triggerLabel="POST /hooks/alerts"
                                triggerType="webhook"
                            />
                        </div>
                        <div style={{ width: "400px" }}>
                            <AutomationCard
                                active
                                actionType="send_message"
                                name="Welcome message"
                                onToggleActive={noop}
                                triggerType="event"
                            />
                        </div>
                    </div>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
