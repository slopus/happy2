import { useState } from "react";
import type {
    AdminStore,
    AdminUserSummary,
    AgentImagesStore,
    AgentSecretsStore,
    AutomationSummary,
    IntegrationSummary,
    ModerationReport,
    PluginInstallStore,
    PluginsStore,
    RolesStore,
} from "happy2-state";
import { Badge } from "../../Badge";
import { Banner } from "../../Banner";
import { Box } from "../../Box";
import { Button } from "../../Button";
import { DataTable, type DataTableColumn, type DataTableRow } from "../../DataTable";
import { EmptyState } from "../../EmptyState";
import { StoreSurface } from "../../StoreSurface";
import { Toolbar } from "../../Toolbar";
import { UserPasswordResetDialog } from "../../UserPasswordResetDialog";
import { AgentImagesPage } from "./AgentImagesPage";
import { AgentSecretsPage } from "./AgentSecretsPage";
import { PluginsPage } from "./PluginsPage";
import { RolesPage } from "./RolesPage";
export interface AdminPageProps {
    /** Lazily materialized only for the legacy users/reports/automation/integration sections. */
    store: () => AdminStore;
    agentImagesStore: () => AgentImagesStore;
    agentSecretsStore: () => AgentSecretsStore;
    pluginsStore: () => PluginsStore;
    /** The external plugin install flow surface, materialized when its dialog opens. */
    pluginInstallStore: () => PluginInstallStore;
    rolesStore: () => RolesStore;
    /** Display-only plugin icon URL per catalog short name, resolved by the consumer. */
    pluginIconUrl?: (shortName: string) => string | undefined;
    /** Display-only icon URL per persisted system plugin ID, resolved by the consumer. */
    systemPluginImageUrl?: (pluginId: string) => string | undefined;
    activeSection: AdminPageSection;
    onSectionChange: (section: AdminPageSection) => void;
    /**
     * Sections the current user may see, in the canonical tab order; the
     * consumer derives this from effective permissions. Omitted means all.
     */
    sections?: readonly AdminPageSection[];
    canManageImages?: boolean;
    canManageSecrets?: boolean;
    canAssignSecrets?: boolean;
    canViewRoleMembers?: boolean;
    canResetPasswords?: boolean;
}
export type AdminPageSection =
    | "users"
    | "reports"
    | "automations"
    | "integrations"
    | "images"
    | "secrets"
    | "plugins"
    | "roles";
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
    const [passwordRevealed, setPasswordRevealed] = useState(true);
    const [passwordCopied, setPasswordCopied] = useState(false);
    const [passwordCopyError, setPasswordCopyError] = useState<string>();
    const passwordUi: PasswordResetUi = {
        revealed: passwordRevealed,
        copied: passwordCopied,
        copyError: passwordCopyError,
        open(store, userId) {
            setPasswordRevealed(true);
            setPasswordCopied(false);
            setPasswordCopyError(undefined);
            store.getState().userPasswordResetOpen(userId);
        },
        close(store) {
            setPasswordRevealed(true);
            setPasswordCopied(false);
            setPasswordCopyError(undefined);
            store.getState().userPasswordResetClose();
        },
        regenerate(store) {
            setPasswordRevealed(true);
            setPasswordCopied(false);
            setPasswordCopyError(undefined);
            store.getState().userPasswordResetRegenerate();
        },
        toggleReveal() {
            setPasswordRevealed((value) => !value);
        },
        async copy(password) {
            try {
                if (!navigator.clipboard?.writeText)
                    throw new Error("Clipboard access is unavailable.");
                await navigator.clipboard.writeText(password);
                setPasswordCopied(true);
                setPasswordCopyError(undefined);
            } catch (error) {
                setPasswordCopied(false);
                setPasswordCopyError(
                    error instanceof Error ? error.message : "Clipboard access is unavailable.",
                );
            }
        },
    };
    const independent =
        props.activeSection === "images" ||
        props.activeSection === "secrets" ||
        props.activeSection === "plugins" ||
        props.activeSection === "roles";
    if (independent) return adminPageContent(props, query, setQuery, passwordUi);
    const store = props.store();
    return (
        <StoreSurface store={store}>
            {(snapshot) => adminPageContent(props, query, setQuery, passwordUi, snapshot, store)}
        </StoreSurface>
    );
}

interface PasswordResetUi {
    readonly revealed: boolean;
    readonly copied: boolean;
    readonly copyError?: string;
    open(store: AdminStore, userId: string): void;
    close(store: AdminStore): void;
    regenerate(store: AdminStore): void;
    toggleReveal(): void;
    copy(password: string): Promise<void>;
}

