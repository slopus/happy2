import { partitionComponentProps } from "./componentProps";
import { type CSSProperties } from "react";
import { Badge, type BadgeVariant } from "./Badge";
import { Banner } from "./Banner";
import { Box } from "./Box";
import { Button } from "./Button";
import { Checkbox } from "./Checkbox";
import { EmptyState } from "./EmptyState";
import { FormRow } from "./FormRow";
import { Icon } from "./Icon";
import { Modal } from "./Modal";
import { ModalOverlay } from "./ModalOverlay";
import { PluginDiagnosticsViewer } from "./PluginDiagnosticsViewer";
import { Select, type SelectOption } from "./Select";
import { TextField } from "./TextField";
export type PluginInstallationStatus =
    | "preparing"
    | "starting"
    | "ready"
    | "broken_configuration"
    | "failed";
export type PluginUpdateBadge =
    | { status: "checking"; detail?: string }
    | { status: "checked"; updateAvailable: boolean; remoteVersion: string }
    | { status: "failed"; detail: string };
/** On-demand diagnostics/log content and load state for one installation. */
export type PluginDiagnosticsView = {
    loading?: boolean;
    /** Terminal read failure. */
    error?: string;
    status?: PluginInstallationStatus;
    detail?: string;
    failure?: string;
    output?: string;
    updatedLabel?: string;
};
export type PluginInstallationItem = {
    id: string;
    /** The immutable package version this installation is pinned to. */
    version: string;
    status: PluginInstallationStatus;
    /** Optional bounded diagnostic text (statusDetail or lastError) shown inline. */
    detail?: string;
    /** Host permission ids currently granted to this installation. */
    grantedPermissions?: readonly string[];
    /** The latest per-installation remote update check. */
    updateCheck?: PluginUpdateBadge;
    /** True while this installation's update commit is streaming; carries a progress line. */
    updating?: boolean;
    updateProgress?: string;
    /** Terminal failure of the last update commit for this installation. */
    updateError?: string;
    /** True while this installation's retry request is in flight. */
    retrying?: boolean;
    /** True while this installation's uninstall request is in flight. */
    uninstalling?: boolean;
    /** True when the inline diagnostics viewer is expanded for this installation. */
    diagnosticsOpen?: boolean;
    /** Diagnostics content/state; supplied once the viewer is opened. */
    diagnostics?: PluginDiagnosticsView;
};
export type PluginVariableField = {
    key: string;
    displayName: string;
    description: string;
    /** Secret values render masked and are write-only. */
    kind: "secret" | "text";
};
export type PluginPermissionDefinition = {
    id: string;
    displayName: string;
    description: string;
};
export type PluginPermissionSection = {
    id: string;
    displayName: string;
    readOnly: readonly PluginPermissionDefinition[];
    mutations: readonly PluginPermissionDefinition[];
};
export type PluginCatalogEntry = {
    /** Stable row identity when shortName alone is not unique; defaults to shortName. */
    id?: string;
    shortName: string;
    displayName: string;
    description: string;
    /** The version currently advertised by the catalog. */
    version: string;
    /** Display-only image URL supplied by the consumer; never a server route. */
    iconUrl?: string;
    skills: readonly { name: string; description: string }[];
    mcp?: { type: "remote" | "stdio"; container: "bundled" | "selection_required" | "none" };
    variables: readonly PluginVariableField[];
    /** Host permissions the package declares and an administrator may grant. */
    apiPermissions?: readonly PluginPermissionSection[];
    /** True once a durable system plugin exists for this package. */
    installed: boolean;
    /** The immutable installed version when it differs from the catalog. */
    installedVersion?: string;
    /** Independent installations of this package, each managed on its own. */
    installations: readonly PluginInstallationItem[];
    /** The durable system plugin ID. */
    pluginId?: string;
    /** Display label of an external package source, e.g. "GitHub · owner/repo". */
    sourceLabel?: string;
    /** False for externally sourced rows that cannot be reinstalled from the catalog. */
    installable?: boolean;
};
export type PluginCatalogPanelProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    title?: string;
    subtitle?: string;
    plugins: readonly PluginCatalogEntry[];
    /** Short names with an in-flight install request; their button disables. */
    busyShortNames?: readonly string[];
    /** Installation ids with an in-flight permission update; their controls disable. */
    permissionsBusyInstallationIds?: readonly string[];
    /** First load has not resolved yet. */
    loading?: boolean;
    /** Fatal load error; replaces the list with a banner. */
    error?: string;
    /** Transient action error, shown as a dismissible banner above the list. */
    actionError?: string;
    onDismissActionError?: () => void;
    /* Install dialog — controlled, like the AgentSecretPanel create dialog. */
    /** Short name of the catalog entry whose install dialog is open. */
    installOpen?: string;
    /** Draft values keyed by declared variable key. */
    draftValues?: Readonly<Record<string, string>>;
    /** Ready container images offered when the manifest requires a selection. */
    containerImageOptions?: readonly SelectOption[];
    draftContainerImageId?: string;
    /** Currently checked permission ids for whichever dialog is open. */
    draftPermissions?: readonly string[];
    onOpenInstall?: (shortName: string) => void;
    onCloseInstall?: () => void;
    onDraftValueChange?: (key: string, value: string) => void;
    onDraftContainerImageChange?: (imageId: string) => void;
    onDraftPermissionToggle?: (permissionId: string, checked: boolean) => void;
    onSubmitInstall?: () => void;
    /** Installation id whose permission editor is open. */
    permissionsOpen?: string;
    onOpenPermissions?: (installationId: string) => void;
    onClosePermissions?: () => void;
    onSubmitPermissions?: () => void;
    /** Renders the "Install plugin" entry point for external packages in the header. */
    onOpenExternalInstall?: () => void;
    /** Downloads and commits the available remote update for one installation. */
    onInstallationUpdate?: (installationId: string) => void;
    /** Re-runs the remote update comparison for one installation after a failed check. */
    onInstallationCheckUpdate?: (installationId: string) => void;
    /** Retries activation of a failed or broken installation in place. */
    onInstallationRetry?: (installationId: string) => void;
    /** Uninstalls one installation (the destructive confirmation is owned by the consumer). */
    onInstallationUninstall?: (installationId: string) => void;
    /** Expands or collapses the inline diagnostics viewer for one installation. */
    onInstallationDiagnosticsToggle?: (installationId: string, open: boolean) => void;
};
const statusLabels: Record<PluginInstallationStatus, string> = {
    preparing: "Preparing",
    starting: "Starting",
    ready: "Ready",
    broken_configuration: "Broken configuration",
    failed: "Failed",
};
const statusVariants: Record<PluginInstallationStatus, BadgeVariant> = {
    preparing: "neutral",
    starting: "info",
    ready: "success",
    broken_configuration: "danger",
    failed: "danger",
};
const INSTALL_PERMISSIONS_INTRO =
    "Grant only the host capabilities this installation needs. Every permission is optional.";
