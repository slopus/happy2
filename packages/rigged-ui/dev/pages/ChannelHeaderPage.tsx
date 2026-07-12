import { Button } from "../../src/Button";
import { ChannelHeader, type ChannelMember } from "../../src/ChannelHeader";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

const column: Record<string, string> = {
    display: "flex",
    "flex-direction": "column",
    gap: "14px",
};

const crew: ChannelMember[] = [
    { initials: "MJ", tone: "amber" },
    { initials: "SK", tone: "mint" },
    { initials: "CX", tone: "ember", type: "agent" },
    { initials: "LP", tone: "ocean" },
];

function actions() {
    return (
        <>
            <Button aria-label="Notifications" icon="bell" iconOnly size="small" variant="ghost" />
            <Button aria-label="Members" icon="users" iconOnly size="small" variant="ghost" />
            <Button aria-label="More" icon="more" iconOnly size="small" variant="ghost" />
        </>
    );
}

export function ChannelHeaderPage() {
    return (
        <ComponentPage
            number="C-011"
            summary="52px context strip across the top of the main surface: channel identity and topic on the left, membership facepile, agent chip, and actions on the right."
            title="ChannelHeader"
        >
            <Specimen
                detail="52px high · 16px x-pad · bottom hairline · facepile + count + agent chip + actions"
                label="Full channel header"
                number="01"
                stage="app"
            >
                <div style={column}>
                    <div style={{ width: "820px" }}>
                        <ChannelHeader
                            actions={actions()}
                            agentCount={3}
                            memberCount={12}
                            members={crew}
                            title="launch-week"
                            topic="Ship mobile v2 by Fri"
                        />
                    </div>
                    <DimensionRule label="52 px high · 16 px x-pad" />
                </div>
            </Specimen>

            <Specimen
                detail="hash · spark · inbox — 16px muted icon, title 15/700"
                label="Icon variants"
                number="02"
                stage="app"
            >
                <div style={{ ...column, width: "680px" }}>
                    <ChannelHeader
                        agentCount={2}
                        memberCount={24}
                        members={crew.slice(0, 3)}
                        title="eng-core"
                        topic="Runtime, infra, and the auth stack"
                    />
                    <ChannelHeader
                        icon="spark"
                        title="Agent runs"
                        topic="Every run across the workspace"
                    />
                    <ChannelHeader icon="inbox" memberCount={4} title="Inbox" />
                </div>
            </Specimen>

            <Specimen
                detail="Title only — every right-side part is optional"
                label="Minimal"
                number="03"
                stage="app"
            >
                <div style={{ width: "520px" }}>
                    <ChannelHeader title="design" />
                </div>
            </Specimen>

            <Specimen
                detail="Topic truncates with an ellipsis; the meta cluster never shrinks"
                label="Narrow — truncating topic"
                number="04"
                stage="app"
            >
                <div style={column}>
                    <div style={{ width: "440px" }}>
                        <ChannelHeader
                            agentCount={1}
                            memberCount={9}
                            members={crew.slice(0, 2)}
                            title="support-fires"
                            topic="Escalations, refunds, and the weekly pager review that never seems to end"
                        />
                    </div>
                    <DimensionRule label="440 px container" />
                </div>
            </Specimen>

            <Specimen
                detail="Up to 3 xs avatars, -6px overlap, app-bg gap ring + hairline"
                label="Facepile density"
                number="05"
                stage="app"
            >
                <div style={{ ...column, width: "560px" }}>
                    <ChannelHeader memberCount={2} members={crew.slice(0, 1)} title="one" />
                    <ChannelHeader memberCount={5} members={crew.slice(0, 2)} title="two" />
                    <ChannelHeader memberCount={31} members={crew} title="clamped-at-three" />
                </div>
            </Specimen>

            <Specimen
                detail="Ghost icon buttons compose into the actions slot, pinned to the right edge"
                label="Actions slot"
                number="06"
                stage="app"
            >
                <div style={{ width: "640px" }}>
                    <ChannelHeader actions={actions()} title="incidents" topic="Sev-1 war room" />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
