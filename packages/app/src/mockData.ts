import type {
    AgentRun,
    AgentRunAction,
    ApprovalRequest,
    BadgeVariant,
    ChannelMember,
    DeskListItem,
    DeskRun,
    DiffLine,
    IconName,
    MentionableAgent,
    MessageReaction,
    MessageSegment,
    RailItem,
    SidebarSection,
    ToneName,
} from "rigged-ui";

/* ---- Rail ---------------------------------------------------------------- */

export const railItems: RailItem[] = [
    { id: "home", icon: "home", label: "Home" },
    { id: "chat", icon: "chat", label: "Chat" },
    { id: "agents", icon: "agents", label: "Agents" },
    { id: "tasks", icon: "tasks", label: "Tasks" },
    { id: "files", icon: "files", label: "Files" },
];

export type FeatureEmptyState = {
    description: string;
    icon: IconName;
    title: string;
};

export const featureEmptyStates: Record<string, FeatureEmptyState> = {
    home: {
        icon: "home",
        title: "Home",
        description: "Your day at a glance — nothing needs you right now.",
    },
    agents: {
        icon: "agents",
        title: "Agents",
        description: "Forge, Scout, and Patch report into the agent desk on the chat view.",
    },
    tasks: {
        icon: "tasks",
        title: "Tasks",
        description: "Issues assigned to you and your agents will collect here.",
    },
    files: {
        icon: "files",
        title: "Files",
        description: "Shared files and diffs from agent runs will land here.",
    },
};

/* ---- Sidebar -------------------------------------------------------------- */

export const chatSections: SidebarSection[] = [
    {
        id: "views",
        items: [
            { id: "inbox", kind: "view", icon: "inbox", label: "Inbox", badge: 12 },
            { id: "my-issues", kind: "view", icon: "tasks", label: "My issues" },
            { id: "agent-runs", kind: "view", icon: "spark", label: "Agent runs" },
        ],
    },
    {
        id: "channels",
        label: "Channels",
        action: { icon: "plus", label: "Add channel" },
        items: [
            { id: "launch-week", kind: "channel", label: "launch-week" },
            { id: "eng-core", kind: "channel", label: "eng-core", badge: 4 },
            { id: "design", kind: "channel", label: "design" },
            { id: "support-fires", kind: "channel", label: "support-fires" },
        ],
    },
    {
        id: "dms",
        label: "Direct messages",
        items: [
            {
                id: "maya-chen",
                kind: "person",
                label: "Maya Chen",
                initials: "MC",
                tone: "ember",
                online: true,
            },
            {
                id: "theo-grant",
                kind: "person",
                label: "Theo Grant",
                initials: "TG",
                tone: "ocean",
            },
            {
                id: "nora-kim",
                kind: "person",
                label: "Nora Kim",
                initials: "NK",
                tone: "rose",
                online: true,
            },
        ],
    },
    {
        id: "agents",
        label: "Agents",
        action: { icon: "plus", label: "Add agent" },
        items: [
            {
                id: "forge",
                kind: "agent",
                label: "Forge",
                initials: "F",
                tone: "ember",
                status: "working",
            },
            {
                id: "scout",
                kind: "agent",
                label: "Scout",
                initials: "S",
                tone: "ocean",
                status: "ready",
            },
            {
                id: "patch",
                kind: "agent",
                label: "Patch",
                initials: "P",
                tone: "violet",
                status: "ready",
            },
        ],
    },
];

/* ---- Agents --------------------------------------------------------------- */

export const mentionableAgents: MentionableAgent[] = [
    {
        id: "forge",
        name: "Forge",
        initials: "F",
        tone: "ember",
        status: "working",
        description: "Implements scoped product and engineering work",
    },
    {
        id: "scout",
        name: "Scout",
        initials: "S",
        tone: "ocean",
        status: "ready",
        description: "Researches context and synthesizes findings",
    },
    {
        id: "patch",
        name: "Patch",
        initials: "P",
        tone: "violet",
        status: "ready",
        description: "Tests changes and verifies acceptance criteria",
    },
];

