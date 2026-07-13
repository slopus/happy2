import { createMemo, createSignal, onCleanup, onMount, Show, type JSX } from "solid-js";
import type {
    AdminUserSummary,
    AutomationSummary,
    IntegrationSummary,
    ModerationReport,
} from "rigged-state";
import {
    Badge,
    Banner,
    Box,
    DataTable,
    EmptyState,
    Tabs,
    Toolbar,
    type DataTableColumn,
    type DataTableRow,
    type TabItem,
} from "rigged-ui";
import type { AuthSession } from "../components/AuthGate";

export type AdminViewProps = {
    session?: AuthSession;
    /** Old showcase props remain source-compatible but are never rendered. */
    users?: unknown;
    reports?: unknown;
    automations?: unknown;
    integrations?: unknown;
};

type AdminData = {
    users: readonly AdminUserSummary[];
    reports: readonly ModerationReport[];
    automations: readonly AutomationSummary[];
    integrations: readonly IntegrationSummary[];
};

const tabs: TabItem[] = [
    { id: "users", label: "Users", icon: "users" },
    { id: "reports", label: "Reports", icon: "shield" },
    { id: "automations", label: "Automations", icon: "zap" },
    { id: "integrations", label: "Integrations", icon: "link" },
];

const columns: Record<string, DataTableColumn[]> = {
    users: [
        { id: "name", header: "Name" },
        { id: "username", header: "Username" },
        { id: "role", header: "Role", width: 120 },
        { id: "lastAccess", header: "Last access", align: "end", width: 180 },
    ],
    reports: [
        { id: "reason", header: "Reason" },
        { id: "target", header: "Target" },
        { id: "status", header: "Status", width: 130 },
        { id: "created", header: "Created", align: "end", width: 180 },
    ],
    automations: [
        { id: "name", header: "Automation" },
        { id: "trigger", header: "Trigger" },
        { id: "action", header: "Action" },
        { id: "status", header: "Status", width: 120 },
    ],
    integrations: [
        { id: "name", header: "Integration" },
        { id: "kind", header: "Kind" },
        { id: "scopes", header: "Scopes" },
        { id: "status", header: "Status", width: 120 },
    ],
};

const rootStyle: JSX.CSSProperties = {
    display: "flex",
    "flex-direction": "column",
    flex: "1 1 0%",
    "min-height": 0,
};

/**
 * Admin is intentionally a truthful, read-only control-plane index. It renders
 * only resources returned by authenticated admin endpoints; unsupported mock
 * mutations and decorative server settings are not exposed.
 */
