import { partitionComponentProps } from "./componentProps";
import { useRef, useState, type CSSProperties } from "react";
import { thumbHashToDataURL } from "thumbhash";
import { Badge } from "./Badge";
import { Banner } from "./Banner";
import { Box } from "./Box";
import { Button } from "./Button";
import { FormRow } from "./FormRow";
import { Icon, type IconName } from "./Icon";
import { Modal } from "./Modal";
import {
    PluginPermissionFieldset,
    type PluginPermissionSection,
    type PluginVariableField,
} from "./PluginCatalogPanel";
import { Select, type SelectOption } from "./Select";
import { TextField } from "./TextField";
export type PluginInstallDialogSourceKind = "upload" | "zip_url" | "github";
export type PluginInstallDialogProgress = {
    stage: string;
    detail: string;
    receivedBytes?: number;
    totalBytes?: number;
};
export type PluginInstallDialogCandidate = {
    /** Opaque stable row identity for this verified candidate. */
    id: string;
    displayName: string;
    shortName: string;
    version: string;
    description: string;
    sourceKind: "builtin" | "github" | "upload" | "zip_url";
    /** Normalized source identity: GitHub location, ZIP URL, or upload digest. */
    sourceReference: string;
    skills: readonly { name: string; description: string }[];
    variables: readonly PluginVariableField[];
    apiPermissions?: readonly PluginPermissionSection[];
    mcp?: { type: "remote" | "stdio"; container: "bundled" | "selection_required" | "none" };
    /** Base64 thumbhash of the verified package icon; the PNG itself stays server-side until install. */
    thumbhash?: string;
};
export type PluginInstallDialogStep =
    | { step: "source" }
    | { step: "preparing"; progress?: PluginInstallDialogProgress }
    | { step: "choose"; candidates: readonly PluginInstallDialogCandidate[] }
    | { step: "configure"; candidate: PluginInstallDialogCandidate; candidateCount: number }
    | { step: "installing"; candidate: PluginInstallDialogCandidate }
    | { step: "failed"; error: string; canRetry: boolean };
export type PluginInstallDialogProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    step: PluginInstallDialogStep;
    /** The selected source tab on the source step. */
    sourceKind: PluginInstallDialogSourceKind;
    url: string;
    /** Local URL validation error shown under the URL field. */
    urlError?: string;
    /** The chosen ZIP awaiting preparation. */
    archive?: { name: string; size: number };
    /** Guidance shown on the source step, e.g. after an expired prepared token. */
    notice?: string;
    /** Terminal install failure shown on the configure step. */
    installError?: string;
    /** Draft values keyed by declared variable key; secrets render masked. */
    draftValues?: Readonly<Record<string, string>>;
    /** Ready container images offered when the manifest requires a selection. */
    containerImageOptions?: readonly SelectOption[];
    draftContainerImageId?: string;
    draftPermissions?: readonly string[];
    onSourceKindChange?: (kind: PluginInstallDialogSourceKind) => void;
    onUrlChange?: (value: string) => void;
    onArchiveSelect?: (file: File) => void;
    onArchiveClear?: () => void;
    onPrepare?: () => void;
    onCancelPrepare?: () => void;
    onRetry?: () => void;
    onCandidateChoose?: (id: string) => void;
    onCandidateListReturn?: () => void;
    onDraftValueChange?: (key: string, value: string) => void;
    onDraftContainerImageChange?: (imageId: string) => void;
    onDraftPermissionToggle?: (permissionId: string, checked: boolean) => void;
    onInstall?: () => void;
    onClose?: () => void;
};
const sourceOptions: readonly {
    kind: PluginInstallDialogSourceKind;
    label: string;
    description: string;
    icon: IconName;
}[] = [
    {
        kind: "upload",
        label: "Upload ZIP",
        description: "A plugin package from this computer.",
        icon: "paperclip",
    },
    {
        kind: "zip_url",
        label: "ZIP URL",
        description: "A package downloaded over HTTPS.",
        icon: "link",
    },
    {
        kind: "github",
        label: "GitHub",
        description: "A repository or tree URL.",
        icon: "branch",
    },
];
const sourceKindLabels: Record<PluginInstallDialogCandidate["sourceKind"], string> = {
    builtin: "Built-in",
    github: "GitHub",
    upload: "Uploaded ZIP",
    zip_url: "ZIP URL",
};
/**
 * C-067 PluginInstallDialog — the administrator flow for installing an external
 * plugin package. One modal walks source selection (upload ZIP, ZIP URL, or
 * GitHub), live verified-preparation progress, a keyboard-navigable candidate
 * picker for multi-plugin GitHub repositories, and a verified pre-install
 * preview collecting declared variables (masked secrets) plus an optional ready
 * container-image selection. Presentational and fully controlled — every state
 * and mutation flows through props, and preparation/installation progress is
 * supplied live by the consumer rather than fetched here.
 */