const NO_PERMISSIONS_NOTE = "This plugin does not request any host permissions.";
function permissionCount(sections: readonly PluginPermissionSection[]): number {
    return sections.reduce(
        (total, section) => total + section.readOnly.length + section.mutations.length,
        0,
    );
}
function permissionGroups(section: PluginPermissionSection) {
    return [
        { access: "read-only", label: "Read only", definitions: section.readOnly },
        { access: "mutations", label: "Can make changes", definitions: section.mutations },
    ].filter((group) => group.definitions.length > 0);
}
/** Renders declared host capabilities grouped by section and access class. */
export function PluginPermissionFieldset(props: {
    sections: readonly PluginPermissionSection[];
    selected: readonly string[];
    disabled?: boolean;
    emptyNote?: string;
    onToggle?: (permissionId: string, checked: boolean) => void;
}) {
    if (permissionCount(props.sections) === 0)
        return (
            <span className="happy2-plugin-catalog-panel__form-note">
                {props.emptyNote ?? NO_PERMISSIONS_NOTE}
            </span>
        );
    return (
        <Box className="happy2-plugin-catalog-panel__permissions">
            {props.sections.map((section) => (
                <Box
                    className="happy2-plugin-catalog-panel__permission-section"
                    data-section-id={section.id}
                    key={section.id}
                >
                    <span className="happy2-plugin-catalog-panel__permission-section-title">
                        {section.displayName}
                    </span>
                    {permissionGroups(section).map((group) => (
                        <Box
                            className="happy2-plugin-catalog-panel__permission-group"
                            key={group.access}
                        >
                            <span className="happy2-plugin-catalog-panel__permission-group-label">
                                {group.label}
                            </span>
                            {group.definitions.map((definition) => (
                                <Box
                                    className="happy2-plugin-catalog-panel__permission"
                                    data-permission-id={definition.id}
                                    key={definition.id}
                                >
                                    <Checkbox
                                        aria-label={definition.displayName}
                                        checked={props.selected.includes(definition.id)}
                                        disabled={props.disabled}
                                        onChange={(checked) =>
                                            props.onToggle?.(definition.id, checked)
                                        }
                                    />
                                    <Box className="happy2-plugin-catalog-panel__permission-text">
                                        <span className="happy2-plugin-catalog-panel__permission-name">
                                            {definition.displayName}
                                        </span>
                                        <span className="happy2-plugin-catalog-panel__permission-description">
                                            {definition.description}
                                        </span>
                                    </Box>
                                </Box>
                            ))}
                        </Box>
                    ))}
                </Box>
            ))}
        </Box>
    );
}
/**
 * A compact, stable short code for one installation, derived from its opaque id,
 * so two installations at the same version and status are visually distinct. The
 * full id remains available through the row's title/aria-label.
 */