export function AdminView(props: AdminViewProps) {
    const [activeTab, setActiveTab] = createSignal("users");
    const [query, setQuery] = createSignal("");
    const [data, setData] = createSignal<AdminData>();
    const [error, setError] = createSignal<string>();
    let disposed = false;

    onMount(() => {
        const session = props.session;
        if (!session) return;
        void Promise.all([
            session.state.execute("getAdminUsers"),
            session.state.execute("getReports", { limit: 100 }),
            session.state.execute("getAutomations"),
            session.state.execute("getIntegrations"),
        ])
            .then(([users, reports, automations, integrations]) => {
                if (disposed) return;
                setData({
                    users: users.users,
                    reports: reports.reports,
                    automations: automations.automations,
                    integrations: integrations.integrations,
                });
            })
            .catch((reason: unknown) => {
                if (!disposed)
                    setError(
                        reason instanceof Error
                            ? reason.message
                            : "Administrative data could not load.",
                    );
            });
    });
    onCleanup(() => {
        disposed = true;
    });

    const rows = createMemo(() => {
        const value = data();
        if (!value) return [];
        const tab = activeTab();
        const source =
            tab === "users"
                ? userRows(value.users)
                : tab === "reports"
                  ? reportRows(value.reports)
                  : tab === "automations"
                    ? automationRows(value.automations)
                    : integrationRows(value.integrations);
        const needle = query().trim().toLowerCase();
        if (!needle) return source;
        return source.filter((row) =>
            Object.values(row.cells).some(
                (cell) => typeof cell === "string" && cell.toLowerCase().includes(needle),
            ),
        );
    });

    return (
        <Box style={rootStyle}>
            <Show
                when={props.session}
                fallback={
                    <EmptyState
                        description="Connect with an administrator account to inspect workspace operations."
                        icon="shield"
                        title="Admin requires a workspace"
                    />
                }
            >
                <Show
                    when={!error()}
                    fallback={
                        <Banner tone="danger" title="Admin access unavailable">
                            {error()!}
                        </Banner>
                    }
                >
                    <Show
                        when={data()}
                        fallback={
                            <EmptyState
                                description="Loading users, reports, automations, and integrations."
                                icon="shield"
                                title="Loading administration…"
                            />
                        }
                    >
                        <Toolbar
                            search={{
                                value: query(),
                                onChange: setQuery,
                                placeholder: `Search ${activeTab()}`,
                            }}
                            subtitle="Live workspace data"
                            title="Admin"
                        />
                        <Tabs
                            activeId={activeTab()}
                            onSelect={(id) => {
                                setActiveTab(id);
                                setQuery("");
                            }}
                            tabs={tabs}
                        />
                        <Box
                            style={{
                                flex: "1 1 0%",
                                "min-height": 0,
                                overflow: "auto",
                                padding: "16px",
                            }}
                        >
                            <DataTable
                                columns={columns[activeTab()] ?? []}
                                empty={
                                    <EmptyState
                                        description={
                                            query().trim()
                                                ? "Try a different search term."
                                                : `The server returned no ${activeTab()}.`
                                        }
                                        icon="search"
                                        size="inline"
                                        title={query().trim() ? "No matches" : "Nothing here"}
                                    />
                                }
                                rows={rows()}
                            />
                        </Box>
                    </Show>
                </Show>
            </Show>
        </Box>
    );
}

function userRows(users: readonly AdminUserSummary[]): DataTableRow[] {
    return users.map((user) => ({
        id: user.id,
        cells: {
            name: [user.firstName, user.lastName].filter(Boolean).join(" "),
            username: `@${user.username}`,
            role: (
                <Badge
                    label={capitalize(user.role)}
                    variant={user.role === "admin" ? "accent" : "neutral"}
                />
            ),
            lastAccess: formatDate(user.lastAccessAt),
        },
    }));
}

function reportRows(reports: readonly ModerationReport[]): DataTableRow[] {
    return reports.map((report) => ({
        id: report.id,
        cells: {
            reason: report.reason,
            target:
                report.messageId ?? report.fileId ?? report.targetUserId ?? report.chatId ?? "—",
            status: (
                <Badge
                    label={capitalize(report.status)}
                    variant={report.status === "open" ? "warning" : "neutral"}
                />
            ),
            created: formatDate(report.createdAt),
        },
    }));
}

function automationRows(automations: readonly AutomationSummary[]): DataTableRow[] {
    return automations.map((automation) => ({
        id: automation.id,
        cells: {
            name: automation.name,
            trigger: humanize(automation.triggerType),
            action: humanize(automation.actionType),
            status: (
                <Badge
                    label={automation.active ? "Active" : "Paused"}
                    variant={automation.active ? "success" : "neutral"}
                />
            ),
        },
    }));
}

function integrationRows(integrations: readonly IntegrationSummary[]): DataTableRow[] {
    return integrations.map((integration) => ({
        id: integration.id,
        cells: {
            name: integration.name,
            kind: humanize(integration.kind),
            scopes: integration.scopes.join(", ") || "No scopes",
            status: (
                <Badge
                    label={integration.active ? "Active" : "Revoked"}
                    variant={integration.active ? "success" : "neutral"}
                />
            ),
        },
    }));
}

function formatDate(value?: string): string {
    if (!value) return "Never";
    return new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(new Date(value));
}

function humanize(value: string): string {
    return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function capitalize(value: string): string {
    return value.replace(/^./, (letter) => letter.toUpperCase());
}