function adminPageContent(
    props: AdminPageProps,
    query: string,
    setQuery: (value: string) => void,
    passwordUi: PasswordResetUi,
    snapshot?: ReturnType<AdminStore["getState"]>,
    store?: AdminStore,
) {
    const tab = () => props.activeSection;
    const loadable =
        tab() === "users"
            ? snapshot?.users
            : tab() === "reports"
              ? snapshot?.reports
              : tab() === "automations"
                ? snapshot?.automations
                : tab() === "integrations"
                  ? snapshot?.integrations
                  : undefined;
    const needle = query.trim().toLowerCase();
    const rows = (() => {
        let values: DataTableRow[] = [];
        const current = snapshot;
        if (!current) return values;
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
                (cell) => typeof cell === "string" && cell.toLowerCase().includes(needle),
            ),
        );
    })();
    const loadError = (() => {
        const state = loadable;
        return state?.type === "error" ? state.error.message : undefined;
    })();
    const passwordReset = snapshot?.userPasswordReset;
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
            <Box
                style={{
                    flex: "1 1 0%",
                    minHeight: 0,
                    overflow: "auto",
                }}
            >
                {/* Section navigation lives in the sidebar; keying by section id
                    remounts the standalone section component so it animates in. */}
                <Box key={tab()} className="happy2-admin-page__section">
                    {tab() === "images" ? (
                        <AgentImagesPage
                            canManage={props.canManageImages}
                            query={query}
                            store={props.agentImagesStore()}
                        />
                    ) : tab() === "secrets" ? (
                        <AgentSecretsPage
                            canAssign={props.canAssignSecrets}
                            canManage={props.canManageSecrets}
                            query={query}
                            store={props.agentSecretsStore()}
                        />
                    ) : tab() === "plugins" ? (
                        <PluginsPage
                            agentImagesStore={props.agentImagesStore}
                            iconUrl={props.pluginIconUrl}
                            installStore={props.pluginInstallStore}
                            query={query}
                            store={props.pluginsStore()}
                            systemImageUrl={props.systemPluginImageUrl}
                        />
                    ) : tab() === "roles" ? (
                        <RolesPage
                            query={query}
                            showMembers={props.canViewRoleMembers}
                            store={props.rolesStore()}
                        />
                    ) : loadable?.type !== "error" ? (
                        loadable?.type === "ready" ? (
                            <DataTable
                                actionsWidth={props.canResetPasswords ? 160 : undefined}
                                columns={columns[tab()] ?? []}
                                empty={
                                    <EmptyState
                                        description={
                                            needle
                                                ? "Try a different search term."
                                                : `Workspace ${tab()} will appear here.`
                                        }
                                        icon="search"
                                        size="inline"
                                        title={needle ? "No matches" : `No ${tab()} yet`}
                                    />
                                }
                                rowActions={
                                    tab() === "users" && props.canResetPasswords && store
                                        ? (row) => (
                                              <Button
                                                  aria-label={`Reset password for ${userLabel(snapshot?.users, row.id)}`}
                                                  icon="shield"
                                                  onClick={() => passwordUi.open(store, row.id)}
                                                  size="small"
                                                  variant="ghost"
                                              >
                                                  Reset password
                                              </Button>
                                          )
                                        : undefined
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
            {passwordReset?.type === "open" && store ? (
                <UserPasswordResetDialog
                    copied={passwordUi.copied}
                    copyError={passwordUi.copyError}
                    displayName={passwordReset.displayName}
                    error={passwordReset.error?.message}
                    onClose={() => passwordUi.close(store)}
                    onCopy={() => void passwordUi.copy(passwordReset.password)}
                    onRegenerate={() => passwordUi.regenerate(store)}
                    onSubmit={() => store.getState().userPasswordResetSubmit()}
                    onToggleReveal={() => passwordUi.toggleReveal()}
                    password={passwordReset.password}
                    revealed={passwordUi.revealed}
                    revokedSessionCount={passwordReset.revokedSessionCount}
                    status={passwordReset.status}
                    username={passwordReset.username}
                />
            ) : null}
        </Box>
    );
}

function userLabel(
    users: ReturnType<AdminStore["getState"]>["users"] | undefined,
    userId: string,
): string {
    if (users?.type !== "ready") return userId;
    const user = users.value.find((value) => value.id === userId);
    if (!user) return userId;
    return [user.firstName, user.lastName].filter(Boolean).join(" ") || `@${user.username}`;
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
