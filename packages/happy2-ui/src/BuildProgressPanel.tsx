import { Show, splitProps } from "solid-js";
import { Badge, type BadgeVariant } from "./Badge";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";

export type BuildProgressStatus = "pending" | "building" | "ready" | "failed";

export type BuildProgressPanelProps = {
    class?: string;
    "data-testid"?: string;
    title: string;
    status: BuildProgressStatus;
    progress: number;
    statusLabel: string;
    currentLogLine?: string;
    log?: string;
    logTruncated?: boolean;
    error?: string;
    retrying?: boolean;
    onRetry?: () => void;
};

type StatusBadge = { variant: BadgeVariant; label: string; icon?: IconName };

const statusBadges: Record<BuildProgressStatus, StatusBadge> = {
    pending: { variant: "neutral", label: "QUEUED" },
    building: { variant: "info", label: "BUILDING" },
    ready: { variant: "success", label: "READY", icon: "check-circle" },
    failed: { variant: "danger", label: "FAILED" },
};

/**
 * C-063 BuildProgressPanel — onboarding-sized live view of one durable agent
 * base-image build. Shows the phase badge, a deterministic progress bar, the
 * current human phase + percent, the latest single log line, a retained
 * scrollable log, and (on failure) the error with a Retry action.
 *
 * Props only, screenshot-deterministic: no state, no timers, no animation. The
 * bar width is driven purely by `progress` (clamped 0..100), and `retrying`
 * shows a static, non-animated ring rather than a spinner.
 */
export function BuildProgressPanel(props: BuildProgressPanelProps) {
    const [local] = splitProps(props, [
        "class",
        "data-testid",
        "title",
        "status",
        "progress",
        "statusLabel",
        "currentLogLine",
        "log",
        "logTruncated",
        "error",
        "retrying",
        "onRetry",
    ]);

    const clamped = () => Math.max(0, Math.min(100, local.progress));
    const pct = () => Math.round(clamped());
    const fillPct = () => (local.status === "ready" ? 100 : pct());
    const badge = () => statusBadges[local.status];

    return (
        <div
            class={["happy2-build-progress", local.class].filter(Boolean).join(" ")}
            data-happy2-ui="build-progress"
            data-status={local.status}
            data-testid={local["data-testid"]}
        >
            <div class="happy2-build-progress__header" data-happy2-ui="build-progress-header">
                <span class="happy2-build-progress__title" data-happy2-ui="build-progress-title">
                    {local.title}
                </span>
                <Badge
                    class="happy2-build-progress__badge"
                    icon={badge().icon}
                    label={badge().label}
                    variant={badge().variant}
                />
            </div>

            <div class="happy2-build-progress__track" data-happy2-ui="build-progress-track">
                <div
                    class="happy2-build-progress__fill"
                    data-happy2-ui="build-progress-fill"
                    style={{ width: `${fillPct()}%` }}
                />
            </div>

            <div
                class="happy2-build-progress__status-line"
                data-happy2-ui="build-progress-status-line"
            >
                <span
                    class="happy2-build-progress__status-label"
                    data-happy2-ui="build-progress-status-label"
                >
                    {local.statusLabel}
                </span>
                <span
                    class="happy2-build-progress__percent"
                    data-happy2-ui="build-progress-percent"
                >
                    {pct()}%
                </span>
            </div>

            <Show when={local.currentLogLine && local.status !== "ready"}>
                <div class="happy2-build-progress__current" data-happy2-ui="build-progress-current">
                    <span
                        class="happy2-build-progress__current-icon"
                        data-happy2-ui="build-progress-current-icon"
                    >
                        <Icon name="terminal" size={12} />
                    </span>
                    <span
                        class="happy2-build-progress__current-text"
                        data-happy2-ui="build-progress-current-text"
                    >
                        {local.currentLogLine}
                    </span>
                </div>
            </Show>

            <Show when={local.log}>
                {(log) => (
                    <div
                        class="happy2-build-progress__log-block"
                        data-happy2-ui="build-progress-log-block"
                    >
                        <Show when={local.logTruncated}>
                            <span
                                class="happy2-build-progress__truncated"
                                data-happy2-ui="build-progress-truncated"
                            >
                                Earlier log truncated
                            </span>
                        </Show>
                        <pre class="happy2-build-progress__log" data-happy2-ui="build-progress-log">
                            {log()}
                        </pre>
                    </div>
                )}
            </Show>

            <Show when={local.status === "failed"}>
                <div class="happy2-build-progress__error" data-happy2-ui="build-progress-error">
                    <Show when={local.error}>
                        <span
                            class="happy2-build-progress__error-text"
                            data-happy2-ui="build-progress-error-text"
                        >
                            {local.error}
                        </span>
                    </Show>
                    <div
                        class="happy2-build-progress__actions"
                        data-happy2-ui="build-progress-actions"
                    >
                        <Show when={local.retrying}>
                            <span
                                class="happy2-build-progress__spinner"
                                data-happy2-ui="build-progress-spinner"
                            />
                        </Show>
                        <Button
                            disabled={local.retrying}
                            onClick={() => local.onRetry?.()}
                            size="medium"
                            variant="secondary"
                        >
                            Retry build
                        </Button>
                    </div>
                </div>
            </Show>
        </div>
    );
}
