import { partitionComponentProps } from "./componentProps";
import { type CSSProperties, type ReactNode } from "react";
import { Badge } from "./Badge";
import { Banner } from "./Banner";
import { Box } from "./Box";
import { Button } from "./Button";
import { DataTable, type DataTableColumn, type DataTableRow } from "./DataTable";
import { EmptyState } from "./EmptyState";
import { FormRow } from "./FormRow";
import { Icon } from "./Icon";
import { Modal } from "./Modal";
import { TextField } from "./TextField";
export type AgentSecretItem = {
    id: string;
    /** Human description of what the secret is for. */
    description: string;
    /** Environment variable names carried by the secret; values never reach the client. */
    environmentVariables: readonly string[];
    /** Number of agents the secret is currently attached to. */
    agentCount: number;
    /** Number of channels the secret is currently attached to. */
    channelCount: number;
};
/** One environment variable in the create draft: its name and its (write-only) value. */
export type AgentSecretDraftVariable = {
    name: string;
    value: string;
};
export type AgentSecretPanelProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    title?: string;
    subtitle?: string;
    secrets: AgentSecretItem[];
    /** Ids with an in-flight delete request; their row action disables. */
    busySecretIds?: readonly string[];
    /** First load has not resolved yet. */
    loading?: boolean;
    /** Fatal load error; replaces the table with a banner. */
    error?: string;
    /** Transient action error, shown as a dismissible banner above the table. */
    actionError?: string;
    onDismissActionError?: () => void;
    /** Opens the secret's detail (variables + attachments) — the row click. */
    onSelectSecret?: (id: string) => void;
    onDeleteSecret?: (id: string) => void;
    /* Create dialog — controlled, like TextField/Select. */
    createOpen?: boolean;
    draftId?: string;
    draftDescription?: string;
    draftVariables?: readonly AgentSecretDraftVariable[];
    creating?: boolean;
    createError?: string;
    onOpenCreate?: () => void;
    onCloseCreate?: () => void;
    onDraftIdChange?: (value: string) => void;
    onDraftDescriptionChange?: (value: string) => void;
    onDraftVariableChange?: (index: number, field: "name" | "value", value: string) => void;
    onAddDraftVariable?: () => void;
    onRemoveDraftVariable?: (index: number) => void;
    onSubmitCreate?: () => void;
};
const columns: DataTableColumn[] = [
    { id: "secret", header: "Secret" },
    { id: "variables", header: "Variables" },
    { id: "attachments", header: "Attachments", width: 200 },
];
/** How many variable-name badges to show before collapsing the rest into "+N". */
const VARIABLE_PREVIEW = 4;
/**
 * C-055 AgentSecretPanel — the administrator surface for Rig-owned secrets: named
 * bundles of environment variables the Rig injects into the agents and channels
 * they are attached to. It lists each secret with its variable names and how many
 * agents and channels carry it, deletes a secret, and authors a new one from an
 * id, a description, and one or more name/value variables. Secret values are
 * write-only: they are sent when creating and never returned, so the list only
 * ever shows variable names. Presentational and fully controlled — data and every
 * mutation flow through props, and there is deliberately no refresh control; the
 * consumer keeps `secrets` live from the realtime stream.
 */