/* ---- Conversations --------------------------------------------------------- */

export type Conversation = {
    agentCount?: number;
    composerPlaceholder: string;
    icon?: "hash" | "spark" | "inbox";
    id: string;
    intro?: { description: string; title: string };
    memberCount?: number;
    members?: ChannelMember[];
    title: string;
    topic?: string;
};

const channelPlaceholder = (name: string) =>
    `Message #${name} — @ mention an agent to hand off work…`;

export const conversations: Record<string, Conversation> = {
    inbox: {
        id: "inbox",
        title: "Inbox",
        icon: "inbox",
        topic: "Mentions, review requests, and approvals",
        composerPlaceholder: "Jot a note to yourself…",
        intro: {
            title: "Nothing new since 11:02",
            description:
                "Review requests from Forge and Scout are waiting in #launch-week and #eng-core.",
        },
    },
    "my-issues": {
        id: "my-issues",
        title: "My issues",
        icon: "inbox",
        topic: "Issues assigned to you",
        composerPlaceholder: "Jot a note to yourself…",
        intro: {
            title: "Two issues on your plate",
            description:
                "MOB-217 is in review with Forge; ENG-482 is waiting on your sanity check.",
        },
    },
    "agent-runs": {
        id: "agent-runs",
        title: "Agent runs",
        icon: "spark",
        topic: "Every run across the workspace",
        composerPlaceholder: "Jot a note to yourself…",
        intro: {
            title: "Two runs in flight",
            description:
                "Patch is on the device farm and Forge is drafting release notes — follow along in the agent desk.",
        },
    },
    "launch-week": {
        id: "launch-week",
        title: "launch-week",
        icon: "hash",
        topic: "Ship mobile v2 by Friday",
        members: [
            { initials: "MC", tone: "ember" },
            { initials: "TG", tone: "ocean" },
            { initials: "NK", tone: "rose" },
            { initials: "ST", tone: "brand" },
        ],
        memberCount: 4,
        agentCount: 3,
        composerPlaceholder: channelPlaceholder("launch-week"),
        intro: {
            title: "Welcome to #launch-week",
            description:
                "The push to get mobile v2 out the door by Friday. Humans plan, agents ship.",
        },
    },
    "eng-core": {
        id: "eng-core",
        title: "eng-core",
        icon: "hash",
        topic: "Platform, infra, and the boring load-bearing parts",
        members: [
            { initials: "TG", tone: "ocean" },
            { initials: "MC", tone: "ember" },
            { initials: "S", tone: "ocean", type: "agent" },
        ],
        memberCount: 12,
        agentCount: 2,
        composerPlaceholder: channelPlaceholder("eng-core"),
        intro: {
            title: "Welcome to #eng-core",
            description: "Platform and infrastructure work — flaky tests come here to die.",
        },
    },
    design: {
        id: "design",
        title: "design",
        icon: "hash",
        topic: "Mocks, crits, and polish for mobile v2",
        members: [
            { initials: "NK", tone: "rose" },
            { initials: "MC", tone: "ember" },
        ],
        memberCount: 5,
        composerPlaceholder: channelPlaceholder("design"),
        intro: {
            title: "Everyone’s all here in #design",
            description: "Mocks, crits, and polish for the mobile v2 surfaces. Quiet so far today.",
        },
    },
    "support-fires": {
        id: "support-fires",
        title: "support-fires",
        icon: "hash",
        topic: "Escalations that can’t wait for triage",
        members: [
            { initials: "NK", tone: "rose" },
            { initials: "ST", tone: "brand" },
        ],
        memberCount: 6,
        agentCount: 1,
        composerPlaceholder: channelPlaceholder("support-fires"),
        intro: {
            title: "Welcome to #support-fires",
            description: "Escalations land here first. If it’s smoking, say so.",
        },
    },
    "maya-chen": {
        id: "maya-chen",
        title: "Maya Chen",
        topic: "Direct message",
        members: [
            { initials: "MC", tone: "ember" },
            { initials: "ST", tone: "brand" },
        ],
        composerPlaceholder: "Message Maya Chen",
        intro: {
            title: "Maya Chen",
            description: "This conversation is just between you and Maya Chen.",
        },
    },
    "theo-grant": {
        id: "theo-grant",
        title: "Theo Grant",
        topic: "Direct message",
        members: [
            { initials: "TG", tone: "ocean" },
            { initials: "ST", tone: "brand" },
        ],
        composerPlaceholder: "Message Theo Grant",
        intro: {
            title: "Theo Grant",
            description: "This conversation is just between you and Theo Grant.",
        },
    },
    "nora-kim": {
        id: "nora-kim",
        title: "Nora Kim",
        topic: "Direct message",
        members: [
            { initials: "NK", tone: "rose" },
            { initials: "ST", tone: "brand" },
        ],
        composerPlaceholder: "Message Nora Kim",
        intro: {
            title: "Nora Kim",
            description: "This conversation is just between you and Nora Kim.",
        },
    },
    forge: {
        id: "forge",
        title: "Forge",
        icon: "spark",
        topic: "Implements scoped product and engineering work",
        composerPlaceholder: "Message Forge — describe the work to hand off…",
        intro: {
            title: "This is your direct line to Forge",
            description:
                "Hand off scoped work with @Forge in any channel, or brief it privately here.",
        },
    },
    scout: {
        id: "scout",
        title: "Scout",
        icon: "spark",
        topic: "Researches context and synthesizes findings",
        composerPlaceholder: "Message Scout — ask for research or context…",
        intro: {
            title: "This is your direct line to Scout",
            description: "Ask for research, code archaeology, or a summary of any thread.",
        },
    },
    patch: {
        id: "patch",
        title: "Patch",
        icon: "spark",
        topic: "Tests changes and verifies acceptance criteria",
        composerPlaceholder: "Message Patch — point it at something to verify…",
        intro: {
            title: "This is your direct line to Patch",
            description: "Point it at a branch or a build and it will report back with evidence.",
        },
    },
};