export function PluginInstallDialog(props: PluginInstallDialogProps) {
    const [local, rest] = partitionComponentProps(props, [
        "className",
        "style",
        "step",
        "sourceKind",
        "url",
        "urlError",
        "archive",
        "notice",
        "installError",
        "draftValues",
        "containerImageOptions",
        "draftContainerImageId",
        "draftPermissions",
        "onSourceKindChange",
        "onUrlChange",
        "onArchiveSelect",
        "onArchiveClear",
        "onPrepare",
        "onCancelPrepare",
        "onRetry",
        "onCandidateChoose",
        "onCandidateListReturn",
        "onDraftValueChange",
        "onDraftContainerImageChange",
        "onDraftPermissionToggle",
        "onInstall",
        "onClose",
    ]);
    const step = local.step;
    return (
        <Modal
            {...rest}
            className={["happy2-plugin-install-dialog", local.className].filter(Boolean).join(" ")}
            footer={<Footer {...local} />}
            icon="braces"
            onClose={step.step === "installing" ? undefined : local.onClose}
            size="medium"
            title={
                step.step === "choose"
                    ? "Choose a plugin"
                    : step.step === "configure" || step.step === "installing"
                      ? `Install ${step.candidate.displayName}`
                      : "Install plugin"
            }
        >
            <Box className="happy2-plugin-install-dialog__body" data-testid="plugin-install-body">
                {step.step === "source" ? <SourceStep {...local} /> : null}
                {step.step === "preparing" ? <PreparingStep progress={step.progress} /> : null}
                {step.step === "choose" ? (
                    <CandidateStep
                        candidates={step.candidates}
                        onCandidateChoose={local.onCandidateChoose}
                    />
                ) : null}
                {step.step === "configure" || step.step === "installing" ? (
                    <ConfigureStep
                        candidate={step.candidate}
                        containerImageOptions={local.containerImageOptions}
                        draftContainerImageId={local.draftContainerImageId}
                        draftPermissions={local.draftPermissions}
                        draftValues={local.draftValues}
                        installError={local.installError}
                        installing={step.step === "installing"}
                        onDraftContainerImageChange={local.onDraftContainerImageChange}
                        onDraftPermissionToggle={local.onDraftPermissionToggle}
                        onDraftValueChange={local.onDraftValueChange}
                    />
                ) : null}
                {step.step === "failed" ? (
                    <Banner
                        data-testid="plugin-install-failure"
                        tone="danger"
                        title="Preparation failed"
                    >
                        {step.error}
                    </Banner>
                ) : null}
            </Box>
        </Modal>
    );
}
type LocalProps = Pick<
    PluginInstallDialogProps,
    | "step"
    | "sourceKind"
    | "url"
    | "urlError"
    | "archive"
    | "notice"
    | "installError"
    | "draftValues"
    | "containerImageOptions"
    | "draftContainerImageId"
    | "draftPermissions"
    | "onSourceKindChange"
    | "onUrlChange"
    | "onArchiveSelect"
    | "onArchiveClear"
    | "onPrepare"
    | "onCancelPrepare"
    | "onRetry"
    | "onCandidateChoose"
    | "onCandidateListReturn"
    | "onDraftValueChange"
    | "onDraftContainerImageChange"
    | "onDraftPermissionToggle"
    | "onInstall"
    | "onClose"
