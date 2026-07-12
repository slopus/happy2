import { Show, splitProps, type JSX } from "solid-js";
import { Avatar, type ToneName } from "./Avatar";
import { Badge, type BadgeVariant } from "./Badge";
import { Icon, type IconName } from "./Icon";

export type ModerationTargetKind = "user" | "chat" | "message" | "file";
export type ModerationStatus = "open" | "reviewing" | "resolved" | "dismissed";
export type ModerationTarget = { kind: ModerationTargetKind; label: string; sub?: string };
export type ModerationParty = { name: string; initials: string; tone?: ToneName };

export type ModerationReportCardProps = {
    class?: string;
    "data-testid"?: string;
    style?: JSX.CSSProperties;
    target: ModerationTarget;
    reason: string;
    details?: string;
    status: ModerationStatus;
    reporter?: ModerationParty;
    assignee?: ModerationParty;
    time: string;
    actions?: JSX.Element;
};

/* The kind chip glyph reflects what was reported. All are shared, pre-tuned
 * Icon paths (none directional), so the box just centers them at 16px. */
const kindIcons: Record<ModerationTargetKind, IconName> = {
    user: "at",
    chat: "hash",
    message: "chat",
    file: "files",
};

/* Status → Badge variant. Colours come entirely from the Badge tokens: open
 * needs attention (amber), reviewing is in-flight (blue), resolved is done
 * (mint), dismissed is closed-neutral (muted). */
const statusVariants: Record<ModerationStatus, BadgeVariant> = {
    open: "warning",
    reviewing: "info",
    resolved: "success",
    dismissed: "neutral",
};

const statusLabels: Record<ModerationStatus, string> = {
    open: "Open",
    reviewing: "Reviewing",
    resolved: "Resolved",
    dismissed: "Dismissed",
};

/**
 * C-045 ModerationReportCard — one moderation-queue item. A header pairs a kind
 * chip and target descriptor (label + optional sub) with a status badge, an
 * inset reason well states why it was reported, an optional details paragraph
 * elaborates, a meta row credits the reporter/assignee avatars and timestamp,
 * and an optional footer holds the resolution actions.
 */
export function ModerationReportCard(props: ModerationReportCardProps) {
    const [local] = splitProps(props, [
        "class",
        "data-testid",
        "style",
        "target",
        "reason",
        "details",
        "status",
        "reporter",
        "assignee",
        "time",
        "actions",
    ]);
    const kind = () => local.target.kind;

    return (
        <article
            class={["rigged-moderation-report-card", local.class].filter(Boolean).join(" ")}
            data-kind={kind()}
            data-rigged-ui="moderation-report-card"
            data-status={local.status}
            data-testid={local["data-testid"]}
            style={local.style}
        >
            <div
                class="rigged-moderation-report-card__header"
                data-rigged-ui="moderation-report-card-header"
            >
                <span
                    class="rigged-moderation-report-card__kind"
                    data-rigged-ui="moderation-report-card-kind"
                >
                    <Icon name={kindIcons[kind()]} size={16} />
                </span>
                <div
                    class="rigged-moderation-report-card__target"
                    data-rigged-ui="moderation-report-card-target"
                >
                    <span
                        class="rigged-moderation-report-card__target-label"
                        data-rigged-ui="moderation-report-card-target-label"
                    >
                        {local.target.label}
                    </span>
                    <Show when={local.target.sub}>
                        {(sub) => (
                            <span
                                class="rigged-moderation-report-card__target-sub"
                                data-rigged-ui="moderation-report-card-target-sub"
                            >
                                {sub()}
                            </span>
                        )}
                    </Show>
                </div>
                <span
                    class="rigged-moderation-report-card__status"
                    data-rigged-ui="moderation-report-card-status"
                >
                    <Badge
                        label={statusLabels[local.status]}
                        variant={statusVariants[local.status]}
                    />
                </span>
            </div>

            <div
                class="rigged-moderation-report-card__reason"
                data-rigged-ui="moderation-report-card-reason"
            >
                <Icon class="rigged-moderation-report-card__reason-icon" name="shield" size={14} />
                <span
                    class="rigged-moderation-report-card__reason-text"
                    data-rigged-ui="moderation-report-card-reason-text"
                >
                    {local.reason}
                </span>
            </div>

            <Show when={local.details}>
                {(details) => (
                    <p
                        class="rigged-moderation-report-card__details"
                        data-rigged-ui="moderation-report-card-details"
                    >
                        {details()}
                    </p>
                )}
            </Show>

            <div
                class="rigged-moderation-report-card__meta"
                data-rigged-ui="moderation-report-card-meta"
            >
                <Show when={local.reporter}>
                    {(reporter) => (
                        <span
                            class="rigged-moderation-report-card__party"
                            data-rigged-ui="moderation-report-card-party"
                            data-role="reporter"
                        >
                            <span
                                class="rigged-moderation-report-card__party-caption"
                                data-rigged-ui="moderation-report-card-party-caption"
                            >
                                Reported by
                            </span>
                            <Avatar
                                initials={reporter().initials}
                                size="xs"
                                tone={reporter().tone}
                            />
                            <span
                                class="rigged-moderation-report-card__party-name"
                                data-rigged-ui="moderation-report-card-party-name"
                            >
                                {reporter().name}
                            </span>
                        </span>
                    )}
                </Show>
                <Show when={local.assignee}>
                    {(assignee) => (
                        <span
                            class="rigged-moderation-report-card__party"
                            data-rigged-ui="moderation-report-card-party"
                            data-role="assignee"
                        >
                            <span
                                class="rigged-moderation-report-card__party-caption"
                                data-rigged-ui="moderation-report-card-party-caption"
                            >
                                Assigned to
                            </span>
                            <Avatar
                                initials={assignee().initials}
                                size="xs"
                                tone={assignee().tone}
                            />
                            <span
                                class="rigged-moderation-report-card__party-name"
                                data-rigged-ui="moderation-report-card-party-name"
                            >
                                {assignee().name}
                            </span>
                        </span>
                    )}
                </Show>
                <span
                    class="rigged-moderation-report-card__time"
                    data-rigged-ui="moderation-report-card-time"
                >
                    <Icon class="rigged-moderation-report-card__time-icon" name="clock" size={12} />
                    <span
                        class="rigged-moderation-report-card__time-label"
                        data-rigged-ui="moderation-report-card-time-label"
                    >
                        {local.time}
                    </span>
                </span>
            </div>

            <Show when={local.actions}>
                {(actions) => (
                    <footer
                        class="rigged-moderation-report-card__actions"
                        data-rigged-ui="moderation-report-card-actions"
                    >
                        {actions()}
                    </footer>
                )}
            </Show>
        </article>
    );
}