/* ---- Thread entries --------------------------------------------------------- */

export type RunAttachment = {
    kind: "run";
    actions?: AgentRunAction[];
    diff?: { file: string; lines: DiffLine[]; stats?: { added: number; removed: number } };
    run: AgentRun;
};

export type ApprovalAttachment = {
    kind: "approval";
    request: ApprovalRequest;
};

export type EventAttachment = {
    kind: "event";
    event: {
        badge?: { label: string; variant: BadgeVariant };
        from?: string;
        icon?: IconName;
        meta?: string;
        time?: string;
        title: string;
        to?: string;
    };
};

export type MessageAttachment = ApprovalAttachment | EventAttachment | RunAttachment;

export type ThreadMessage = {
    kind: "message";
    agent?: boolean;
    attachment?: MessageAttachment;
    author: string;
    body: string | MessageSegment[];
    conversationId: string;
    id: string;
    initials?: string;
    reactions?: MessageReaction[];
    replyCount?: number;
    time: string;
    tone?: ToneName;
};

export type ThreadDivider = {
    kind: "divider";
    conversationId: string;
    id: string;
    label: string;
};

export type ThreadEntry = ThreadDivider | ThreadMessage;

const coldStartDiff: DiffLine[] = [
    { kind: "meta", text: "@@ -18,7 +18,9 @@ export async function registerForPush() {" },
    { kind: "context", number: 18, text: "export async function registerForPush() {" },
    { kind: "del", number: 19, text: "    const token = await requestPushToken();" },
    { kind: "add", number: 19, text: "    await handshake.settled;" },
    {
        kind: "add",
        number: 20,
        text: "    const token = await requestPushToken({ retry: isColdStart() });",
    },
    { kind: "context", number: 21, text: "    return api.registerDevice(token);" },
    { kind: "context", number: 22, text: "}" },
];

