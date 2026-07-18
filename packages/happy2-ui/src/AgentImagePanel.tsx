import { splitProps } from "./reactProps";
import { type CSSProperties, type ReactNode } from "react";
import { Badge, type BadgeVariant } from "./Badge";
import { Banner } from "./Banner";
import { Box } from "./Box";
import { Button } from "./Button";
import { DataTable, type DataTableColumn, type DataTableRow } from "./DataTable";
import { EmptyState } from "./EmptyState";
import { FormRow } from "./FormRow";
import { Modal } from "./Modal";
import { TextField } from "./TextField";
export type AgentImageStatus = "pending" | "building" | "ready" | "failed";
export type AgentImageItem = {
    id: string;
    name: string;
    status: AgentImageStatus;
    /** Marks a server-provided base image the admin did not author. */
    builtin?: boolean;
    /** The image currently used for new agents. */
    isDefault?: boolean;
    /** Pre-formatted "last updated" label. */
    updatedLabel?: string;
    /** Best-effort build completion percentage (0–100); shown while building. */
    progress?: number;
    /** The most recent build-log line, shown under the name while building. */
    lastLogLine?: string;
    /** Latest build failure message, shown under the name for failed images. */
    error?: string;
};
export type AgentImagePanelProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    title?: string;
    subtitle?: string;
    images: AgentImageItem[];
    /** Ids with an in-flight build/promote request; their row actions disable. */
    busyImageIds?: readonly string[];
    /** First load has not resolved yet. */
    loading?: boolean;
    /** Fatal load error; replaces the table with a banner. */
    error?: string;
    /** Transient action error, shown as a dismissible banner above the table. */
    actionError?: string;
    onDismissActionError?: () => void;
    /** Opens the image's detail (Dockerfile + build log) — the row click. */
    onSelectImage?: (id: string) => void;
    onBuildImage?: (id: string) => void;
    onSetDefaultImage?: (id: string) => void;
    /* Create dialog — controlled, like TextField/Select. */
    createOpen?: boolean;
    draftName?: string;
    draftDockerfile?: string;
    creating?: boolean;
    createError?: string;
    onOpenCreate?: () => void;
    onCloseCreate?: () => void;
    onDraftNameChange?: (value: string) => void;
    onDraftDockerfileChange?: (value: string) => void;
    onSubmitCreate?: () => void;
};
const columns: DataTableColumn[] = [
    { id: "name", header: "Image" },
    { id: "status", header: "Status", width: 150 },
    { id: "default", header: "Default", width: 120 },
    { id: "updated", header: "Updated", align: "end", width: 180 },
];
const statusVariant: Record<AgentImageStatus, BadgeVariant> = {
    pending: "info",
    building: "warning",
    ready: "success",
    failed: "danger",
};
const statusLabel: Record<AgentImageStatus, string> = {
    pending: "Pending",
    building: "Building",
    ready: "Ready",
    failed: "Failed",
};
const dockerfilePlaceholder = "FROM happy2/agent-base:latest\n# Add the tools your agents need…";
function progressValue(value: number | undefined): number {
    return Math.max(0, Math.min(100, Math.round(value ?? 0)));
}
/**
 * C-050 AgentImagePanel — the administrator surface for the immutable container
 * images every server-owned agent runs inside. It lists each image with its
 * asynchronous build status, promotes a ready image to the default used for new
 * agents, retries pending or failed builds, and authors a new image from a
 * Dockerfile. Presentational and fully controlled: data and every mutation flow
 * through props, so a consuming app owns loading, errors, and persistence. There
 * is deliberately no refresh control — the consumer keeps `images` live from the
 * realtime stream so asynchronous build-status changes appear on their own.
 */
