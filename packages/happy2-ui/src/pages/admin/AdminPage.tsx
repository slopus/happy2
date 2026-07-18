import { useState } from "react";
import type {
    AdminStore,
    AdminUserSummary,
    AgentImagesStore,
    AgentSecretsStore,
    AutomationSummary,
    IntegrationSummary,
    ModerationReport,
    PluginsStore,
} from "happy2-state";
import { Badge } from "../../Badge";
import { Banner } from "../../Banner";
import { Box } from "../../Box";
import { DataTable, type DataTableColumn, type DataTableRow } from "../../DataTable";
import { EmptyState } from "../../EmptyState";
import { StoreSurface } from "../../StoreSurface";
import { Tabs, type TabItem } from "../../Tabs";
import { Toolbar } from "../../Toolbar";
import { AgentImagesPage } from "./AgentImagesPage";
import { AgentSecretsPage } from "./AgentSecretsPage";
import { PluginsPage } from "./PluginsPage";
export interface AdminPageProps {
    store: AdminStore;
    agentImagesStore: () => AgentImagesStore;
    agentSecretsStore: () => AgentSecretsStore;
    pluginsStore: () => PluginsStore;
    /** Display-only plugin icon URL per catalog short name, resolved by the consumer. */
    pluginIconUrl?: (shortName: string) => string | undefined;
    activeSection: AdminPageSection;
    onSectionChange: (section: AdminPageSection) => void;
}
export type AdminPageSection =
    | "users"
    | "reports"
    | "automations"
    | "integrations"
    | "images"
    | "secrets"
    | "plugins";
const tabs: TabItem[] = [
    { id: "users", label: "Users", icon: "users" },
    { id: "reports", label: "Reports", icon: "shield" },
    { id: "automations", label: "Automations", icon: "zap" },
    { id: "integrations", label: "Integrations", icon: "link" },
    { id: "images", label: "Agent images", icon: "spark" },
    { id: "secrets", label: "Agent secrets", icon: "shield" },
    { id: "plugins", label: "Plugins", icon: "braces" },
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
/** Complete admin page with independently materialized catalog, image, and secret stores. */
export function AdminPage(props: AdminPageProps) {
    const [query, setQuery] = useState("");
    return (
        <StoreSurface store={props.store}>
            {(snapshot) => {
                const tab = () => props.activeSection;
                const loadable =
                    tab() === "users"
                        ? snapshot.users
                        : tab() === "reports"
                          ? snapshot.reports
                          : tab() === "automations"
                            ? snapshot.automations
                            : tab() === "integrations"
                              ? snapshot.integrations
                              : undefined;
                const needle = query.trim().toLowerCase();
                const rows = (() => {
                    let values: DataTableRow[] = [];
                    const current = snapshot;
                    if (tab() === "users" && current.users.type === "ready")
                        values = userRows(current.users.value);
                    else if (tab() === "reports" && current.reports.type === "ready")
                        values = reportRows(current.reports.value);
                    else if (tab() === "automations" && current.automations.type === "ready")
                        values = automationRows(current.automations.value);
                    else if (tab() === "integrations" && current.integrations.type === "ready")
                        values = integrationRows(current.integrations.value);
                    if (!needle) return values;
                    return values.filter((row) =>
                        Object.values(row.cells).some(
                            (cell) =>
                                typeof cell === "string" && cell.toLowerCase().includes(needle),
                        ),
                    );
                })();
                const loadError = (() => {
                    const state = loadable;
                    return state?.type === "error" ? state.error.message : undefined;
                })();
                return (
                    <Box
                        style={{
                            display: "flex",
                            flex: "1 1 0%",
                            flexDirection: "column",
                            minHeight: 0,
                        }}
                    >
                        <Toolbar
                            search={{
                                value: query,
                                onChange: setQuery,
                                placeholder: `Search ${tab()}`,
                            }}
                            subtitle="Live workspace data"
                            title="Admin"
                        />
                        <Tabs
                            activeId={tab()}
                            onSelect={(id) => {
                                props.onSectionChange(id as AdminPageSection);
                                setQuery("");
                            }}
                            tabs={tabs}
                        />
                        <Box
                            style={{
                                flex: "1 1 0%",
                                minHeight: 0,
                                overflow: "auto",
                            }}
                        >
                            <Box
                                style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    padding: "16px",
                                }}
                            >
                                {tab() === "images" ? (
                                    <AgentImagesPage
                                        query={query}
                                        store={props.agentImagesStore()}
                                    />
                                ) : tab() === "secrets" ? (
                                    <AgentSecretsPage
                                        query={query}
                                        store={props.agentSecretsStore()}
                                    />
                                ) : tab() === "plugins" ? (
                                    <PluginsPage
                                        agentImagesStore={props.agentImagesStore}
                                        iconUrl={props.pluginIconUrl}
                                        query={query}
                                        store={props.pluginsStore()}
                                    />
                                ) : loadable?.type !== "error" ? (
                                    loadable?.type === "ready" ? (
                                        <DataTable
                                            columns={columns[tab()] ?? []}
                                            empty={
                                                <EmptyState
                                                    description={
                                                        needle
                                                            ? "Try a different search term."
                                                            : `The server returned no ${tab()}.`
                                                    }
                                                    icon="search"
                                                    size="inline"
                                                    title={needle ? "No matches" : "Nothing here"}
                                                />
                                            }
                                            rows={rows}
                                        />
                                    ) : (
                                        <EmptyState
                                            description={`Loading ${tab()}.`}
                                            icon="shield"
                                            title="Loading administration…"
                                        />
                                    )
                                ) : (
                                    <Banner tone="danger" title="Admin access unavailable">
                                        {loadError ?? "Administrative data could not load."}
                                    </Banner>
                                )}
                            </Box>
                        </Box>
                    </Box>
                );
            }}
        </StoreSurface>
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
function automationRows(values: readonly AutomationSummary[]): DataTableRow[] {
    return values.map((value) => ({
        id: value.id,
        cells: {
            name: value.name,
            trigger: humanize(value.triggerType),
            action: humanize(value.actionType),
            status: (
                <Badge
                    label={value.active ? "Active" : "Paused"}
                    variant={value.active ? "success" : "neutral"}
                />
            ),
        },
    }));
}
function integrationRows(values: readonly IntegrationSummary[]): DataTableRow[] {
    return values.map((value) => ({
        id: value.id,
        cells: {
            name: value.name,
            kind: humanize(value.kind),
            scopes: value.scopes.join(", ") || "No scopes",
            status: (
                <Badge
                    label={value.active ? "Active" : "Revoked"}
                    variant={value.active ? "success" : "neutral"}
                />
            ),
        },
    }));
}
function formatDate(value?: string): string {
    return value
        ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(
              new Date(value),
          )
        : "Never";
}
function humanize(value: string): string {
    return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}
function capitalize(value: string): string {
    return value.replace(/^./, (letter) => letter.toUpperCase());
}
