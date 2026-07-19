import { partitionComponentProps } from "./componentProps";
import { type CSSProperties } from "react";
import { Badge, type BadgeVariant } from "./Badge";
import { Banner } from "./Banner";
import { Box } from "./Box";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";
import { FormRow } from "./FormRow";
import { Icon } from "./Icon";
import { Modal } from "./Modal";
import { Select, type SelectOption } from "./Select";
import { TextField } from "./TextField";
export type PluginInstallationStatus =
    | "preparing"
    | "starting"
    | "ready"
    | "broken_configuration"
    | "failed";
export type PluginInstallationItem = {
    id: string;
    /** The immutable package version this installation is pinned to. */
    version: string;
    status: PluginInstallationStatus;
    /** Optional bounded diagnostic text (statusDetail or lastError). */
    detail?: string;
};
export type PluginVariableField = {
    key: string;
    displayName: string;
    description: string;
    /** Secret values render masked and are write-only. */
    kind: "secret" | "text";
};
export type PluginCatalogEntry = {
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
    /** True once a durable system plugin exists for this package. */
    installed: boolean;
    /** The immutable installed version when it differs from the catalog. */
    installedVersion?: string;
    updateAvailable?: boolean;
    installations: readonly PluginInstallationItem[];
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
    onOpenInstall?: (shortName: string) => void;
    onCloseInstall?: () => void;
    onDraftValueChange?: (key: string, value: string) => void;
    onDraftContainerImageChange?: (imageId: string) => void;
    onSubmitInstall?: () => void;
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
        "loading",
        "error",
        "actionError",
        "onDismissActionError",
        "installOpen",
        "draftValues",
        "containerImageOptions",
        "draftContainerImageId",
        "onOpenInstall",
        "onCloseInstall",
        "onDraftValueChange",
        "onDraftContainerImageChange",
        "onSubmitInstall",
    ]);
    const title = () => local.title ?? "Plugins";
    const busy = (shortName: string) => local.busyShortNames?.includes(shortName) ?? false;
    const open = local.plugins.find((plugin) => plugin.shortName === local.installOpen);
    const values = local.draftValues ?? {};
    const selectionRequired = open?.mcp?.container === "selection_required";
    const canSubmit = () =>
        Boolean(open) &&
        !busy(open!.shortName) &&
        open!.variables.every((variable) => (values[variable.key] ?? "") !== "") &&
        (!selectionRequired || Boolean(local.draftContainerImageId));
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
            </Box>

            {local.actionError
                ? ((reason) => (
                      <Banner
                          onDismiss={local.onDismissActionError}
                          tone="danger"
                          title="Install failed"
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
                                    key={plugin.shortName}
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
                                            {plugin.updateAvailable ? (
                                                <Badge
                                                    label={`Update v${plugin.version}`}
                                                    variant="warning"
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
                                                    <span
                                                        className="happy2-plugin-catalog-panel__installation"
                                                        data-installation-id={installation.id}
                                                        key={installation.id}
                                                        title={installation.detail}
                                                    >
                                                        <Badge
                                                            label={
                                                                statusLabels[installation.status]
                                                            }
                                                            variant={
                                                                statusVariants[installation.status]
                                                            }
                                                        />
                                                        <span className="happy2-plugin-catalog-panel__installation-version">
                                                            v{installation.version}
                                                        </span>
                                                    </span>
                                                ))}
                                            </Box>
                                        ) : null}
                                    </Box>
                                    <Box className="happy2-plugin-catalog-panel__card-actions">
                                        {local.onOpenInstall ? (
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
                            description="Packages bundled with the server appear here once its catalog loads."
                            icon="braces"
                            size="inline"
                            title="No plugins in the catalog"
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
                      <Box
                          className="happy2-plugin-catalog-panel__overlay"
                          data-happy2-ui="plugin-catalog-panel-overlay"
                          onClick={() => local.onCloseInstall?.()}
                      >
                          <Box onClick={(event) => event.stopPropagation()}>
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
                                                      options={[
                                                          ...(local.containerImageOptions ?? []),
                                                      ]}
                                                      placeholder="Choose a ready image"
                                                      value={local.draftContainerImageId}
                                                  />
                                              }
                                              description="This stdio plugin runs inside a dedicated container created from a ready agent image."
                                              label="Container image"
                                              layout="stacked"
                                          />
                                      ) : null}
                                      {plugin.variables.length === 0 && !selectionRequired ? (
                                          <span className="happy2-plugin-catalog-panel__form-note">
                                              This package needs no configuration. Installing it
                                              creates a new independent installation.
                                          </span>
                                      ) : null}
                                  </Box>
                              </Modal>
                          </Box>
                      </Box>
                  ))(open)
                : null}
        </Box>
    );
}