export function AgentSecretPanel(props: AgentSecretPanelProps) {
    const [local, rest] = partitionComponentProps(props, [
        "className",
        "style",
        "title",
        "subtitle",
        "secrets",
        "busySecretIds",
        "loading",
        "error",
        "actionError",
        "onDismissActionError",
        "onSelectSecret",
        "onDeleteSecret",
        "createOpen",
        "draftId",
        "draftDescription",
        "draftVariables",
        "creating",
        "createError",
        "onOpenCreate",
        "onCloseCreate",
        "onDraftIdChange",
        "onDraftDescriptionChange",
        "onDraftVariableChange",
        "onAddDraftVariable",
        "onRemoveDraftVariable",
        "onSubmitCreate",
    ]);
    const title = () => local.title ?? "Agent secrets";
    const busy = (id: string) => local.busySecretIds?.includes(id) ?? false;
    const variables = () => local.draftVariables ?? [];
    const canSubmit = () =>
        !local.creating &&
        Boolean(local.draftId?.trim()) &&
        Boolean(local.draftDescription?.trim()) &&
        variables().some((variable) => variable.name.trim() !== "" && variable.value !== "");
    const rows = local.secrets.map((secret) => {
        const preview = secret.environmentVariables.slice(0, VARIABLE_PREVIEW);
        const overflow = secret.environmentVariables.length - preview.length;
        return {
            id: secret.id,
            onClick: local.onSelectSecret ? () => local.onSelectSecret?.(secret.id) : undefined,
            cells: {
                secret: (
                    <Box className="happy2-agent-secret-panel__secret">
                        <span className="happy2-agent-secret-panel__description">
                            {secret.description}
                        </span>
                        <span className="happy2-agent-secret-panel__id" title={secret.id}>
                            {secret.id}
                        </span>
                    </Box>
                ),
                variables: (
                    <Box className="happy2-agent-secret-panel__variables">
                        {preview.length > 0 ? (
                            <>
                                {preview.map((name) => (
                                    <Badge key={name} label={name} variant="outline" />
                                ))}
                                {overflow > 0 ? (
                                    <span
                                        className="happy2-agent-secret-panel__overflow"
                                        title={secret.environmentVariables.join(", ")}
                                    >
                                        +{overflow}
                                    </span>
                                ) : null}
                            </>
                        ) : (
                            <span className="happy2-agent-secret-panel__none">—</span>
                        )}
                    </Box>
                ),
                attachments: (
                    <Box className="happy2-agent-secret-panel__attachments">
                        <span
                            className="happy2-agent-secret-panel__count"
                            data-happy2-ui="agent-secret-panel-agent-count"
                            title={`Attached to ${secret.agentCount} ${secret.agentCount === 1 ? "agent" : "agents"}`}
                        >
                            <Icon name="agents" size={14} />
                            {secret.agentCount}
                        </span>
                        <span
                            className="happy2-agent-secret-panel__count"
                            data-happy2-ui="agent-secret-panel-channel-count"
                            title={`Attached to ${secret.channelCount} ${secret.channelCount === 1 ? "channel" : "channels"}`}
                        >
                            <Icon name="hash" size={14} />
                            {secret.channelCount}
                        </span>
                    </Box>
                ),
            },
        };
    });
    const rowActions = (row: DataTableRow): ReactNode => {
        if (!local.onDeleteSecret) return null;
        return (
            <Box
                className="happy2-agent-secret-panel__row-actions"
                onClick={(event) => event.stopPropagation()}
            >
                <Button
                    disabled={busy(row.id)}
                    icon="close"
                    onClick={() => local.onDeleteSecret?.(row.id)}
                    size="small"
                    variant="ghost"
                >
                    Delete
                </Button>
            </Box>
        );
    };
    return (
        <Box
            {...rest}
            className={["happy2-agent-secret-panel", local.className].filter(Boolean).join(" ")}
            data-happy2-ui="agent-secret-panel"
            style={local.style}
        >
            <Box className="happy2-agent-secret-panel__header">
                <Box className="happy2-agent-secret-panel__heading">
                    <span className="happy2-agent-secret-panel__title">{title()}</span>
                    {local.subtitle ? (
                        <span className="happy2-agent-secret-panel__subtitle">
                            {local.subtitle}
                        </span>
                    ) : null}
                </Box>
                <Box className="happy2-agent-secret-panel__actions">
                    {local.onOpenCreate ? (
                        <Button icon="plus" onClick={() => local.onOpenCreate?.()} size="small">
                            New secret
                        </Button>
                    ) : null}
                </Box>
            </Box>

            {local.actionError
                ? ((reason) => (
                      <Banner
                          onDismiss={local.onDismissActionError}
                          tone="danger"
                          title="Action failed"
                      >
                          {reason}
                      </Banner>
                  ))(local.actionError)
                : null}

            {!local.error ? (
                !local.loading ? (
                    <DataTable
                        actionsWidth={120}
                        columns={columns}
                        empty={
                            <EmptyState
                                action={
                                    local.onOpenCreate
                                        ? {
                                              icon: "plus",
                                              label: "New secret",
                                              onClick: () => local.onOpenCreate?.(),
                                          }
                                        : undefined
                                }
                                description="Register a secret so the Rig can inject it into agents and channels."
                                icon="shield"
                                size="inline"
                                title="No agent secrets yet"
                            />
                        }
                        rowActions={local.onDeleteSecret ? rowActions : undefined}
                        rows={rows}
                    />
                ) : (
                    <EmptyState
                        description="Loading agent secrets and their attachments."
                        icon="shield"
                        title="Loading agent secrets…"
                    />
                )
            ) : (
                <Banner tone="danger" title="Agent secrets unavailable">
                    {local.error!}
                </Banner>
            )}

            {local.createOpen ? (
                <Box
                    className="happy2-agent-secret-panel__overlay"
                    data-happy2-ui="agent-secret-panel-overlay"
                    onClick={() => local.onCloseCreate?.()}
                >
                    <Box onClick={(event) => event.stopPropagation()}>
                        <Modal
                            footer={
                                <Box className="happy2-agent-secret-panel__modal-actions">
                                    <Button onClick={() => local.onCloseCreate?.()} variant="ghost">
                                        Cancel
                                    </Button>
                                    <Button
                                        disabled={!canSubmit()}
                                        icon="plus"
                                        onClick={() => local.onSubmitCreate?.()}
                                    >
                                        {local.creating ? "Creating…" : "Create secret"}
                                    </Button>
                                </Box>
                            }
                            icon="shield"
                            onClose={() => local.onCloseCreate?.()}
                            size="medium"
                            title="New agent secret"
                        >
                            <Box className="happy2-agent-secret-panel__form">
                                <FormRow
                                    control={
                                        <TextField
                                            fullWidth
                                            onValueChange={(value) =>
                                                local.onDraftIdChange?.(value)
                                            }
                                            placeholder="e.g. service-api"
                                            value={local.draftId ?? ""}
                                        />
                                    }
                                    description="A stable identifier. Letters, numbers, and . _ : - are allowed."
                                    label="Identifier"
                                    layout="stacked"
                                />
                                <FormRow
                                    control={
                                        <TextField
                                            fullWidth
                                            onValueChange={(value) =>
                                                local.onDraftDescriptionChange?.(value)
                                            }
                                            placeholder="e.g. Service API credentials"
                                            value={local.draftDescription ?? ""}
                                        />
                                    }
                                    description="Shown when browsing secrets and picking one to attach."
                                    label="Description"
                                    layout="stacked"
                                />

                                <Box className="happy2-agent-secret-panel__variables-field">
                                    <Box className="happy2-agent-secret-panel__variables-head">
                                        <span className="happy2-agent-secret-panel__variables-label">
                                            Environment variables
                                        </span>
                                        <span className="happy2-agent-secret-panel__variables-note">
                                            Values are sent once and never shown again.
                                        </span>
                                    </Box>
                                    <Box className="happy2-agent-secret-panel__variables-list">
                                        {variables().map((variable, index) => (
                                            <Box
                                                className="happy2-agent-secret-panel__variable-row"
                                                key={index}
                                            >
                                                <TextField
                                                    className="happy2-agent-secret-panel__variable-name"
                                                    onValueChange={(value) =>
                                                        local.onDraftVariableChange?.(
                                                            index,
                                                            "name",
                                                            value,
                                                        )
                                                    }
                                                    placeholder="NAME"
                                                    value={variable.name}
                                                />
                                                <TextField
                                                    className="happy2-agent-secret-panel__variable-value"
                                                    fullWidth
                                                    onValueChange={(value) =>
                                                        local.onDraftVariableChange?.(
                                                            index,
                                                            "value",
                                                            value,
                                                        )
                                                    }
                                                    placeholder="value"
                                                    type="password"
                                                    value={variable.value}
                                                />
                                                <Button
                                                    aria-label="Remove variable"
                                                    disabled={variables().length <= 1}
                                                    icon="close"
                                                    iconOnly
                                                    onClick={() =>
                                                        local.onRemoveDraftVariable?.(index)
                                                    }
                                                    size="small"
                                                    variant="ghost"
                                                />
                                            </Box>
                                        ))}
                                    </Box>
                                    {local.onAddDraftVariable ? (
                                        <Button
                                            className="happy2-agent-secret-panel__add-variable"
                                            icon="plus"
                                            onClick={() => local.onAddDraftVariable?.()}
                                            size="small"
                                            variant="secondary"
                                        >
                                            Add variable
                                        </Button>
                                    ) : null}
                                </Box>

                                {local.createError
                                    ? ((reason) => (
                                          <Banner tone="danger" title="Could not create secret">
                                              {reason}
                                          </Banner>
                                      ))(local.createError)
                                    : null}
                            </Box>
                        </Modal>
                    </Box>
                </Box>
            ) : null}
        </Box>
    );
}