>;
function Footer(props: LocalProps) {
    const step = props.step;
    const cancel = (
        <Button
            disabled={step.step === "installing"}
            onClick={() => props.onClose?.()}
            variant="ghost"
        >
            Cancel
        </Button>
    );
    if (step.step === "source")
        return (
            <Box className="happy2-plugin-install-dialog__actions">
                {cancel}
                <Button
                    data-testid="plugin-install-prepare"
                    disabled={
                        props.sourceKind === "upload" ? !props.archive : props.url.trim() === ""
                    }
                    icon="arrow-right"
                    onClick={() => props.onPrepare?.()}
                >
                    Prepare
                </Button>
            </Box>
        );
    if (step.step === "preparing")
        return (
            <Box className="happy2-plugin-install-dialog__actions">
                <Button
                    data-testid="plugin-install-cancel-prepare"
                    onClick={() => props.onCancelPrepare?.()}
                    variant="ghost"
                >
                    Cancel preparation
                </Button>
            </Box>
        );
    if (step.step === "choose")
        return <Box className="happy2-plugin-install-dialog__actions">{cancel}</Box>;
    if (step.step === "failed")
        return (
            <Box className="happy2-plugin-install-dialog__actions">
                {cancel}
                {step.canRetry ? (
                    <Button
                        data-testid="plugin-install-retry"
                        icon="arrow-right"
                        onClick={() => props.onRetry?.()}
                    >
                        Retry
                    </Button>
                ) : null}
            </Box>
        );
    const candidate = step.candidate;
    const values = props.draftValues ?? {};
    const selectionRequired = candidate.mcp?.container === "selection_required";
    const complete =
        candidate.variables.every((variable) => (values[variable.key] ?? "") !== "") &&
        (!selectionRequired || Boolean(props.draftContainerImageId));
    return (
        <Box className="happy2-plugin-install-dialog__actions">
            {step.step === "configure" && step.candidateCount > 1 ? (
                <Button
                    data-testid="plugin-install-back"
                    onClick={() => props.onCandidateListReturn?.()}
                    variant="ghost"
                >
                    Back
                </Button>
            ) : null}
            {cancel}
            <Button
                data-testid="plugin-install-submit"
                disabled={step.step === "installing" || !complete}
                icon="plus"
                onClick={() => props.onInstall?.()}
            >
                {step.step === "installing" ? "Installing…" : "Install plugin"}
            </Button>
        </Box>
    );
}
function SourceStep(props: LocalProps) {
    const fileInput = useRef<HTMLInputElement>(null);
    return (
        <Box className="happy2-plugin-install-dialog__source">
            {props.notice ? (
                <Banner data-testid="plugin-install-notice" tone="warning" title="Prepare again">
                    {props.notice}
                </Banner>
            ) : null}
            <Box
                aria-label="Plugin source"
                className="happy2-plugin-install-dialog__source-options"
                data-testid="plugin-install-sources"
                role="radiogroup"
            >
                {sourceOptions.map((option, index) => (
                    <button
                        aria-checked={props.sourceKind === option.kind}
                        className="happy2-plugin-install-dialog__source-option"
                        data-happy2-ui="plugin-install-source-option"
                        data-source-kind={option.kind}
                        key={option.kind}
                        onClick={() => props.onSourceKindChange?.(option.kind)}
                        onKeyDown={(event) => {
                            const delta =
                                event.key === "ArrowRight" || event.key === "ArrowDown"
                                    ? 1
                                    : event.key === "ArrowLeft" || event.key === "ArrowUp"
                                      ? -1
                                      : 0;
                            if (!delta) return;
                            event.preventDefault();
                            const next =
                                sourceOptions[
                                    (index + delta + sourceOptions.length) % sourceOptions.length
                                ]!;
                            props.onSourceKindChange?.(next.kind);
                            const parent = event.currentTarget.parentElement;
                            const target = parent?.querySelector<HTMLButtonElement>(
                                `[data-source-kind="${next.kind}"]`,
                            );
                            target?.focus();
                        }}
                        role="radio"
                        tabIndex={props.sourceKind === option.kind ? 0 : -1}
                        type="button"
                    >
                        <Icon name={option.icon} size={16} />
                        <span className="happy2-plugin-install-dialog__source-label">
                            {option.label}
                        </span>
                        <span className="happy2-plugin-install-dialog__source-description">
                            {option.description}
                        </span>
                    </button>
                ))}
            </Box>
            {props.sourceKind === "upload" ? (
                <Box className="happy2-plugin-install-dialog__upload">
                    <input
                        accept=".zip,application/zip"
                        data-testid="plugin-install-file-input"
                        hidden
                        onChange={(event) => {
                            const file = event.currentTarget.files?.[0];
                            event.currentTarget.value = "";
                            if (file) props.onArchiveSelect?.(file);
                        }}
                        ref={fileInput}
                        type="file"
                    />
                    {props.archive ? (
                        <Box
                            className="happy2-plugin-install-dialog__archive"
                            data-testid="plugin-install-archive"
                        >
                            <Icon name="doc" size={16} />
                            <span className="happy2-plugin-install-dialog__archive-name">
                                {props.archive.name}
                            </span>
                            <span className="happy2-plugin-install-dialog__archive-size">
                                {formatBytes(props.archive.size)}
                            </span>
                            <Button
                                aria-label="Remove selected ZIP"
                                icon="close"
                                iconOnly
                                onClick={() => props.onArchiveClear?.()}
                                size="small"
                                variant="ghost"
                            />
                        </Box>
                    ) : (
                        <Button
                            data-testid="plugin-install-choose-file"
                            icon="paperclip"
                            onClick={() => fileInput.current?.click()}
                            variant="secondary"
                        >
                            Choose ZIP…
                        </Button>
                    )}
                    <span className="happy2-plugin-install-dialog__hint">
                        One plugin package per ZIP, up to 50 MiB.
                    </span>
                </Box>
            ) : (
                <TextField
                    error={props.urlError}
                    fullWidth
                    label={props.sourceKind === "github" ? "Repository URL" : "Package URL"}
                    onValueChange={(value) => props.onUrlChange?.(value)}
                    placeholder={
                        props.sourceKind === "github"
                            ? "https://github.com/owner/repository"
                            : "https://example.com/plugin.zip"
                    }
                    value={props.url}
                />
            )}
        </Box>
    );
}
function PreparingStep(props: { progress?: PluginInstallDialogProgress }) {
    const total = props.progress?.totalBytes;
    const received = props.progress?.receivedBytes;
    const percent =
        total && received !== undefined
            ? Math.max(0, Math.min(100, Math.round((received / total) * 100)))
            : undefined;
    return (
        <Box
            className="happy2-plugin-install-dialog__preparing"
            data-testid="plugin-install-preparing"
        >
            <span className="happy2-plugin-install-dialog__stage">
                {stageLabel(props.progress?.stage)}
            </span>
            <Box
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={percent}
                className="happy2-plugin-install-dialog__progress"
                data-testid="plugin-install-progress"
                role="progressbar"
            >
                <span
                    className="happy2-plugin-install-dialog__progress-fill"
                    data-indeterminate={percent === undefined ? "true" : undefined}
                    style={{ width: `${percent ?? 100}%` }}
                />
            </Box>
            <span className="happy2-plugin-install-dialog__detail">
                {props.progress
                    ? `${props.progress.detail}${
                          received !== undefined
                              ? ` · ${formatBytes(received)}${total ? ` of ${formatBytes(total)}` : ""}`
                              : ""
                      }`
                    : "Contacting the server…"}
            </span>
        </Box>
    );
}
function CandidateStep(props: {
    candidates: readonly PluginInstallDialogCandidate[];
    onCandidateChoose?: (id: string) => void;
}) {
    const [activeIndex, setActiveIndex] = useState(0);
    return (
        <Box className="happy2-plugin-install-dialog__choose">
            <span className="happy2-plugin-install-dialog__hint">
                This repository contains several verified plugins. Choose one to continue.
            </span>
            <Box
                aria-label="Verified plugins"
                className="happy2-plugin-install-dialog__candidates"
                data-testid="plugin-install-candidates"
                role="listbox"
            >
                {props.candidates.map((candidate, index) => (
                    <button
                        aria-selected={index === activeIndex}
                        className="happy2-plugin-install-dialog__candidate"
                        data-candidate-id={candidate.id}
                        data-happy2-ui="plugin-install-candidate"
                        key={candidate.id}
                        onClick={() => {
                            setActiveIndex(index);
                            props.onCandidateChoose?.(candidate.id);
                        }}
                        onFocus={() => setActiveIndex(index)}
                        onKeyDown={(event) => {
                            const delta =
                                event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
                            if (delta) {
                                event.preventDefault();
                                const next =
                                    (index + delta + props.candidates.length) %
                                    props.candidates.length;
                                setActiveIndex(next);
                                const parent = event.currentTarget.parentElement;
                                parent
                                    ?.querySelector<HTMLButtonElement>(
                                        `[data-candidate-id="${props.candidates[next]!.id}"]`,
                                    )
                                    ?.focus();
                                return;
                            }
                            if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                props.onCandidateChoose?.(candidate.id);
                            }
                        }}
                        role="option"
                        tabIndex={index === activeIndex ? 0 : -1}
                        type="button"
                    >
                        <PluginThumb candidate={candidate} size={32} />
                        <Box className="happy2-plugin-install-dialog__candidate-body">
                            <Box className="happy2-plugin-install-dialog__candidate-name-row">
                                <span className="happy2-plugin-install-dialog__candidate-name">
                                    {candidate.displayName}
                                </span>
                                <span className="happy2-plugin-install-dialog__mono">
                                    v{candidate.version}
                                </span>
                            </Box>
                            <span className="happy2-plugin-install-dialog__candidate-description">
                                {candidate.description}
                            </span>
                        </Box>
                        {candidate.skills.length > 0 ? (
                            <Badge
                                label={
                                    candidate.skills.length === 1
                                        ? "1 skill"
                                        : `${candidate.skills.length} skills`
                                }
                                variant="outline"
                            />
                        ) : null}
                    </button>
                ))}
            </Box>
        </Box>
    );
}
function ConfigureStep(props: {
    candidate: PluginInstallDialogCandidate;
    installing: boolean;
    installError?: string;
    draftValues?: Readonly<Record<string, string>>;
    containerImageOptions?: readonly SelectOption[];
    draftContainerImageId?: string;
    draftPermissions?: readonly string[];
    onDraftValueChange?: (key: string, value: string) => void;
    onDraftContainerImageChange?: (imageId: string) => void;
    onDraftPermissionToggle?: (permissionId: string, checked: boolean) => void;
}) {
    const candidate = props.candidate;
    const values = props.draftValues ?? {};
    const selectionRequired = candidate.mcp?.container === "selection_required";
    return (
        <Box
            className="happy2-plugin-install-dialog__configure"
            data-testid="plugin-install-preview"
        >
            {props.installError ? (
                <Banner data-testid="plugin-install-error" tone="danger" title="Install failed">
                    {props.installError}
                </Banner>
            ) : null}
            <Box className="happy2-plugin-install-dialog__preview-header">
                <PluginThumb candidate={candidate} size={40} />
                <Box className="happy2-plugin-install-dialog__preview-heading">
                    <Box className="happy2-plugin-install-dialog__candidate-name-row">
                        <span
                            className="happy2-plugin-install-dialog__preview-name"
                            data-happy2-ui="plugin-install-preview-name"
                        >
                            {candidate.displayName}
                        </span>
                        <span className="happy2-plugin-install-dialog__mono">
                            v{candidate.version}
                        </span>
                        <Badge label={sourceKindLabels[candidate.sourceKind]} variant="outline" />
                    </Box>
                    <span
                        className="happy2-plugin-install-dialog__preview-reference"
                        title={candidate.sourceReference}
                    >
                        {candidate.sourceReference}
                    </span>
                </Box>
            </Box>
            <span className="happy2-plugin-install-dialog__preview-description">
                {candidate.description}
            </span>
            {candidate.mcp ? (
                <Box className="happy2-plugin-install-dialog__capabilities">
                    <Badge label={`MCP · ${candidate.mcp.type}`} variant="outline" />
                    <Badge
                        label={
                            candidate.mcp.container === "bundled"
                                ? "Bundled container"
                                : candidate.mcp.container === "selection_required"
                                  ? "Container image required"
                                  : "No container"
                        }
                        variant="outline"
                    />
                </Box>
            ) : null}
            {candidate.skills.length > 0 ? (
                <Box
                    className="happy2-plugin-install-dialog__skills"
                    data-testid="plugin-install-skills"
                >
                    <span className="happy2-plugin-install-dialog__section-title">Skills</span>
                    {candidate.skills.map((skill) => (
                        <Box className="happy2-plugin-install-dialog__skill" key={skill.name}>
                            <span className="happy2-plugin-install-dialog__skill-name">
                                {skill.name}
                            </span>
                            <span className="happy2-plugin-install-dialog__skill-description">
                                {skill.description}
                            </span>
                        </Box>
                    ))}
                </Box>
            ) : null}
            {candidate.variables.length > 0 || selectionRequired ? (
                <Box className="happy2-plugin-install-dialog__form">
                    {candidate.variables.map((variable) => (
                        <FormRow
                            control={
                                <TextField
                                    disabled={props.installing}
                                    fullWidth
                                    onValueChange={(value) =>
                                        props.onDraftValueChange?.(variable.key, value)
                                    }
                                    placeholder={variable.key}
                                    type={variable.kind === "secret" ? "password" : "text"}
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
                                    disabled={props.installing}
                                    fullWidth
                                    onValueChange={(value) =>
                                        props.onDraftContainerImageChange?.(value)
                                    }
                                    options={[...(props.containerImageOptions ?? [])]}
                                    placeholder="Choose a ready image"
                                    value={props.draftContainerImageId}
                                />
                            }
                            description="This stdio plugin runs inside a dedicated container created from a ready agent image."
                            label="Container image"
                            layout="stacked"
                        />
                    ) : null}
                </Box>
            ) : (candidate.apiPermissions?.length ?? 0) === 0 ? (
                <span className="happy2-plugin-install-dialog__hint">
                    This package needs no configuration. Installing it creates a new independent
                    installation.
                </span>
            ) : null}
            {(candidate.apiPermissions?.length ?? 0) > 0 ? (
                <Box className="happy2-plugin-catalog-panel__permission-block">
                    <span className="happy2-plugin-catalog-panel__permission-heading">
                        Permissions
                    </span>
                    <span className="happy2-plugin-catalog-panel__permission-intro">
                        Grant only the host capabilities this installation needs. Every permission
                        is optional.
                    </span>
                    <PluginPermissionFieldset
                        disabled={props.installing}
                        onToggle={props.onDraftPermissionToggle}
                        sections={candidate.apiPermissions ?? []}
                        selected={props.draftPermissions ?? []}
                    />
                </Box>
            ) : null}
        </Box>
    );
}
function PluginThumb(props: { candidate: PluginInstallDialogCandidate; size: 32 | 40 }) {
    const dataUrl = thumbhashDataUrl(props.candidate.thumbhash);
    return (
        <span
            className="happy2-plugin-install-dialog__thumb"
            data-happy2-ui="plugin-install-thumb"
            style={{ width: `${props.size}px`, height: `${props.size}px` }}
        >
            {dataUrl ? (
                <img
                    alt=""
                    className="happy2-plugin-install-dialog__thumb-image"
                    draggable={false}
                    src={dataUrl}
                />
            ) : (
                <Icon name="braces" size={16} />
            )}
        </span>
    );
}
function thumbhashDataUrl(hash?: string): string | undefined {
    if (!hash) return undefined;
    try {
        const bytes = Uint8Array.from(atob(hash), (character) => character.codePointAt(0)!);
        return thumbHashToDataURL(bytes);
    } catch {
        return undefined;
    }
}
function stageLabel(stage?: string): string {
    if (stage === "downloading") return "Downloading package";
    if (stage === "verifying") return "Verifying package";
    if (stage === "prepared") return "Package prepared";
    return "Preparing package";
}
function formatBytes(size: number): string {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KiB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MiB`;
}