export function AgentImagePanel(props: AgentImagePanelProps) {
    const [local, rest] = splitProps(props, [
        "className",
        "style",
        "title",
        "subtitle",
        "images",
        "busyImageIds",
        "loading",
        "error",
        "actionError",
        "onDismissActionError",
        "onSelectImage",
        "onBuildImage",
        "onSetDefaultImage",
        "createOpen",
        "draftName",
        "draftDockerfile",
        "creating",
        "createError",
        "onOpenCreate",
        "onCloseCreate",
        "onDraftNameChange",
        "onDraftDockerfileChange",
        "onSubmitCreate",
    ]);
    const title = () => local.title ?? "Agent images";
    const busy = (id: string) => local.busyImageIds?.includes(id) ?? false;
    const canSubmit = () =>
        !local.creating &&
        Boolean(local.draftName?.trim()) &&
        Boolean(local.draftDockerfile?.trim());
    const rows = local.images.map((image) => {
        const subline = image.status === "failed" ? image.error : image.lastLogLine;
        return {
            id: image.id,
            onClick: local.onSelectImage ? () => local.onSelectImage?.(image.id) : undefined,
            cells: {
                name: (
                    <Box className="happy2-agent-image-panel__name">
                        <Box className="happy2-agent-image-panel__name-head">
                            <span className="happy2-agent-image-panel__name-text">
                                {image.name}
                            </span>
                            {image.builtin ? <Badge label="Built-in" variant="outline" /> : null}
                        </Box>
                        {subline
                            ? ((line) => (
                                  <span
                                      className="happy2-agent-image-panel__subline"
                                      data-tone={image.status === "failed" ? "danger" : "muted"}
                                      title={line}
                                  >
                                      {line}
                                  </span>
                              ))(subline)
                            : null}
                    </Box>
                ),
                status: (
                    <Box className="happy2-agent-image-panel__status">
                        <Badge
                            label={statusLabel[image.status]}
                            variant={statusVariant[image.status]}
                        />
                        {image.status === "building" ? (
                            <Box
                                aria-valuemax={100}
                                aria-valuemin={0}
                                aria-valuenow={progressValue(image.progress)}
                                className="happy2-agent-image-panel__progress"
                                role="progressbar"
                            >
                                <span className="happy2-agent-image-panel__progress-track">
                                    <span
                                        className="happy2-agent-image-panel__progress-fill"
                                        style={{ width: `${progressValue(image.progress)}%` }}
                                    />
                                </span>
                                <span className="happy2-agent-image-panel__progress-value">
                                    {progressValue(image.progress)}%
                                </span>
                            </Box>
                        ) : null}
                    </Box>
                ),
                default: image.isDefault ? (
                    <Badge icon="check" label="Default" variant="accent" />
                ) : (
                    "—"
                ),
                updated: image.updatedLabel ?? "—",
            },
        };
    });
    const rowActions = (row: DataTableRow): ReactNode => {
        const image = local.images.find((item) => item.id === row.id);
        if (!image) return null;
        const buildable = image.status === "pending" || image.status === "failed";
        const promotable = image.status === "ready" && !image.isDefault;
        return (
            <Box
                className="happy2-agent-image-panel__row-actions"
                onClick={(event) => event.stopPropagation()}
            >
                {buildable && local.onBuildImage ? (
                    <Button
                        disabled={busy(image.id)}
                        icon="play"
                        onClick={() => local.onBuildImage?.(image.id)}
                        size="small"
                        variant="secondary"
                    >
                        {image.status === "failed" ? "Retry build" : "Build"}
                    </Button>
                ) : null}
                {promotable && local.onSetDefaultImage ? (
                    <Button
                        disabled={busy(image.id)}
                        icon="check"
                        onClick={() => local.onSetDefaultImage?.(image.id)}
                        size="small"
                        variant="ghost"
                    >
                        Make default
                    </Button>
                ) : null}
            </Box>
        );
    };
    return (
        <Box
            {...rest}
            className={["happy2-agent-image-panel", local.className].filter(Boolean).join(" ")}
            data-happy2-ui="agent-image-panel"
            style={local.style}
        >
            <Box className="happy2-agent-image-panel__header">
                <Box className="happy2-agent-image-panel__heading">
                    <span className="happy2-agent-image-panel__title">{title()}</span>
                    {local.subtitle ? (
                        <span className="happy2-agent-image-panel__subtitle">{local.subtitle}</span>
                    ) : null}
                </Box>
                <Box className="happy2-agent-image-panel__actions">
                    {local.onOpenCreate ? (
                        <Button icon="plus" onClick={() => local.onOpenCreate?.()} size="small">
                            New image
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
                        actionsWidth={220}
                        columns={columns}
                        empty={
                            <EmptyState
                                action={
                                    local.onOpenCreate
                                        ? {
                                              icon: "plus",
                                              label: "New image",
                                              onClick: () => local.onOpenCreate?.(),
                                          }
                                        : undefined
                                }
                                description="Author an image so administrators can create agents."
                                icon="spark"
                                size="inline"
                                title="No agent images yet"
                            />
                        }
                        rowActions={rowActions}
                        rows={rows}
                    />
                ) : (
                    <EmptyState
                        description="Loading agent images and their build status."
                        icon="spark"
                        title="Loading agent images…"
                    />
                )
            ) : (
                <Banner tone="danger" title="Agent images unavailable">
                    {local.error!}
                </Banner>
            )}

            {local.createOpen ? (
                <Box
                    className="happy2-agent-image-panel__overlay"
                    data-happy2-ui="agent-image-panel-overlay"
                    onClick={() => local.onCloseCreate?.()}
                >
                    <Box onClick={(event) => event.stopPropagation()}>
                        <Modal
                            footer={
                                <Box className="happy2-agent-image-panel__modal-actions">
                                    <Button onClick={() => local.onCloseCreate?.()} variant="ghost">
                                        Cancel
                                    </Button>
                                    <Button
                                        disabled={!canSubmit()}
                                        icon="plus"
                                        onClick={() => local.onSubmitCreate?.()}
                                    >
                                        {local.creating ? "Creating…" : "Create image"}
                                    </Button>
                                </Box>
                            }
                            icon="spark"
                            onClose={() => local.onCloseCreate?.()}
                            size="medium"
                            title="New agent image"
                        >
                            <Box className="happy2-agent-image-panel__form">
                                <FormRow
                                    control={
                                        <TextField
                                            fullWidth
                                            onValueChange={(value) =>
                                                local.onDraftNameChange?.(value)
                                            }
                                            placeholder="e.g. Python + Node toolchain"
                                            value={local.draftName ?? ""}
                                        />
                                    }
                                    description="Shown when picking an image for a new agent."
                                    label="Name"
                                    layout="stacked"
                                />
                                <FormRow
                                    control={
                                        <TextField
                                            fullWidth
                                            multiline
                                            onValueChange={(value) =>
                                                local.onDraftDockerfileChange?.(value)
                                            }
                                            placeholder={dockerfilePlaceholder}
                                            rows={10}
                                            value={local.draftDockerfile ?? ""}
                                        />
                                    }
                                    description="The build starts automatically once the image is created."
                                    label="Dockerfile"
                                    layout="stacked"
                                />
                                {local.createError
                                    ? ((reason) => (
                                          <Banner tone="danger" title="Could not create image">
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
