import { Button } from "../../src/Button";
import { ModerationReportCard } from "../../src/ModerationReportCard";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

function QueueActions() {
    return (
        <>
            <Button size="small" variant="ghost">
                Dismiss
            </Button>
            <Button size="small" variant="secondary">
                Assign to me
            </Button>
            <Button icon="check" size="small">
                Resolve
            </Button>
        </>
    );
}

export function ModerationReportCardPage() {
    return (
        <ComponentPage
            number="C-045"
            summary="Moderation queue item — kind chip + target descriptor, status badge, inset reason well, reporter/assignee credits, and a resolution action row."
            title="Moderation report card"
        >
            <div className="specimen-grid">
                <Specimen
                    detail="440px card · 16px padding · radius 10 · 12px rhythm"
                    label="Anatomy"
                    number="C-045·A"
                    stage="app"
                >
                    <div style={{ display: "grid", gap: "6px", width: "440px", padding: "28px" }}>
                        <DimensionRule label="width 440" />
                        <ModerationReportCard
                            actions={<QueueActions />}
                            reason="Spam — repeated promotional links"
                            reporter={{ initials: "AL", name: "Ada Lovelace", tone: "violet" }}
                            assignee={{ initials: "GH", name: "Grace Hopper", tone: "mint" }}
                            status="open"
                            target={{
                                kind: "message",
                                label: "Suspicious link drop",
                                sub: "@nova in #general",
                            }}
                            time="2m ago"
                        />
                    </div>
                </Specimen>

                <Specimen
                    detail="open amber · reviewing blue · resolved mint · dismissed muted"
                    label="Status"
                    number="C-045·B"
                    stage="app"
                >
                    <div
                        style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "16px",
                            padding: "28px",
                        }}
                    >
                        <div style={{ width: "420px" }}>
                            <ModerationReportCard
                                reason="Spam"
                                reporter={{ initials: "AL", name: "Ada Lovelace", tone: "violet" }}
                                status="open"
                                target={{
                                    kind: "message",
                                    label: "Suspicious link drop",
                                    sub: "@nova in #general",
                                }}
                                time="2m ago"
                            />
                        </div>
                        <div style={{ width: "420px" }}>
                            <ModerationReportCard
                                assignee={{ initials: "GH", name: "Grace Hopper", tone: "mint" }}
                                reason="Harassment"
                                reporter={{ initials: "JR", name: "Joan Rivers", tone: "rose" }}
                                status="reviewing"
                                target={{
                                    kind: "user",
                                    label: "@throwaway_9182",
                                    sub: "joined 3 days ago",
                                }}
                                time="18m ago"
                            />
                        </div>
                        <div style={{ width: "420px" }}>
                            <ModerationReportCard
                                assignee={{ initials: "GH", name: "Grace Hopper", tone: "mint" }}
                                reason="Off-topic"
                                reporter={{ initials: "KT", name: "Katherine T.", tone: "ocean" }}
                                status="resolved"
                                target={{
                                    kind: "chat",
                                    label: "#promo-blast",
                                    sub: "128 members",
                                }}
                                time="1h ago"
                            />
                        </div>
                        <div style={{ width: "420px" }}>
                            <ModerationReportCard
                                reason="No violation found"
                                reporter={{ initials: "MK", name: "Margaret K.", tone: "amber" }}
                                status="dismissed"
                                target={{
                                    kind: "file",
                                    label: "quarterly-plan.pdf",
                                    sub: "2.4 MB · uploaded by @dev",
                                }}
                                time="yesterday"
                            />
                        </div>
                    </div>
                </Specimen>
            </div>

            <div className="specimen-grid">
                <Specimen
                    detail="user · chat · message · file — kind chip glyph"
                    label="Target kinds"
                    number="C-045·C"
                    stage="app"
                >
                    <div
                        style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "16px",
                            padding: "28px",
                        }}
                    >
                        <div style={{ width: "420px" }}>
                            <ModerationReportCard
                                reason="Impersonation"
                                reporter={{ initials: "AL", name: "Ada Lovelace", tone: "violet" }}
                                status="open"
                                target={{
                                    kind: "user",
                                    label: "@grace_hopper",
                                    sub: "profile flagged",
                                }}
                                time="4m ago"
                            />
                        </div>
                        <div style={{ width: "420px" }}>
                            <ModerationReportCard
                                reason="Raid channel"
                                reporter={{ initials: "JR", name: "Joan Rivers", tone: "rose" }}
                                status="open"
                                target={{
                                    kind: "chat",
                                    label: "#free-crypto",
                                    sub: "created 1h ago",
                                }}
                                time="6m ago"
                            />
                        </div>
                        <div style={{ width: "420px" }}>
                            <ModerationReportCard
                                reason="NSFW content"
                                reporter={{ initials: "KT", name: "Katherine T.", tone: "ocean" }}
                                status="open"
                                target={{
                                    kind: "message",
                                    label: "Inappropriate image",
                                    sub: "@nova in #random",
                                }}
                                time="11m ago"
                            />
                        </div>
                        <div style={{ width: "420px" }}>
                            <ModerationReportCard
                                reason="Malware"
                                reporter={{ initials: "MK", name: "Margaret K.", tone: "amber" }}
                                status="open"
                                target={{
                                    kind: "file",
                                    label: "invoice.exe",
                                    sub: "1.1 MB · flagged by scanner",
                                }}
                                time="14m ago"
                            />
                        </div>
                    </div>
                </Specimen>
            </div>

            <div className="specimen-grid">
                <Specimen
                    detail="minimal · details paragraph · full action row"
                    label="Content states"
                    number="C-045·D"
                    stage="app"
                >
                    <div
                        style={{
                            display: "flex",
                            flexWrap: "wrap",
                            alignItems: "flex-start",
                            gap: "16px",
                            padding: "28px",
                        }}
                    >
                        <div style={{ width: "420px" }}>
                            <ModerationReportCard
                                reason="Spam"
                                reporter={{ initials: "AL", name: "Ada Lovelace", tone: "violet" }}
                                status="open"
                                target={{ kind: "message", label: "Suspicious link drop" }}
                                time="2m ago"
                            />
                        </div>
                        <div style={{ width: "420px" }}>
                            <ModerationReportCard
                                details="Reporter says the account has DM'd the same referral link to at least a dozen members in the last hour."
                                reason="Coordinated spam"
                                reporter={{ initials: "JR", name: "Joan Rivers", tone: "rose" }}
                                status="reviewing"
                                target={{
                                    kind: "user",
                                    label: "@throwaway_9182",
                                    sub: "joined 3 days ago",
                                }}
                                time="18m ago"
                            />
                        </div>
                        <div style={{ width: "440px" }}>
                            <ModerationReportCard
                                actions={<QueueActions />}
                                details="Multiple members reported the same promotional link within minutes of each other."
                                reason="Spam — repeated promotional links"
                                reporter={{ initials: "AL", name: "Ada Lovelace", tone: "violet" }}
                                assignee={{ initials: "GH", name: "Grace Hopper", tone: "mint" }}
                                status="open"
                                target={{
                                    kind: "message",
                                    label: "Suspicious link drop",
                                    sub: "@nova in #general",
                                }}
                                time="2m ago"
                            />
                        </div>
                    </div>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
