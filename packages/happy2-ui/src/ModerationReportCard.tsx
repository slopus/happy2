import { splitProps } from "./reactProps";
import { type CSSProperties, type ReactNode } from "react";
import { Avatar, type ToneName } from "./Avatar";
import { Badge, type BadgeVariant } from "./Badge";
import { Icon, type IconName } from "./Icon";
export type ModerationTargetKind = "user" | "chat" | "message" | "file";
export type ModerationStatus = "open" | "reviewing" | "resolved" | "dismissed";
export type ModerationTarget = {
    kind: ModerationTargetKind;
    label: string;
    sub?: string;
};
export type ModerationParty = {
    name: string;
    initials: string;
    tone?: ToneName;
};
export type ModerationReportCardProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    target: ModerationTarget;
    reason: string;
    details?: string;
    status: ModerationStatus;
    reporter?: ModerationParty;
    assignee?: ModerationParty;
    time: string;
    actions?: ReactNode;
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
        "className",
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
            className={["happy2-moderation-report-card", local.className].filter(Boolean).join(" ")}
            data-kind={kind()}
            data-happy2-ui="moderation-report-card"
            data-status={local.status}
            data-testid={local["data-testid"]}
            style={local.style}
        >
            <div
                className="happy2-moderation-report-card__header"
                data-happy2-ui="moderation-report-card-header"
            >
                <span
                    className="happy2-moderation-report-card__kind"
                    data-happy2-ui="moderation-report-card-kind"
                >
                    <Icon name={kindIcons[kind()]} size={16} />
                </span>
                <div
                    className="happy2-moderation-report-card__target"
                    data-happy2-ui="moderation-report-card-target"
                >
                    <span
                        className="happy2-moderation-report-card__target-label"
                        data-happy2-ui="moderation-report-card-target-label"
                    >
                        {local.target.label}
                    </span>
                    {local.target.sub
                        ? ((sub) => (
                              <span
                                  className="happy2-moderation-report-card__target-sub"
                                  data-happy2-ui="moderation-report-card-target-sub"
                              >
                                  {sub}
                              </span>
                          ))(local.target.sub)
                        : null}
                </div>
                <span
                    className="happy2-moderation-report-card__status"
                    data-happy2-ui="moderation-report-card-status"
                >
                    <Badge
                        label={statusLabels[local.status]}
                        variant={statusVariants[local.status]}
                    />
                </span>
            </div>

            <div
                className="happy2-moderation-report-card__reason"
                data-happy2-ui="moderation-report-card-reason"
            >
                <Icon
                    className="happy2-moderation-report-card__reason-icon"
                    name="shield"
                    size={14}
                />
                <span
                    className="happy2-moderation-report-card__reason-text"
                    data-happy2-ui="moderation-report-card-reason-text"
                >
                    {local.reason}
                </span>
            </div>

            {local.details
                ? ((details) => (
                      <p
                          className="happy2-moderation-report-card__details"
                          data-happy2-ui="moderation-report-card-details"
                      >
                          {details}
                      </p>
                  ))(local.details)
                : null}

            <div
                className="happy2-moderation-report-card__meta"
                data-happy2-ui="moderation-report-card-meta"
            >
                {local.reporter
                    ? ((reporter) => (
                          <span
                              className="happy2-moderation-report-card__party"
                              data-happy2-ui="moderation-report-card-party"
                              data-role="reporter"
                          >
                              <span
                                  className="happy2-moderation-report-card__party-caption"
                                  data-happy2-ui="moderation-report-card-party-caption"
                              >
                                  Reported by
                              </span>
                              <Avatar initials={reporter.initials} size="xs" tone={reporter.tone} />
                              <span
                                  className="happy2-moderation-report-card__party-name"
                                  data-happy2-ui="moderation-report-card-party-name"
                              >
                                  {reporter.name}
                              </span>
                          </span>
                      ))(local.reporter)
                    : null}
                {local.assignee
                    ? ((assignee) => (
                          <span
                              className="happy2-moderation-report-card__party"
                              data-happy2-ui="moderation-report-card-party"
                              data-role="assignee"
                          >
                              <span
                                  className="happy2-moderation-report-card__party-caption"
                                  data-happy2-ui="moderation-report-card-party-caption"
                              >
                                  Assigned to
                              </span>
                              <Avatar initials={assignee.initials} size="xs" tone={assignee.tone} />
                              <span
                                  className="happy2-moderation-report-card__party-name"
                                  data-happy2-ui="moderation-report-card-party-name"
                              >
                                  {assignee.name}
                              </span>
                          </span>
                      ))(local.assignee)
                    : null}
                <span
                    className="happy2-moderation-report-card__time"
                    data-happy2-ui="moderation-report-card-time"
                >
                    <Icon
                        className="happy2-moderation-report-card__time-icon"
                        name="clock"
                        size={12}
                    />
                    <span
                        className="happy2-moderation-report-card__time-label"
                        data-happy2-ui="moderation-report-card-time-label"
                    >
                        {local.time}
                    </span>
                </span>
            </div>

            {local.actions
                ? ((actions) => (
                      <footer
                          className="happy2-moderation-report-card__actions"
                          data-happy2-ui="moderation-report-card-actions"
                      >
                          {actions}
                      </footer>
                  ))(local.actions)
                : null}
        </article>
    );
}