const authFlakeDiff: DiffLine[] = [
    { kind: "meta", text: "@@ -41,6 +41,7 @@ async refresh(token: Token) {" },
    { kind: "context", number: 41, text: "async refresh(token: Token) {" },
    { kind: "del", number: 42, text: "    const lock = await mutex.tryLock();" },
    {
        kind: "add",
        number: 42,
        text: "    const lock = await mutex.lock({ timeout: 5_000, jitter: true });",
    },
    { kind: "add", number: 43, text: "    if (!lock) return queue.enqueue(token);" },
    { kind: "context", number: 44, text: "    try {" },
];

export const initialEntries: ThreadEntry[] = [
    /* ---- #launch-week ---- */
    { kind: "divider", id: "lw-today", conversationId: "launch-week", label: "Today" },
    {
        kind: "message",
        id: "lw-1",
        conversationId: "launch-week",
        author: "Maya Chen",
        initials: "MC",
        tone: "ember",
        time: "10:42",
        body: [
            {
                kind: "text",
                text: "Standup: the notifications bug is the last blocker for Friday. ",
            },
            { kind: "mention", text: "Forge" },
            { kind: "text", text: " can you take " },
            { kind: "code", text: "MOB-217" },
            { kind: "text", text: " and loop in " },
            { kind: "mention", text: "Patch" },
            { kind: "text", text: " for verification?" },
        ],
    },
    {
        kind: "message",
        id: "lw-2",
        conversationId: "launch-week",
        author: "Forge",
        initials: "F",
        tone: "ember",
        agent: true,
        time: "10:43",
        body: "On it. Reproduced the drop — push-token registration races the handshake on cold start, so the token is registered before the exchange settles.",
        attachment: {
            kind: "event",
            event: {
                icon: "bell",
                title: "Push notifications drop on cold start",
                meta: "MOB-217 · Urgent",
                from: "In progress",
                to: "In review",
                time: "10:43",
            },
        },
    },
    {
        kind: "message",
        id: "lw-3",
        conversationId: "launch-week",
        author: "Forge",
        initials: "F",
        tone: "ember",
        agent: true,
        time: "10:51",
        body: "Fix is up — moved registration behind the handshake promise and added a cold-start retry.",
        reactions: [
            { emoji: "🚀", count: 2 },
            { emoji: "👀", count: 1 },
        ],
        attachment: {
            kind: "run",
            run: {
                agent: "Forge",
                initials: "F",
                tone: "ember",
                title: "Fix cold-start push registration",
                branch: "agent/forge/cold-start-push",
                status: "review",
                stats: { added: 86, removed: 17, files: 3, note: "tests passing" },
                steps: [
                    { label: "Reproduce the cold-start race", status: "done" },
                    { label: "Move registration behind the handshake", status: "done" },
                    { label: "Add cold-start retry with backoff", status: "done" },
                    { label: "Run the push notification suite", status: "done" },
                ],
            },
            actions: [
                { id: "review-diff", label: "Review diff", variant: "primary" },
                { id: "open-eng-core", label: "Open in #eng-core", variant: "secondary" },
            ],
            diff: {
                file: "src/push/register.ts",
                stats: { added: 3, removed: 1 },
                lines: coldStartDiff,
            },
        },
    },
    {
        kind: "message",
        id: "lw-4",
        conversationId: "launch-week",
        author: "Steve",
        initials: "ST",
        tone: "brand",
        time: "10:54",
        body: "Reviewing now. If the device farm comes back green we’re clear for Friday.",
        replyCount: 2,
    },
    {
        kind: "message",
        id: "lw-5",
        conversationId: "launch-week",
        author: "Forge",
        initials: "F",
        tone: "ember",
        agent: true,
        time: "10:56",
        body: "One thing before merge — the rollout flag lives in the shared release manifest, which is outside the scope you granted. Pausing here.",
        attachment: {
            kind: "approval",
            request: {
                agent: "Forge",
                initials: "F",
                tone: "ember",
                title: "Update shared release manifest",
                typeLabel: "Scope expansion",
                reason: "Register the cold-start fix for the mobile v2 release train without touching any other rollout settings.",
                action: "edit config/releases/mobile.json",
                impact: "One shared configuration file. Applies to the next mobile build and can be reverted before release.",
                resources: ["Shared config", "1 file", "Reversible"],
            },
        },
    },
    {
        kind: "message",
        id: "lw-6",
        conversationId: "launch-week",
        author: "Patch",
        initials: "P",
        tone: "violet",
        agent: true,
        time: "11:02",
        body: "Verification run complete — cold start, warm start, and reinstall all deliver notifications.",
        reactions: [{ emoji: "✅", count: 3 }],
        attachment: {
            kind: "run",
            run: {
                agent: "Patch",
                initials: "P",
                tone: "violet",
                title: "Device farm verification",
                status: "complete",
                stats: { files: 1, steps: 4, note: "all scenarios passing" },
                steps: [
                    { label: "Cold-start delivery on iPhone 15", status: "done" },
                    { label: "Warm-start delivery on Pixel 9", status: "done" },
                    { label: "Reinstall and re-register", status: "done" },
                    { label: "Regression sweep on notifications", status: "done" },
                ],
            },
        },
    },

    /* ---- #eng-core ---- */
    { kind: "divider", id: "ec-today", conversationId: "eng-core", label: "Today" },
    {
        kind: "message",
        id: "ec-1",
        conversationId: "eng-core",
        author: "Scout",
        initials: "S",
        tone: "ocean",
        agent: true,
        time: "9:58",
        body: "Finished the auth-flake run. The flake came from two workers racing the refresh mutex — refreshes now go through a queue with jittered backoff. 200/200 runs green.",
        attachment: {
            kind: "run",
            run: {
                agent: "Scout",
                initials: "S",
                tone: "ocean",
                title: "Fix flaky auth token refresh tests",
                branch: "agent/scout/auth-flake",
                status: "review",
                stats: { added: 164, removed: 38, files: 6, steps: 12, note: "all tests passing" },
                steps: [
                    { label: "Reproduce the flake locally (14/200 fails)", status: "done" },
                    { label: "Trace the race in the token refresh mutex", status: "done" },
                    { label: "Rewrite refresh queue with jittered backoff", status: "done" },
                    { label: "200/200 local runs green · CI passing", status: "done" },
                ],
            },
            actions: [{ id: "review-diff", label: "Review diff", variant: "primary" }],
            diff: {
                file: "src/auth/refresh.ts",
                stats: { added: 2, removed: 1 },
                lines: authFlakeDiff,
            },
        },
    },
    {
        kind: "message",
        id: "ec-2",
        conversationId: "eng-core",
        author: "Maya Chen",
        initials: "MC",
        tone: "ember",
        time: "10:12",
        body: [
            { kind: "mention", text: "Scout" },
            {
                kind: "text",
                text: " can you sanity-check the retry logic before this ships? The backoff cap feels low while ",
            },
            { kind: "code", text: "ENG-482" },
            { kind: "text", text: " is still open." },
        ],
    },

    /* ---- #support-fires ---- */
    { kind: "divider", id: "sf-today", conversationId: "support-fires", label: "Today" },
    {
        kind: "message",
        id: "sf-1",
        conversationId: "support-fires",
        author: "Nora Kim",
        initials: "NK",
        tone: "rose",
        time: "9:12",
        body: [
            {
                kind: "text",
                text: "Two overnight reports of login loops on Android 15 — grouped them into ",
            },
            { kind: "code", text: "SUP-91" },
            { kind: "text", text: ", severity medium." },
        ],
    },
    {
        kind: "message",
        id: "sf-2",
        conversationId: "support-fires",
        author: "Steve",
        initials: "ST",
        tone: "brand",
        time: "9:20",
        body: "Thanks — hold it in triage until the push fix lands. It smells like the same token race.",
    },

    /* ---- DM: Maya Chen ---- */
    { kind: "divider", id: "mc-today", conversationId: "maya-chen", label: "Today" },
    {
        kind: "message",
        id: "mc-1",
        conversationId: "maya-chen",
        author: "Maya Chen",
        initials: "MC",
        tone: "ember",
        time: "9:31",
        body: "Morning! Still on for the launch review at 3?",
    },
    {
        kind: "message",
        id: "mc-2",
        conversationId: "maya-chen",
        author: "Steve",
        initials: "ST",
        tone: "brand",
        time: "9:33",
        body: "Yes — I’ll bring the device-farm results. Forge’s fix should be in review by then.",
    },
    {
        kind: "message",
        id: "mc-3",
        conversationId: "maya-chen",
        author: "Maya Chen",
        initials: "MC",
        tone: "ember",
        time: "9:34",
        body: "Perfect. I’ll pull the release-notes draft into the doc before we meet.",
    },

    /* ---- DM: Theo Grant ---- */
    { kind: "divider", id: "tg-today", conversationId: "theo-grant", label: "Today" },
    {
        kind: "message",
        id: "tg-1",
        conversationId: "theo-grant",
        author: "Theo Grant",
        initials: "TG",
        tone: "ocean",
        time: "8:47",
        body: [
            { kind: "text", text: "The rate limiter change from " },
            { kind: "code", text: "ENG-479" },
            { kind: "text", text: " is merged — I’m watching the dashboards this morning." },
        ],
    },
    {
        kind: "message",
        id: "tg-2",
        conversationId: "theo-grant",
        author: "Steve",
        initials: "ST",
        tone: "brand",
        time: "8:52",
        body: "Nice. Ping me if p95 moves; otherwise roll it out to the edge pool after lunch.",
    },

    /* ---- DM: Nora Kim ---- */
    { kind: "divider", id: "nk-today", conversationId: "nora-kim", label: "Today" },
    {
        kind: "message",
        id: "nk-1",
        conversationId: "nora-kim",
        author: "Nora Kim",
        initials: "NK",
        tone: "rose",
        time: "9:05",
        body: "Support queue is quiet — 12 open tickets, nothing urgent.",
    },
    {
        kind: "message",
        id: "nk-2",
        conversationId: "nora-kim",
        author: "Steve",
        initials: "ST",
        tone: "brand",
        time: "9:08",
        body: "Great. Keep an eye on SUP-91 — it may resolve itself once the push fix ships.",
    },
    {
        kind: "message",
        id: "nk-3",
        conversationId: "nora-kim",
        author: "Nora Kim",
        initials: "NK",
        tone: "rose",
        time: "9:09",
        body: "Will do.",
    },
];

/* ---- Agent desk -------------------------------------------------------------- */

export const deskRunning: DeskRun[] = [
    {
        id: "patch-device-farm",
        agent: "Patch",
        initials: "P",
        tone: "violet",
        title: "Device farm run",
        eta: "4m left",
        progress: 62,
        detail: "iPhone 15 ✓ · Pixel 9 ✓ · iPhone SE running…",
    },
    {
        id: "forge-release-notes",
        agent: "Forge",
        initials: "F",
        tone: "ember",
        title: "Release notes draft",
        progress: 30,
        detail: "Pulling merged PRs since v2.3.1…",
    },
];

export const deskQueued: DeskListItem[] = [
    { id: "weekly-triage", title: "Weekly triage sweep", meta: "Fri 9:00" },
    { id: "backport-v22", title: "Backport fix to v2.2", meta: "after review" },
];

export const deskDone: DeskListItem[] = [
    { id: "eng-479", title: "ENG-479 rate limiter fix", meta: "merged" },
    { id: "sup-88", title: "SUP-88 triage summary", meta: "posted" },
];

export const composerHint = "Enter to send · Shift+Enter for a new line";
