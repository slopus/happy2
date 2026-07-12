import { createMemo, createSignal, For, Match, Show, Switch, type JSX } from "solid-js";
import {
    AutomationCard,
    Avatar,
    Badge,
    Banner,
    Box,
    Button,
    DataTable,
    EmptyState,
    FormRow,
    Modal,
    ModerationReportCard,
    SecretReveal,
    SegmentedControl,
    Select,
    Switch as ToggleSwitch,
    Tabs,
    TextField,
    Toolbar,
    type AutomationCardProps,
    type BadgeVariant,
    type DataTableColumn,
    type DataTableRow,
    type MemberItem,
    type MemberPresence,
    type MemberRole,
    type ModerationReportCardProps,
    type ModerationStatus,
    type SegmentedControlSegment,
    type SelectOption,
    type TabItem,
    type ToneName,
} from "rigged-ui";
import {
    adminAudit,
    adminAuditColumns,
    adminBans,
    adminBanColumns,
    adminUserColumns,
    serverSettings,
    type BanEntry,
    type Integration,
    type JoinPolicy,
    type ServerSettingsState,
} from "../mockData";

export type AdminViewProps = {
    users: MemberItem[];
    reports: ModerationReportCardProps[];
    automations: AutomationCardProps[];
    integrations: Integration[];
};

type UserScope = "members" | "bans" | "audit";
type ModerationFilter = "all" | ModerationStatus;

/* ---- Static option sets ---------------------------------------------------- */

const roleOptions: SelectOption[] = [
    { value: "owner", label: "Owner" },
    { value: "admin", label: "Admin" },
    { value: "member", label: "Member" },
];

const joinPolicyOptions: SelectOption[] = [
    { value: "open", label: "Anyone can join" },
    { value: "invite", label: "Invite only" },
    { value: "approval", label: "Request to join" },
];

const retentionOptions: SelectOption[] = [
    { value: "30", label: "30 days" },
    { value: "90", label: "90 days" },
    { value: "365", label: "1 year" },
    { value: "0", label: "Keep forever" },
];

const userScopeSegments: SegmentedControlSegment[] = [
    { value: "members", label: "Members", icon: "users" },
    { value: "bans", label: "Bans", icon: "shield" },
    { value: "audit", label: "Audit log", icon: "clock" },
];

const moderationSegments: SegmentedControlSegment[] = [
    { value: "all", label: "All", icon: "filter" },
    { value: "open", label: "Open", icon: "bell" },
    { value: "reviewing", label: "Reviewing", icon: "eye" },
    { value: "resolved", label: "Resolved", icon: "check-circle" },
];

const integrationColumns: DataTableColumn[] = [
    { id: "name", header: "Integration" },
    { id: "provider", header: "Provider" },
    { id: "status", header: "Status" },
    { id: "lastSync", header: "Last sync", align: "end", width: 140 },
];

const integrationStatus: Record<Integration["status"], { label: string; variant: BadgeVariant }> = {
    connected: { label: "Connected", variant: "success" },
    error: { label: "Error", variant: "danger" },
    disabled: { label: "Disabled", variant: "neutral" },
};

const auditCategory: Record<AuditEntry["category"], { label: string; variant: BadgeVariant }> = {
    member: { label: "Member", variant: "info" },
    security: { label: "Security", variant: "warning" },
    integration: { label: "Integration", variant: "accent" },
    automation: { label: "Automation", variant: "success" },
    moderation: { label: "Moderation", variant: "danger" },
};

type AuditEntry = (typeof adminAudit)[number];

/* ---- Layout styles (glue only: flex/spacing, no color or chrome) ----------- */

