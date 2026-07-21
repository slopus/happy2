import { type ReactNode } from "react";
import { NotificationList, type NotificationItem } from "../../src/NotificationList";
import { ComponentPage, DimensionRule, Specimen } from "../kit";
const inbox: NotificationItem[] = [
    {
        id: "n1",
        kind: "mention",
        actor: { name: "Ada Lovelace", initials: "AL", tone: "violet" },
        text: [
            { kind: "text", text: "mentioned you in " },
            { kind: "mention", text: "eng-core" },
        ],
        context: "Can you review the analytical engine diff before the launch?",
        time: "2m",
        unread: true,
    },
    {
        id: "n2",
        kind: "direct_message",
        actor: { name: "Grace Hopper", initials: "GH", tone: "ocean" },
        text: "sent you a direct message",
        context: "Re: Nanosecond wire lengths",
        time: "14m",
        unread: true,
    },
    {
        id: "n3",
        kind: "direct_message",
        actor: { name: "Katherine Johnson", initials: "KJ", tone: "mint" },
        text: "sent you a direct message",
        context: "The trajectory numbers check out — nice work.",
        time: "38m",
        unread: true,
    },
    {
        id: "n4",
        kind: "reaction",
        actor: { name: "Alan Turing", initials: "AT", tone: "amber" },
        text: [
            { kind: "text", text: "reacted " },
            { kind: "code", text: ":sparkles:" },
            { kind: "text", text: " to your message" },
        ],
        context: "in #general",
        time: "1h",
    },
    {
        id: "n5",
        kind: "moderation",
        actor: { name: "Trust & Safety", initials: "TS", tone: "rose" },
        text: "flagged a message for review",
        context: "3 reports in #support-fires",
        time: "2h",
    },
    {
        id: "n6",
        kind: "system",
        text: "Nightly backup completed successfully",
        context: "Retention job · 4.2 GB archived",
        time: "5h",
    },
];
function Frame(props: { children: ReactNode; width: number }) {
    return <div style={{ width: `${props.width}px` }}>{props.children}</div>;
}
export function NotificationListPage() {
    return (
        <ComponentPage
            number="C-035"
            summary="The activity inbox — fixed 64px rows with an unread dot, actor avatar carrying a per-kind glyph badge, notification text with a muted context line, and a right-aligned timestamp."
            title="Notification list"
        >
            <Specimen
                detail="row 64 · avatar 36 · corner glyph 18 · unread dot 8 · pad 0 16 · card radius 10"
                label="Activity inbox"
                number="01"
                stage="app"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <Frame width={440}>
                        <NotificationList notifications={inbox} onSelect={() => {}} />
                    </Frame>
                    <DimensionRule label="440 px wide · rows 64 px on a 4px grid" />
                </div>
            </Specimen>

            <Specimen
                detail="Every kind: mention · DM · reaction · call · system · moderation · automation"
                label="Kinds and tones"
                number="02"
                stage="app"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <Frame width={440}>
                        <NotificationList
                            notifications={[
                                {
                                    id: "k1",
                                    kind: "mention",
                                    actor: { name: "Ada Lovelace", initials: "AL", tone: "violet" },
                                    text: "mentioned you",
                                    context: "in #eng-core",
                                    time: "2m",
                                },
                                {
                                    id: "k3",
                                    kind: "direct_message",
                                    actor: {
                                        name: "Katherine Johnson",
                                        initials: "KJ",
                                        tone: "mint",
                                    },
                                    text: "sent a direct message",
                                    context: "Trajectory looks good",
                                    time: "20m",
                                },
                                {
                                    id: "k4",
                                    kind: "reaction",
                                    actor: { name: "Alan Turing", initials: "AT", tone: "amber" },
                                    text: "reacted to your message",
                                    context: "in #general",
                                    time: "41m",
                                },
                                {
                                    id: "k5",
                                    kind: "call",
                                    actor: { name: "Maya Johnson", initials: "MJ", tone: "rose" },
                                    text: "started a call",
                                    context: "Design sync · 4 joined",
                                    time: "1h",
                                },
                                {
                                    id: "k6",
                                    kind: "automation",
                                    actor: { name: "Triage bot", initials: "TB", tone: "brand" },
                                    text: "ran a scheduled workflow",
                                    context: "Assigned 3 issues",
                                    time: "3h",
                                },
                            ]}
                            onSelect={() => {}}
                        />
                    </Frame>
                    <DimensionRule label="per-kind glyph + tone · corner badge on the actor avatar" />
                </div>
            </Specimen>

            <Specimen
                detail="Actor-less kind tiles · read vs unread background token · empty state"
                label="Tiles, states, and empty"
                number="03"
                stage="app"
            >
                <div style={{ display: "flex", gap: "18px", flexWrap: "wrap" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        <Frame width={360}>
                            <NotificationList
                                notifications={[
                                    {
                                        id: "s1",
                                        kind: "system",
                                        text: "Backup completed",
                                        context: "Retention job",
                                        time: "5h",
                                        unread: true,
                                    },
                                    {
                                        id: "s2",
                                        kind: "moderation",
                                        text: "Report queue updated",
                                        context: "2 items awaiting review",
                                        time: "6h",
                                    },
                                    {
                                        id: "s3",
                                        kind: "automation",
                                        text: "Webhook delivered",
                                        context: "deploy.succeeded",
                                        time: "1d",
                                    },
                                ]}
                                onSelect={() => {}}
                            />
                        </Frame>
                        <DimensionRule label="tile 36 · icon 16 · unread = accent-soft row" />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        <Frame width={360}>
                            <NotificationList
                                emptyLabel="You're all caught up"
                                notifications={[]}
                            />
                        </Frame>
                        <DimensionRule label="empty state · muted centered" />
                    </div>
                </div>
            </Specimen>
        </ComponentPage>
    );
}
