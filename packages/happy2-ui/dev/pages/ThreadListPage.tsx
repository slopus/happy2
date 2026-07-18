import { ThreadList, type ThreadItem } from "../../src/ThreadList";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

const followed: ThreadItem[] = [
    {
        id: "launch",
        lastActivity: "2m",
        participants: [
            { initials: "MB", tone: "violet" },
            { initials: "AL", tone: "mint" },
            { initials: "GB", tone: "amber" },
        ],
        replyCount: 12,
        snippet: "Marco: pushed the final build to staging, ready for a look",
        subscribed: true,
        title: "Launch checklist for v4",
        unreadCount: 3,
    },
    {
        id: "design",
        lastActivity: "1h",
        participants: [
            { initials: "ND", tone: "rose" },
            { initials: "PK", tone: "ocean" },
        ],
        replyCount: 5,
        snippet: "Nadia: the truncation on this preview should ellipsize cleanly at every width",
        subscribed: true,
        title: "Design review — settings surface and every empty state",
    },
    {
        id: "infra",
        lastActivity: "3h",
        participants: [
            { initials: "JS", tone: "ember" },
            { initials: "KL", tone: "ocean" },
            { initials: "SR", tone: "violet" },
            { initials: "TT", tone: "mint" },
            { initials: "WU", tone: "amber" },
        ],
        replyCount: 128,
        snippet: "Moved the queue workers over; watching the backlog drain",
        subscribed: true,
        title: "Infra migration",
        unreadCount: 24,
    },
    {
        id: "muted",
        lastActivity: "1d",
        participants: [{ initials: "CC", tone: "slate" }],
        replyCount: 2,
        snippet: "Someone shared a cat gif again",
        subscribed: false,
        title: "Off-topic banter",
    },
];

const states: ThreadItem[] = [
    {
        id: "unread",
        lastActivity: "4m",
        participants: [
            { initials: "AL", tone: "mint" },
            { initials: "GB", tone: "amber" },
        ],
        replyCount: 8,
        snippet: "Bright 700 title, accent unread badge, timestamp on the top line",
        subscribed: true,
        title: "Unread — two participants",
        unreadCount: 5,
    },
    {
        id: "read",
        lastActivity: "22m",
        participants: [
            { initials: "MB", tone: "violet" },
            { initials: "ND", tone: "rose" },
            { initials: "PK", tone: "ocean" },
        ],
        replyCount: 3,
        snippet: "Read — 600 title, reply pill only, no unread badge",
        subscribed: true,
        title: "Read — three participants",
    },
    {
        id: "overflow",
        lastActivity: "5h",
        participants: [
            { initials: "JS", tone: "ember" },
            { initials: "KL", tone: "ocean" },
            { initials: "SR", tone: "violet" },
            { initials: "TT", tone: "mint" },
        ],
        replyCount: 41,
        snippet: "Two avatars plus a +2 overflow chip closes the lane at three slots",
        subscribed: true,
        title: "Overflow — four participants",
        unreadCount: 2,
    },
    {
        id: "muted",
        lastActivity: "2d",
        participants: [{ initials: "CC", tone: "slate" }],
        replyCount: 1,
        snippet: "Muted thread carries a faint bell before the timestamp",
        subscribed: false,
        title: "Muted — single participant",
    },
];

export function ThreadListPage() {
    return (
        <ComponentPage
            number="C-037"
            summary="Followed-thread rows: root/snippet, stacked participant avatars, reply/unread counts."
            title="Thread list"
        >
            <div className="specimen-grid">
                <Specimen
                    detail="row 64 · avatars sm 28 with 18px step · title 13/600 · snippet 12 muted · trailing 16 off the edge"
                    label="Followed threads"
                    number="01"
                    stage="app"
                >
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        <ThreadList
                            onSelect={() => {}}
                            style={{ width: "440px" }}
                            threads={followed}
                        />
                        <DimensionRule label="440 px wide · 4 rows × 64 px" />
                    </div>
                </Specimen>

                <Specimen
                    detail="unread 700 + accent badge · read 600 · +N overflow chip · muted bell"
                    label="Row states"
                    number="02"
                    stage="app"
                >
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        <ThreadList
                            onSelect={() => {}}
                            style={{ width: "440px" }}
                            threads={states}
                        />
                        <DimensionRule label="reply pill 18 · unread CountBadge 18 · avatar ring 2 px" />
                    </div>
                </Specimen>

                <Specimen
                    detail="empty slot centered muted 13px"
                    label="Empty"
                    number="03"
                    stage="app"
                >
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        <ThreadList
                            emptyLabel="No followed threads yet"
                            style={{ width: "440px" }}
                            threads={[]}
                        />
                        <DimensionRule label="440 px wide · empty state" />
                    </div>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