export function installationShortId(id: string): string {
    return `#${id.slice(-6)}`;
}
function updateCheckLabel(check: PluginUpdateBadge): string {
    if (check.status === "checking") return "Checking for update…";
    if (check.status === "failed") return "Update check failed";
    return check.updateAvailable ? `Update v${check.remoteVersion} available` : "Up to date";
}
function updateCheckVariant(check: PluginUpdateBadge): BadgeVariant {
    if (check.status === "checking") return "info";
    if (check.status === "failed") return "danger";
    return check.updateAvailable ? "warning" : "neutral";
}
/**
 * One independent installation's management block: live health, its own remote
 * update check and Update action, an in-place Retry for a broken/failed
 * installation, an inline diagnostics/log viewer, per-installation permissions,
 * and an individual Uninstall. Presentational and controlled; every mutation is
 * scoped to this installation id.
 */
export function PluginInstallationRow(props: {
    installation: PluginInstallationItem;
    permissionsBusy?: boolean;
    onOpenPermissions?: (installationId: string) => void;
    onUpdate?: (installationId: string) => void;
    onCheckUpdate?: (installationId: string) => void;
    onRetry?: (installationId: string) => void;
    onUninstall?: (installationId: string) => void;
    onDiagnosticsToggle?: (installationId: string, open: boolean) => void;
}) {
    const installation = props.installation;
    const check = installation.updateCheck;
    const remoteVersion = check?.status === "checked" ? check.remoteVersion : undefined;
    const updateAvailable = check?.status === "checked" && check.updateAvailable;
    const broken =
        installation.status === "failed" || installation.status === "broken_configuration";
    const busy = installation.updating || installation.retrying || installation.uninstalling;
    const grants = installation.grantedPermissions?.length ?? 0;
    return (
        <Box
            className="happy2-plugin-catalog-panel__installation"
            data-happy2-ui="plugin-catalog-installation"
            data-installation-id={installation.id}
            data-installation-status={installation.status}
        >
            <Box className="happy2-plugin-catalog-panel__installation-summary">
                <span className="happy2-plugin-catalog-panel__installation-health">
                    <Badge
                        label={statusLabels[installation.status]}
                        variant={statusVariants[installation.status]}
                    />
                    <span className="happy2-plugin-catalog-panel__installation-version">
                        v{installation.version}
                    </span>
                    <span
                        aria-label={`Installation ${installation.id}`}
                        className="happy2-plugin-catalog-panel__installation-code"
                        data-happy2-ui="plugin-installation-id"
                        title={installation.id}
                    >
                        {installationShortId(installation.id)}
                    </span>
                </span>
                {check ? (
                    <span
                        data-happy2-ui="plugin-installation-update-check"
                        title={
                            check.status === "failed" || check.status === "checking"
                                ? check.detail
                                : undefined
                        }
                    >
                        <Badge
                            label={updateCheckLabel(check)}
                            variant={updateCheckVariant(check)}
                        />
                    </span>
                ) : null}
            </Box>
            {installation.detail && !installation.diagnosticsOpen ? (
                <span
                    className="happy2-plugin-catalog-panel__installation-detail"
                    data-happy2-ui="plugin-installation-detail"
                >
                    {installation.detail}
                </span>
            ) : null}
            {installation.updating ? (
                <span
                    className="happy2-plugin-catalog-panel__installation-progress"
                    data-happy2-ui="plugin-installation-progress"
                >
                    {installation.updateProgress ?? "Updating…"}
                </span>
            ) : installation.updateError ? (
                <span
                    className="happy2-plugin-catalog-panel__installation-error"
                    data-happy2-ui="plugin-installation-update-error"
                >
                    {installation.updateError}
                </span>
            ) : null}
            <Box className="happy2-plugin-catalog-panel__installation-actions">
                {props.onUpdate && updateAvailable ? (
                    <Button
                        data-testid="plugin-installation-update"
                        disabled={busy}
                        icon="arrow-right"
                        onClick={() => props.onUpdate?.(installation.id)}
                        size="small"
                        variant="primary"
                    >
                        {installation.updating ? "Updating…" : `Update to v${remoteVersion ?? ""}`}
                    </Button>
                ) : null}
                {props.onCheckUpdate && check?.status === "failed" ? (
                    <Button
                        disabled={busy}
                        onClick={() => props.onCheckUpdate?.(installation.id)}
                        size="small"
                        variant="ghost"
                    >
                        Check again
                    </Button>
                ) : null}
                {props.onRetry && broken ? (
                    <Button
                        data-testid="plugin-installation-retry"
                        disabled={busy}
                        onClick={() => props.onRetry?.(installation.id)}
                        size="small"
                        variant="secondary"
                    >
                        {installation.retrying ? "Retrying…" : "Retry"}
                    </Button>
                ) : null}
                {props.onOpenPermissions ? (
                    <Button
                        disabled={props.permissionsBusy || busy}
                        icon="shield"
                        onClick={() => props.onOpenPermissions?.(installation.id)}
                        size="small"
                        variant="ghost"
                    >
                        {grants > 0 ? `Permissions · ${grants}` : "Permissions"}
                    </Button>
                ) : null}
                {props.onDiagnosticsToggle ? (
                    <Button
                        data-testid="plugin-installation-diagnostics"
                        icon="terminal"
                        onClick={() =>
                            props.onDiagnosticsToggle?.(
                                installation.id,
                                !installation.diagnosticsOpen,
                            )
                        }
                        size="small"
                        variant="ghost"
                    >
                        {installation.diagnosticsOpen ? "Hide logs" : "Logs"}
                    </Button>
                ) : null}
                {props.onUninstall ? (
                    <Button
                        data-testid="plugin-installation-uninstall"
                        disabled={busy}
                        onClick={() => props.onUninstall?.(installation.id)}
                        size="small"
                        variant="danger"
                    >
                        {installation.uninstalling ? "Uninstalling…" : "Uninstall"}
                    </Button>
                ) : null}
            </Box>
            {installation.diagnosticsOpen ? (
                <PluginDiagnosticsViewer
                    detail={installation.diagnostics?.detail}
                    error={installation.diagnostics?.error}
                    failure={installation.diagnostics?.failure}
                    loading={installation.diagnostics?.loading}
                    output={installation.diagnostics?.output}
                    status={installation.diagnostics?.status ?? installation.status}
                    updatedLabel={installation.diagnostics?.updatedLabel}
                />
            ) : null}
        </Box>
    );
}
/**
 * C-066 PluginCatalogPanel — the administrator surface for the server plugin
 * catalog: packages of Agent Skills and MCP servers bundled with the server.
 * Each card shows the package icon, version, skill and MCP capability badges,
 * the exact name and description of every Agent Skill the package provides,
 * every independent installation with its live health, and an Install action. The
 * install dialog collects the manifest's declared variables (secret values are
 * write-only and masked) and, when a stdio manifest has no bundled container,
 * a ready container image selection. Presentational and fully controlled —
 * data and every mutation flow through props, and there is deliberately no
 * refresh control; the consumer keeps `plugins` live from the realtime stream.
 */