const rootStyle: JSX.CSSProperties = {
    position: "relative",
    display: "flex",
    "flex-direction": "column",
    flex: "1 1 0%",
    "min-height": 0,
};
const tabBodyStyle: JSX.CSSProperties = {
    display: "flex",
    "flex-direction": "column",
    flex: "1 1 0%",
    "min-height": 0,
};
const tableScrollStyle: JSX.CSSProperties = {
    flex: "1 1 0%",
    "min-height": 0,
    "overflow-y": "auto",
    padding: "16px",
};
const scrollStyle: JSX.CSSProperties = { flex: "1 1 0%", "min-height": 0, "overflow-y": "auto" };
const queueStyle: JSX.CSSProperties = {
    display: "flex",
    "flex-direction": "column",
    gap: "12px",
    padding: "16px",
    "max-width": "860px",
    width: "100%",
    margin: "0 auto",
    "box-sizing": "border-box",
};
const formStyle: JSX.CSSProperties = {
    display: "flex",
    "flex-direction": "column",
    padding: "4px 16px 24px",
    "max-width": "720px",
    width: "100%",
    margin: "0 auto",
    "box-sizing": "border-box",
};
const identityStyle: JSX.CSSProperties = {
    display: "flex",
    "align-items": "center",
    gap: "10px",
    "min-width": 0,
};
const inlineActions: JSX.CSSProperties = {
    display: "flex",
    "align-items": "center",
    gap: "8px",
    "flex-wrap": "wrap",
};
const stackTight: JSX.CSSProperties = { display: "flex", "flex-direction": "column", gap: "4px" };
const bannerGap: JSX.CSSProperties = { "margin-bottom": "12px" };
const overlayStyle: JSX.CSSProperties = {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    display: "flex",
    "align-items": "center",
    "justify-content": "center",
    padding: "24px",
    "z-index": 30,
};

/* ---- Pure cell renderers --------------------------------------------------- */

function identityCell(person: {
    initials: string;
    name: string;
    tone?: ToneName;
    imageUrl?: string;
    online?: boolean;
    size?: "xs" | "sm";
}): JSX.Element {
    return (
        <Box style={identityStyle}>
            <Avatar
                imageUrl={person.imageUrl}
                initials={person.initials}
                online={person.online}
                size={person.size ?? "sm"}
                tone={person.tone}
            />
            <span>{person.name}</span>
        </Box>
    );
}

function presenceBadge(presence?: MemberPresence): JSX.Element {
    return presence === "online" ? (
        <Badge label="Online" variant="success" />
    ) : (
        <Badge label="Offline" variant="neutral" />
    );
}

function scopeBadge(scope: BanEntry["scope"]): JSX.Element {
    return scope === "workspace" ? (
        <Badge label="Workspace" variant="info" />
    ) : (
        <Badge label="Channel" variant="neutral" />
    );
}

function count(n: number, singular: string): string {
    return `${n} ${singular}${n === 1 ? "" : "s"}`;
}

/**
 * Admin feature area — a Tabs deck (Users · Moderation · Automation ·
 * Integrations · Server). Each tab pairs a Toolbar section header with its
 * body: the Users tab switches Members/Bans/Audit DataTables, Moderation is a
 * ModerationReportCard queue, Automation is an AutomationCard list, Integrations
 * pairs a DataTable with a SecretReveal detail and a create Modal, and Server is
 * a FormRow settings sheet. Admin data is not yet in the server client, so every
 * tab is driven from the representative mock data foundation.
 *
 * TODO(server): wire Users/Moderation/Integrations to live endpoints once the
 * server client exposes admin APIs.
 */