export function PluginCatalogPanel(props: PluginCatalogPanelProps) {
    const [local, rest] = partitionComponentProps(props, [
        "className",
        "style",
        "title",
        "subtitle",
        "plugins",
        "busyShortNames",
        "permissionsBusyInstallationIds",
        "loading",
        "error",
        "actionError",
        "onDismissActionError",
        "installOpen",
        "draftValues",
        "containerImageOptions",
        "draftContainerImageId",
        "draftPermissions",
        "onOpenInstall",
        "onCloseInstall",
        "onDraftValueChange",
        "onDraftContainerImageChange",
        "onDraftPermissionToggle",
        "onSubmitInstall",
        "permissionsOpen",
        "onOpenPermissions",
        "onClosePermissions",
        "onSubmitPermissions",
        "onOpenExternalInstall",
        "onInstallationUpdate",
        "onInstallationCheckUpdate",
        "onInstallationRetry",
        "onInstallationUninstall",
        "onInstallationDiagnosticsToggle",
    ]);
    const title = () => local.title ?? "Plugins";
    const busy = (shortName: string) => local.busyShortNames?.includes(shortName) ?? false;
    const open = local.plugins.find((plugin) => plugin.shortName === local.installOpen);
    const values = local.draftValues ?? {};
    const selected = local.draftPermissions ?? [];
    const selectionRequired = open?.mcp?.container === "selection_required";
    const canSubmit = () =>
        Boolean(open) &&
        !busy(open!.shortName) &&
        open!.variables.every((variable) => (values[variable.key] ?? "") !== "") &&
        (!selectionRequired || Boolean(local.draftContainerImageId));
    const permissionsTarget = local.permissionsOpen
        ? local.plugins.flatMap((plugin) =>
              plugin.installations
                  .filter((installation) => installation.id === local.permissionsOpen)
                  .map((installation) => ({ plugin, installation })),
          )[0]
        : undefined;
    const permissionsBusy = (installationId: string) =>
        local.permissionsBusyInstallationIds?.includes(installationId) ?? false;
    return (
        <Box
            {...rest}
            className={["happy2-plugin-catalog-panel", local.className].filter(Boolean).join(" ")}
            data-happy2-ui="plugin-catalog-panel"
            style={local.style}
        >
            <Box className="happy2-plugin-catalog-panel__header">
                <Box className="happy2-plugin-catalog-panel__heading">
                    <span className="happy2-plugin-catalog-panel__title">{title()}</span>
                    {local.subtitle ? (
                        <span className="happy2-plugin-catalog-panel__subtitle">
                            {local.subtitle}
                        </span>
                    ) : null}
                </Box>
                {local.onOpenExternalInstall ? (
                    <Box className="happy2-plugin-catalog-panel__header-actions">
                        <Button
                            data-testid="plugin-catalog-install-external"
                            icon="plus"
                            onClick={() => local.onOpenExternalInstall?.()}
                            size="small"
                            variant="primary"
                        >
                            Install plugin
                        </Button>
                    </Box>
                ) : null}
            </Box>

            {local.actionError
                ? ((reason) => (
                      <Banner
                          onDismiss={local.onDismissActionError}
                          tone="danger"
                          title="Plugin action failed"
                      >
                          {reason}
                      </Banner>
                  ))(local.actionError)
                : null}

            {!local.error ? (
                !local.loading ? (
                    local.plugins.length > 0 ? (
                        <Box className="happy2-plugin-catalog-panel__list">
                            {local.plugins.map((plugin) => (
                                <Box
                                    className="happy2-plugin-catalog-panel__card"
                                    data-happy2-ui="plugin-catalog-card"
                                    data-plugin-short-name={plugin.shortName}
                                    key={plugin.id ?? plugin.shortName}
                                >
                                    <Box className="happy2-plugin-catalog-panel__icon">
                                        {plugin.iconUrl ? (
                                            <img
                                                alt=""
                                                className="happy2-plugin-catalog-panel__icon-image"
                                                draggable={false}
                                                src={plugin.iconUrl}
                                            />
                                        ) : (
                                            <Icon name="braces" size={20} />
                                        )}
                                    </Box>
                                    <Box className="happy2-plugin-catalog-panel__body">
                                        <Box className="happy2-plugin-catalog-panel__name-row">
                                            <span
                                                className="happy2-plugin-catalog-panel__name"
                                                data-happy2-ui="plugin-catalog-name"
                                            >
                                                {plugin.displayName}
                                            </span>
                                            <span
                                                className="happy2-plugin-catalog-panel__version"
                                                data-happy2-ui="plugin-catalog-version"
                                            >
                                                v{plugin.installedVersion ?? plugin.version}
                                            </span>
                                            {plugin.installed ? (
                                                <Badge label="Installed" variant="success" />
                                            ) : null}
                                            {plugin.sourceLabel ? (
                                                <Badge
                                                    label={plugin.sourceLabel}
                                                    variant="outline"
                                                />
                                            ) : null}
                                        </Box>
                                        <span className="happy2-plugin-catalog-panel__description">
                                            {plugin.description}
                                        </span>
                                        <Box className="happy2-plugin-catalog-panel__capabilities">
                                            {plugin.skills.length > 0 ? (
                                                <Badge
                                                    label={
                                                        plugin.skills.length === 1
                                                            ? "1 skill"
                                                            : `${plugin.skills.length} skills`
                                                    }
                                                    variant="outline"
                                                />
                                            ) : null}
                                            {plugin.mcp ? (
                                                <Badge
                                                    label={`MCP · ${plugin.mcp.type}`}
                                                    variant="outline"
                                                />
                                            ) : null}
                                        </Box>
                                        {plugin.skills.length > 0 ? (
                                            <ul
                                                className="happy2-plugin-catalog-panel__skills"
                                                data-happy2-ui="plugin-catalog-skills"
                                            >
                                                {plugin.skills.map((skill) => (
                                                    <li
                                                        className="happy2-plugin-catalog-panel__skill"
                                                        data-happy2-ui="plugin-catalog-skill"
                                                        data-skill-name={skill.name}
                                                        key={skill.name}
                                                    >
                                                        <span
                                                            className="happy2-plugin-catalog-panel__skill-name"
                                                            data-happy2-ui="plugin-catalog-skill-name"
                                                        >
                                                            {skill.name}
                                                        </span>
                                                        <span
                                                            className="happy2-plugin-catalog-panel__skill-description"
                                                            data-happy2-ui="plugin-catalog-skill-description"
                                                        >
                                                            {skill.description}
                                                        </span>
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : null}
                                        {plugin.installations.length > 0 ? (
                                            <Box
                                                className="happy2-plugin-catalog-panel__installations"
                                                data-happy2-ui="plugin-catalog-installations"
                                            >
                                                {plugin.installations.map((installation) => (
                                                    <PluginInstallationRow
                                                        installation={installation}
                                                        key={installation.id}
                                                        onCheckUpdate={
                                                            local.onInstallationCheckUpdate
                                                        }
                                                        onDiagnosticsToggle={
                                                            local.onInstallationDiagnosticsToggle
                                                        }
                                                        onOpenPermissions={local.onOpenPermissions}
                                                        onRetry={local.onInstallationRetry}
                                                        onUninstall={local.onInstallationUninstall}
                                                        onUpdate={local.onInstallationUpdate}
                                                        permissionsBusy={permissionsBusy(
                                                            installation.id,
                                                        )}
                                                    />
                                                ))}
                                            </Box>
                                        ) : null}
                                    </Box>
                                    <Box className="happy2-plugin-catalog-panel__card-actions">
                                        {local.onOpenInstall && plugin.installable !== false ? (
                                            <Button
                                                disabled={busy(plugin.shortName)}
                                                icon="plus"
                                                onClick={() =>
                                                    local.onOpenInstall?.(plugin.shortName)
                                                }
                                                size="small"
                                                variant={plugin.installed ? "secondary" : "primary"}
                                            >
                                                {busy(plugin.shortName)
                                                    ? "Installing…"
                                                    : plugin.installed
                                                      ? "Install again"
                                                      : "Install"}
                                            </Button>
                                        ) : null}
                                    </Box>
                                </Box>
                            ))}
                        </Box>
                    ) : (
                        <EmptyState
                            description="Install a package from a ZIP or GitHub, or add a package to the server catalog."
                            icon="braces"
                            size="inline"
                            title="No plugins yet"
                        />
                    )
                ) : (
                    <EmptyState
                        description="Loading the server plugin catalog."
                        icon="braces"
                        title="Loading plugins…"
                    />
                )
            ) : (
                <Banner tone="danger" title="Plugins unavailable">
                    {local.error!}
                </Banner>
            )}

            {open
                ? ((plugin) => (
                      <ModalOverlay
                          data-testid="plugin-catalog-install-overlay"
                          onDismiss={() => local.onCloseInstall?.()}
                      >
                          <Modal
                              footer={
                                  <Box className="happy2-plugin-catalog-panel__modal-actions">
                                      <Button
                                          onClick={() => local.onCloseInstall?.()}
                                          variant="ghost"
                                      >
                                          Cancel
                                      </Button>
                                      <Button
                                          disabled={!canSubmit()}
                                          icon="plus"
                                          onClick={() => local.onSubmitInstall?.()}
                                      >
                                          {busy(plugin.shortName)
                                              ? "Installing…"
                                              : "Install plugin"}
                                      </Button>
                                  </Box>
                              }
                              icon="braces"
                              onClose={() => local.onCloseInstall?.()}
                              size="medium"
                              title={`Install ${plugin.displayName}`}
                          >
                              <Box className="happy2-plugin-catalog-panel__form">
                                  <span className="happy2-plugin-catalog-panel__form-summary">
                                      {plugin.description}
                                  </span>
                                  {plugin.variables.map((variable) => (
                                      <FormRow
                                          control={
                                              <TextField
                                                  fullWidth
                                                  onValueChange={(value) =>
                                                      local.onDraftValueChange?.(
                                                          variable.key,
                                                          value,
                                                      )
                                                  }
                                                  placeholder={variable.key}
                                                  type={
                                                      variable.kind === "secret"
                                                          ? "password"
                                                          : "text"
                                                  }
                                                  value={values[variable.key] ?? ""}
                                              />
                                          }
                                          description={
                                              variable.kind === "secret"
                                                  ? `${variable.description} Sent once and never shown again.`
                                                  : variable.description
                                          }
                                          key={variable.key}
                                          label={variable.displayName}
                                          layout="stacked"
                                      />
                                  ))}
                                  {selectionRequired ? (
                                      <FormRow
                                          control={
                                              <Select
                                                  fullWidth
                                                  onValueChange={(value) =>
                                                      local.onDraftContainerImageChange?.(value)
                                                  }
                                                  options={[...(local.containerImageOptions ?? [])]}
                                                  placeholder="Choose a ready image"
                                                  value={local.draftContainerImageId}
                                              />
                                          }
                                          description="This stdio plugin runs inside a dedicated container created from a ready agent image."
                                          label="Container image"
                                          layout="stacked"
                                      />
                                  ) : null}
                                  {permissionCount(plugin.apiPermissions ?? []) > 0 ? (
                                      <Box className="happy2-plugin-catalog-panel__permission-block">
                                          <span className="happy2-plugin-catalog-panel__permission-heading">
                                              Permissions
                                          </span>
                                          <span className="happy2-plugin-catalog-panel__permission-intro">
                                              {INSTALL_PERMISSIONS_INTRO}
                                          </span>
                                          <PluginPermissionFieldset
                                              disabled={busy(plugin.shortName)}
                                              onToggle={local.onDraftPermissionToggle}
                                              sections={plugin.apiPermissions ?? []}
                                              selected={selected}
                                          />
                                      </Box>
                                  ) : null}
                                  {plugin.variables.length === 0 &&
                                  !selectionRequired &&
                                  permissionCount(plugin.apiPermissions ?? []) === 0 ? (
                                      <span className="happy2-plugin-catalog-panel__form-note">
                                          This package needs no configuration. Installing it creates
                                          a new independent installation.
                                      </span>
                                  ) : null}
                              </Box>
                          </Modal>
                      </ModalOverlay>
                  ))(open)
                : null}

            {permissionsTarget
                ? ((target) => (
                      <ModalOverlay
                          data-testid="plugin-catalog-permissions-overlay"
                          onDismiss={() => local.onClosePermissions?.()}
                      >
                          <Modal
                              footer={
                                  <Box className="happy2-plugin-catalog-panel__modal-actions">
                                      <Button
                                          onClick={() => local.onClosePermissions?.()}
                                          variant="ghost"
                                      >
                                          Cancel
                                      </Button>
                                      <Button
                                          disabled={permissionsBusy(target.installation.id)}
                                          icon="check"
                                          onClick={() => local.onSubmitPermissions?.()}
                                      >
                                          {permissionsBusy(target.installation.id)
                                              ? "Saving…"
                                              : "Save permissions"}
                                      </Button>
                                  </Box>
                              }
                              icon="shield"
                              onClose={() => local.onClosePermissions?.()}
                              size="medium"
                              title={`${target.plugin.displayName} permissions`}
                          >
                              <Box className="happy2-plugin-catalog-panel__form">
                                  <span className="happy2-plugin-catalog-panel__form-summary">
                                      {`These permissions apply to installation v${target.installation.version}. Changes restart it with the new grant set.`}
                                  </span>
                                  <PluginPermissionFieldset
                                      disabled={permissionsBusy(target.installation.id)}
                                      onToggle={local.onDraftPermissionToggle}
                                      sections={target.plugin.apiPermissions ?? []}
                                      selected={selected}
                                  />
                              </Box>
                          </Modal>
                      </ModalOverlay>
                  ))(permissionsTarget)
                : null}
        </Box>
    );
}