export function AdminView(props: AdminViewProps) {
    const [activeTab, setActiveTab] = createSignal("users");
    const [search, setSearch] = createSignal("");

    /* Users */
    const [users, setUsers] = createSignal<MemberItem[]>(props.users);
    const [userScope, setUserScope] = createSignal<UserScope>("members");
    const [selectedUserIds, setSelectedUserIds] = createSignal<string[]>([]);
    const [bans, setBans] = createSignal<BanEntry[]>(adminBans);

    /* Moderation */
    const [reports, setReports] = createSignal<ModerationReportCardProps[]>(props.reports);
    const [moderationFilter, setModerationFilter] = createSignal<ModerationFilter>("all");

    /* Automation */
    const [automations, setAutomations] = createSignal<AutomationCardProps[]>(props.automations);

    /* Integrations */
    const [integrations, setIntegrations] = createSignal<Integration[]>(props.integrations);
    const [selectedIntegrationId, setSelectedIntegrationId] = createSignal(
        props.integrations[0]?.id ?? "",
    );
    const [revealSecret, setRevealSecret] = createSignal(false);
    const [copied, setCopied] = createSignal(false);
    const [createOpen, setCreateOpen] = createSignal(false);
    const [newName, setNewName] = createSignal("");
    const [newProvider, setNewProvider] = createSignal("");

    /* Server */
    const [server, setServer] = createSignal<ServerSettingsState>(serverSettings);
    const [savedFlash, setSavedFlash] = createSignal(false);

    const selectTab = (id: string) => {
        setSearch("");
        setActiveTab(id);
    };
    const selectScope = (value: string) => {
        setSearch("");
        setUserScope(value as UserScope);
    };

    const matches = (haystack: (string | undefined)[]) => {
        const needle = search().trim().toLowerCase();
        if (!needle) return true;
        return haystack.some((value) => value?.toLowerCase().includes(needle));
    };

    const tabs = createMemo<TabItem[]>(() => {
        const open = reports().filter((report) => report.status === "open").length;
        return [
            { id: "users", label: "Users", icon: "users" },
            { id: "moderation", label: "Moderation", icon: "shield", badge: open || undefined },
            { id: "automation", label: "Automation", icon: "zap" },
            { id: "integrations", label: "Integrations", icon: "link" },
            { id: "server", label: "Server", icon: "settings" },
        ];
    });

    /* ---- Users: members ---------------------------------------------------- */

    const filteredUsers = createMemo(() =>
        users().filter((user) => matches([user.name, user.username, user.title])),
    );
    const changeRole = (id: string, role: MemberRole) =>
        setUsers((prev) => prev.map((user) => (user.id === id ? { ...user, role } : user)));
    const toggleUser = (id: string, checked: boolean) =>
        setSelectedUserIds((prev) =>
            checked
                ? prev.includes(id)
                    ? prev
                    : [...prev, id]
                : prev.filter((value) => value !== id),
        );
    const toggleAllUsers = (checked: boolean) =>
        setSelectedUserIds(checked ? filteredUsers().map((user) => user.id) : []);
    const removeSelectedUsers = () => {
        const selected = new Set(selectedUserIds());
        setUsers((prev) => prev.filter((user) => !selected.has(user.id)));
        setSelectedUserIds([]);
    };
    const promoteSelectedUsers = () => {
        const selected = new Set(selectedUserIds());
        setUsers((prev) =>
            prev.map((user) => (selected.has(user.id) ? { ...user, role: "admin" } : user)),
        );
        setSelectedUserIds([]);
    };
    const inviteMember = () =>
        setUsers((prev) => [
            ...prev,
            {
                id: `u-invite-${prev.length}-${Date.now() % 10000}`,
                name: "Pending invite",
                username: "pending",
                title: "Invited member",
                initials: "PI",
                tone: "slate",
                presence: "offline",
                role: "member",
            },
        ]);

    const userRows = createMemo<DataTableRow[]>(() =>
        filteredUsers().map((user) => ({
            id: user.id,
            selected: selectedUserIds().includes(user.id),
            cells: {
                member: identityCell({
                    initials: user.initials,
                    name: user.name,
                    tone: user.tone,
                    imageUrl: user.imageUrl,
                    online: user.presence === "online",
                }),
                username: user.username ? `@${user.username}` : "—",
                title: user.title ?? "—",
                presence: presenceBadge(user.presence),
            },
        })),
    );

    const userRowActions = (row: DataTableRow): JSX.Element => {
        const user = users().find((candidate) => candidate.id === row.id);
        if (!user) return <></>;
        return (
            <Select
                onValueChange={(value) => changeRole(user.id, value as MemberRole)}
                options={roleOptions}
                size="small"
                value={user.role}
                width={128}
            />
        );
    };

    /* ---- Users: bans ------------------------------------------------------- */

    const filteredBans = createMemo(() =>
        bans().filter((ban) => matches([ban.name, ban.handle, ban.reason, ban.bannedBy])),
    );
    const revokeBan = (id: string) => setBans((prev) => prev.filter((ban) => ban.id !== id));
    const banRows = createMemo<DataTableRow[]>(() =>
        filteredBans().map((ban) => ({
            id: ban.id,
            cells: {
                user: identityCell({
                    initials: ban.initials,
                    name: `@${ban.handle}`,
                    tone: ban.tone,
                }),
                reason: ban.reason,
                scope: scopeBadge(ban.scope),
                bannedBy: ban.bannedBy,
                date: ban.date,
            },
        })),
    );
    const banRowActions = (row: DataTableRow): JSX.Element => (
        <Button onClick={() => revokeBan(row.id)} size="small" variant="secondary">
            Revoke
        </Button>
    );

    /* ---- Users: audit ------------------------------------------------------ */

    const filteredAudit = createMemo(() =>
        adminAudit.filter((entry) => matches([entry.actor.name, entry.action, entry.target])),
    );
    const auditRows = createMemo<DataTableRow[]>(() =>
        filteredAudit().map((entry) => ({
            id: entry.id,
            cells: {
                actor: identityCell({
                    initials: entry.actor.initials,
                    name: entry.actor.name,
                    tone: entry.actor.tone,
                    size: "xs",
                }),
                action: entry.action,
                target: entry.target,
                category: (
                    <Badge
                        label={auditCategory[entry.category].label}
                        variant={auditCategory[entry.category].variant}
                    />
                ),
                time: entry.time,
            },
        })),
    );

    const usersToolbar = () => {
        const scope = userScope();
        const title = scope === "members" ? "Members" : scope === "bans" ? "Bans" : "Audit log";
        const subtitle =
            scope === "members"
                ? count(users().length, "member")
                : scope === "bans"
                  ? count(bans().length, "active ban")
                  : count(adminAudit.length, "event");
        const selectedCount = selectedUserIds().length;
        const trailing =
            scope === "members" ? (
                <Show
                    fallback={
                        <Button icon="plus" onClick={inviteMember} size="small">
                            Invite member
                        </Button>
                    }
                    when={selectedCount > 0}
                >
                    <Box style={inlineActions}>
                        <span>{count(selectedCount, "selected member")}</span>
                        <Button onClick={promoteSelectedUsers} size="small" variant="secondary">
                            Make admin
                        </Button>
                        <Button onClick={removeSelectedUsers} size="small" variant="danger">
                            Remove
                        </Button>
                    </Box>
                </Show>
            ) : undefined;
        return (
            <Toolbar
                leading={
                    <SegmentedControl
                        onChange={selectScope}
                        segments={userScopeSegments}
                        size="small"
                        value={scope}
                    />
                }
                search={{
                    value: search(),
                    onChange: setSearch,
                    placeholder: `Search ${title.toLowerCase()}…`,
                }}
                subtitle={subtitle}
                title={title}
                trailing={trailing}
            />
        );
    };

    /* ---- Moderation -------------------------------------------------------- */

    const visibleReports = createMemo(() => {
        const filter = moderationFilter();
        return reports()
            .map((report, index) => ({ report, index }))
            .filter(({ report }) => filter === "all" || report.status === filter)
            .filter(({ report }) => matches([report.target.label, report.reason, report.details]));
    });
    const setReportStatus = (index: number, status: ModerationStatus) =>
        setReports((prev) =>
            prev.map((report, i) => (i === index ? { ...report, status } : report)),
        );
    const reportActions = (report: ModerationReportCardProps, index: number): JSX.Element => {
        if (report.status === "resolved" || report.status === "dismissed") {
            return (
                <Box style={inlineActions}>
                    <Button
                        onClick={() => setReportStatus(index, "open")}
                        size="small"
                        variant="ghost"
                    >
                        Reopen
                    </Button>
                </Box>
            );
        }
        return (
            <Box style={inlineActions}>
                <Show when={report.status === "open"}>
                    <Button
                        onClick={() => setReportStatus(index, "reviewing")}
                        size="small"
                        variant="secondary"
                    >
                        Start review
                    </Button>
                </Show>
                <Button
                    onClick={() => setReportStatus(index, "dismissed")}
                    size="small"
                    variant="ghost"
                >
                    Dismiss
                </Button>
                <Button
                    onClick={() => setReportStatus(index, "resolved")}
                    size="small"
                    variant="success"
                >
                    Resolve
                </Button>
            </Box>
        );
    };

    /* ---- Automation -------------------------------------------------------- */

    const filteredAutomations = createMemo(() =>
        automations().filter((automation) =>
            matches([automation.name, automation.triggerLabel, automation.actionLabel]),
        ),
    );
    const toggleAutomation = (name: string, active: boolean) =>
        setAutomations((prev) =>
            prev.map((automation) =>
                automation.name === name ? { ...automation, active } : automation,
            ),
        );
    const runAutomation = (name: string) =>
        setAutomations((prev) =>
            prev.map((automation) =>
                automation.name === name
                    ? { ...automation, lastRunLabel: "Ran just now", error: undefined }
                    : automation,
            ),
        );

    /* ---- Integrations ------------------------------------------------------ */

    const filteredIntegrations = createMemo(() =>
        integrations().filter((integration) => matches([integration.name, integration.provider])),
    );
    const selectedIntegration = createMemo(() =>
        integrations().find((integration) => integration.id === selectedIntegrationId()),
    );
    const selectIntegration = (id: string) => {
        setSelectedIntegrationId(id);
        setRevealSecret(false);
        setCopied(false);
    };
    const copySecret = (secret: string) => {
        navigator.clipboard?.writeText(secret)?.catch(() => undefined);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };
    const openCreate = () => {
        setNewName("");
        setNewProvider("");
        setCreateOpen(true);
    };
    const closeCreate = () => setCreateOpen(false);
    const createIntegration = () => {
        const name = newName().trim();
        if (!name) return;
        const provider =
            newProvider().trim() || `${name.toLowerCase().replace(/[^a-z0-9]+/g, "")}.com`;
        const id = `i-${Date.now()}`;
        const secret = `key_${Math.random().toString(36).slice(2, 10)}${Math.random()
            .toString(36)
            .slice(2, 10)}`;
        setIntegrations((prev) => [
            ...prev,
            { id, name, provider, status: "connected", lastSync: "just now", secret },
        ]);
        selectIntegration(id);
        closeCreate();
    };
    const integrationRows = createMemo<DataTableRow[]>(() =>
        filteredIntegrations().map((integration) => ({
            id: integration.id,
            selected: integration.id === selectedIntegrationId(),
            onClick: () => selectIntegration(integration.id),
            cells: {
                name: integration.name,
                provider: integration.provider,
                status: (
                    <Badge
                        label={integrationStatus[integration.status].label}
                        variant={integrationStatus[integration.status].variant}
                    />
                ),
                lastSync: integration.lastSync,
            },
        })),
    );

    /* ---- Server ------------------------------------------------------------ */

    const updateServer = <K extends keyof ServerSettingsState>(
        key: K,
        value: ServerSettingsState[K],
    ) => setServer((prev) => ({ ...prev, [key]: value }));
    const saveServer = () => {
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 2400);
    };

    return (
        <Box style={rootStyle}>
            <Tabs activeId={activeTab()} onSelect={selectTab} tabs={tabs()} />

            <Switch>
                {/* ---- Users ---- */}
                <Match when={activeTab() === "users"}>
                    <Box style={tabBodyStyle}>
                        {usersToolbar()}
                        <Box style={tableScrollStyle}>
                            <Switch>
                                <Match when={userScope() === "members"}>
                                    <DataTable
                                        actionsWidth={140}
                                        columns={adminUserColumns}
                                        empty={
                                            <EmptyState
                                                description="No members match your search."
                                                icon="users"
                                                size="inline"
                                                title="No members"
                                            />
                                        }
                                        onToggleAll={toggleAllUsers}
                                        onToggleRow={toggleUser}
                                        rowActions={userRowActions}
                                        rows={userRows()}
                                        selectLabel="Select member"
                                        selectable
                                    />
                                </Match>
                                <Match when={userScope() === "bans"}>
                                    <DataTable
                                        actionsWidth={110}
                                        columns={adminBanColumns}
                                        empty={
                                            <EmptyState
                                                description="Nobody is banned from this workspace."
                                                icon="shield"
                                                size="inline"
                                                title="No active bans"
                                            />
                                        }
                                        rowActions={banRowActions}
                                        rows={banRows()}
                                    />
                                </Match>
                                <Match when={userScope() === "audit"}>
                                    <DataTable
                                        columns={adminAuditColumns}
                                        empty={
                                            <EmptyState
                                                description="Administrative actions will appear here."
                                                icon="clock"
                                                size="inline"
                                                title="No audit events"
                                            />
                                        }
                                        rows={auditRows()}
                                    />
                                </Match>
                            </Switch>
                        </Box>
                    </Box>
                </Match>

                {/* ---- Moderation ---- */}
                <Match when={activeTab() === "moderation"}>
                    <Box style={tabBodyStyle}>
                        <Toolbar
                            leading={
                                <SegmentedControl
                                    onChange={(value) =>
                                        setModerationFilter(value as ModerationFilter)
                                    }
                                    segments={moderationSegments}
                                    size="small"
                                    value={moderationFilter()}
                                />
                            }
                            search={{
                                value: search(),
                                onChange: setSearch,
                                placeholder: "Search reports…",
                            }}
                            subtitle={count(
                                reports().filter((report) => report.status === "open").length,
                                "open report",
                            )}
                            title="Moderation queue"
                        />
                        <Box style={scrollStyle}>
                            <Box style={queueStyle}>
                                <Show
                                    fallback={
                                        <EmptyState
                                            description="No reports match this filter."
                                            icon="check-circle"
                                            size="inline"
                                            title="Queue clear"
                                        />
                                    }
                                    when={visibleReports().length > 0}
                                >
                                    <For each={visibleReports()}>
                                        {(entry) => (
                                            <ModerationReportCard
                                                actions={reportActions(entry.report, entry.index)}
                                                assignee={entry.report.assignee}
                                                details={entry.report.details}
                                                reason={entry.report.reason}
                                                reporter={entry.report.reporter}
                                                status={entry.report.status}
                                                target={entry.report.target}
                                                time={entry.report.time}
                                            />
                                        )}
                                    </For>
                                </Show>
                            </Box>
                        </Box>
                    </Box>
                </Match>

                {/* ---- Automation ---- */}
                <Match when={activeTab() === "automation"}>
                    <Box style={tabBodyStyle}>
                        <Toolbar
                            search={{
                                value: search(),
                                onChange: setSearch,
                                placeholder: "Search automations…",
                            }}
                            subtitle={count(
                                automations().filter((automation) => automation.active).length,
                                "active rule",
                            )}
                            title="Automations"
                        />
                        <Box style={scrollStyle}>
                            <Box style={queueStyle}>
                                <Show
                                    fallback={
                                        <EmptyState
                                            description="No automations match your search."
                                            icon="zap"
                                            size="inline"
                                            title="No automations"
                                        />
                                    }
                                    when={filteredAutomations().length > 0}
                                >
                                    <For each={filteredAutomations()}>
                                        {(automation) => (
                                            <AutomationCard
                                                actionLabel={automation.actionLabel}
                                                actionType={automation.actionType}
                                                active={automation.active}
                                                error={automation.error}
                                                lastRunLabel={automation.lastRunLabel}
                                                name={automation.name}
                                                nextRunLabel={automation.nextRunLabel}
                                                onRun={() => runAutomation(automation.name)}
                                                onToggleActive={(active) =>
                                                    toggleAutomation(automation.name, active)
                                                }
                                                triggerLabel={automation.triggerLabel}
                                                triggerType={automation.triggerType}
                                            />
                                        )}
                                    </For>
                                </Show>
                            </Box>
                        </Box>
                    </Box>
                </Match>

                {/* ---- Integrations ---- */}
                <Match when={activeTab() === "integrations"}>
                    <Box style={tabBodyStyle}>
                        <Toolbar
                            search={{
                                value: search(),
                                onChange: setSearch,
                                placeholder: "Search integrations…",
                            }}
                            subtitle={count(
                                integrations().filter(
                                    (integration) => integration.status === "connected",
                                ).length,
                                "connected service",
                            )}
                            title="Integrations"
                            trailing={
                                <Button icon="plus" onClick={openCreate} size="small">
                                    Add integration
                                </Button>
                            }
                        />
                        <Box style={scrollStyle}>
                            <Box style={queueStyle}>
                                <DataTable
                                    columns={integrationColumns}
                                    empty={
                                        <EmptyState
                                            action={{
                                                label: "Add integration",
                                                icon: "plus",
                                                onClick: openCreate,
                                            }}
                                            description="Connect a service to sync issues, alerts, and files."
                                            icon="link"
                                            size="inline"
                                            title="No integrations"
                                        />
                                    }
                                    rows={integrationRows()}
                                />
                                <Show when={selectedIntegration()}>
                                    {(integration) => (
                                        <SecretReveal
                                            copied={copied()}
                                            label={`${integration().name} API key`}
                                            meta={integration().provider}
                                            onCopy={() => copySecret(integration().secret)}
                                            onToggleReveal={() =>
                                                setRevealSecret((value) => !value)
                                            }
                                            revealed={revealSecret()}
                                            secret={integration().secret}
                                            warning="Treat this key like a password — rotating it will break existing connections."
                                        />
                                    )}
                                </Show>
                            </Box>
                        </Box>
                    </Box>
                </Match>

                {/* ---- Server ---- */}
                <Match when={activeTab() === "server"}>
                    <Box style={tabBodyStyle}>
                        <Toolbar
                            subtitle="Workspace configuration"
                            title="Server"
                            trailing={
                                <Button icon="check" onClick={saveServer} size="small">
                                    Save changes
                                </Button>
                            }
                        />
                        <Box style={scrollStyle}>
                            <Box style={formStyle}>
                                <Show when={savedFlash()}>
                                    <Box style={bannerGap}>
                                        <Banner icon="check-circle" tone="success">
                                            Server settings saved.
                                        </Banner>
                                    </Box>
                                </Show>
                                <FormRow
                                    control={
                                        <TextField
                                            onValueChange={(value) =>
                                                updateServer("workspaceName", value)
                                            }
                                            style={{ width: "220px" }}
                                            value={server().workspaceName}
                                        />
                                    }
                                    description="The display name shown across the workspace."
                                    label="Workspace name"
                                />
                                <FormRow
                                    control={
                                        <Select
                                            onValueChange={(value) =>
                                                updateServer("joinPolicy", value as JoinPolicy)
                                            }
                                            options={joinPolicyOptions}
                                            value={server().joinPolicy}
                                            width={200}
                                        />
                                    }
                                    description="Controls how new members get access."
                                    label="Who can join"
                                />
                                <FormRow
                                    control={
                                        <Select
                                            onValueChange={(value) =>
                                                updateServer("defaultRole", value as MemberRole)
                                            }
                                            options={roleOptions}
                                            value={server().defaultRole}
                                            width={160}
                                        />
                                    }
                                    description="Role assigned to newly added members."
                                    label="Default role"
                                />
                                <FormRow
                                    control={
                                        <Select
                                            onValueChange={(value) =>
                                                updateServer("retentionDays", value)
                                            }
                                            options={retentionOptions}
                                            value={server().retentionDays}
                                            width={160}
                                        />
                                    }
                                    description="How long messages are kept before cleanup."
                                    label="Message retention"
                                />
                                <FormRow
                                    control={
                                        <ToggleSwitch
                                            aria-label="Require two-factor sign-in"
                                            checked={server().requireMfa}
                                            onChange={(value) => updateServer("requireMfa", value)}
                                        />
                                    }
                                    description="Members must enable 2FA to sign in."
                                    label="Require two-factor"
                                />
                                <FormRow
                                    control={
                                        <ToggleSwitch
                                            aria-label="Allow guest accounts"
                                            checked={server().allowGuests}
                                            onChange={(value) => updateServer("allowGuests", value)}
                                        />
                                    }
                                    description="Let external collaborators join specific channels."
                                    label="Allow guest accounts"
                                />
                                <FormRow
                                    control={
                                        <ToggleSwitch
                                            aria-label="Enable AI agents"
                                            checked={server().aiAgents}
                                            onChange={(value) => updateServer("aiAgents", value)}
                                        />
                                    }
                                    description="Enable Forge, Scout, and Patch across channels."
                                    label="AI agents"
                                />
                            </Box>
                        </Box>
                    </Box>
                </Match>
            </Switch>

            <Show when={createOpen()}>
                <Box onClick={closeCreate} style={overlayStyle}>
                    <Box onClick={(event) => event.stopPropagation()}>
                        <Modal
                            footer={
                                <Box style={inlineActions}>
                                    <Button onClick={closeCreate} variant="ghost">
                                        Cancel
                                    </Button>
                                    <Button icon="plus" onClick={createIntegration}>
                                        Add integration
                                    </Button>
                                </Box>
                            }
                            icon="link"
                            onClose={closeCreate}
                            size="small"
                            title="Add integration"
                        >
                            <Box style={stackTight}>
                                <FormRow
                                    control={
                                        <TextField
                                            fullWidth
                                            onValueChange={setNewName}
                                            placeholder="e.g. Sentry"
                                            value={newName()}
                                        />
                                    }
                                    description="Shown in the integrations list."
                                    label="Name"
                                    layout="stacked"
                                />
                                <FormRow
                                    control={
                                        <TextField
                                            fullWidth
                                            onValueChange={setNewProvider}
                                            placeholder="e.g. sentry.io"
                                            value={newProvider()}
                                        />
                                    }
                                    description="The service domain this key belongs to."
                                    label="Provider"
                                    layout="stacked"
                                />
                            </Box>
                        </Modal>
                    </Box>
                </Box>
            </Show>
        </Box>
    );
}
