import { splitProps } from "./reactProps";
import { type CSSProperties, type HTMLAttributes, type ReactNode } from "react";
import { Avatar, type ToneName } from "./Avatar";
import { Badge, type BadgeVariant } from "./Badge";
import { Button, type ButtonVariant } from "./Button";
import { Icon } from "./Icon";
export type AgentRunStatus = "queued" | "working" | "review" | "complete";
export type AgentRunStep = {
    label: string;
    status: "done" | "working" | "pending";
};
export type AgentRun = {
    agent: string;
    branch?: string;
    initials: string;
    /** 0..100, drives the working progress bar. */
    progress?: number;
    stats?: {
        added?: number;
        files?: number;
        note?: string;
        removed?: number;
        steps?: number;
    };
    status: AgentRunStatus;
    steps: AgentRunStep[];
    title: string;
    tone?: ToneName;
};
export type AgentRunAction = {
    id: string;
    label: string;
    variant?: ButtonVariant;
};
export type AgentRunCardProps = Omit<HTMLAttributes<HTMLElement>, "style"> & {
    actions?: AgentRunAction[];
    /** Diff snippet slot, rendered when expanded. */
    children?: ReactNode;
    expanded: boolean;
    onAction?: (id: string) => void;
    onExpandedChange: (expanded: boolean) => void;
    run: AgentRun;
    style?: CSSProperties;
};
const statusBadges: Record<
    AgentRunStatus,
    {
        label: string;
        variant: BadgeVariant;
    }
> = {
    complete: { label: "COMPLETED", variant: "success" },
    queued: { label: "QUEUED", variant: "neutral" },
    review: { label: "NEEDS REVIEW", variant: "success" },
    working: { label: "RUNNING", variant: "warning" },
};
function clampProgress(progress: number | undefined) {
    return Math.min(100, Math.max(0, progress ?? 0));
}
/** The hero card of the product: an agent run with status, diffstat, and steps. */
export function AgentRunCard(props: AgentRunCardProps) {
    const [local, rest] = splitProps(props, [
        "actions",
        "children",
        "className",
        "expanded",
        "onAction",
        "onExpandedChange",
        "run",
        "style",
    ]);
    const badge = () => statusBadges[local.run.status];
    const detail = () => {
        const stats = local.run.stats;
        if (!stats) return "";
        return [
            stats.files === undefined ? undefined : `${stats.files} files`,
            stats.steps === undefined ? undefined : `${stats.steps} steps`,
            stats.note,
        ]
            .filter(Boolean)
            .join(" · ");
    };
    return (
        <article
            {...rest}
            className={["happy2-agent-run-card", local.className].filter(Boolean).join(" ")}
            data-expanded={local.expanded ? "" : undefined}
            data-happy2-ui="agent-run-card"
            data-status={local.run.status}
            style={local.style}
        >
            {local.run.status === "working" ? (
                <div
                    aria-valuemax={100}
                    aria-valuemin={0}
                    aria-valuenow={clampProgress(local.run.progress)}
                    className="happy2-agent-run-card__progress"
                    data-happy2-ui="agent-run-card-progress"
                    role="progressbar"
                >
                    <div
                        className="happy2-agent-run-card__progress-fill"
                        data-happy2-ui="agent-run-card-progress-fill"
                        style={{ width: `${clampProgress(local.run.progress)}%` }}
                    />
                </div>
            ) : null}
            <header
                className="happy2-agent-run-card__header"
                data-happy2-ui="agent-run-card-header"
            >
                <Avatar
                    initials={local.run.initials}
                    size="sm"
                    tone={local.run.tone}
                    type="agent"
                />
                <span className="happy2-agent-run-card__name" data-happy2-ui="agent-run-card-name">
                    <span
                        className="happy2-agent-run-card__agent"
                        data-happy2-ui="agent-run-card-agent"
                    >
                        {local.run.agent}
                    </span>
                    <span
                        className="happy2-agent-run-card__kind"
                        data-happy2-ui="agent-run-card-kind"
                    >
                        · run
                    </span>
                </span>
                {local.run.status === "complete" ? (
                    <span
                        aria-hidden="true"
                        className="happy2-agent-run-card__check"
                        data-happy2-ui="agent-run-card-check"
                    >
                        <Icon name="check-circle" size={16} />
                    </span>
                ) : null}
                <Badge label={badge().label} variant={badge().variant} />
                <button
                    aria-expanded={local.expanded ? "true" : "false"}
                    aria-label={local.expanded ? "Collapse run details" : "Expand run details"}
                    className="happy2-agent-run-card__toggle"
                    data-happy2-ui="agent-run-card-toggle"
                    onClick={() => local.onExpandedChange(!local.expanded)}
                    type="button"
                >
                    <span
                        className="happy2-agent-run-card__toggle-icon"
                        data-happy2-ui="agent-run-card-toggle-icon"
                    >
                        <Icon name="chevron-down" size={16} />
                    </span>
                </button>
            </header>
            <h3 className="happy2-agent-run-card__title" data-happy2-ui="agent-run-card-title">
                {local.run.title}
            </h3>
            {local.run.stats
                ? ((stats) => (
                      <div
                          className="happy2-agent-run-card__meta"
                          data-happy2-ui="agent-run-card-meta"
                      >
                          (stats.added !== undefined ?{" "}
                          <span
                              className="happy2-agent-run-card__added"
                              data-happy2-ui="agent-run-card-added"
                          >
                              +{stats.added}
                          </span>{" "}
                          : null) (stats.removed !== undefined ?{" "}
                          <span
                              className="happy2-agent-run-card__removed"
                              data-happy2-ui="agent-run-card-removed"
                          >
                              &minus;{stats.removed}
                          </span>{" "}
                          : null)
                          {detail() ? (
                              <span
                                  className="happy2-agent-run-card__detail"
                                  data-happy2-ui="agent-run-card-detail"
                              >
                                  {detail()}
                              </span>
                          ) : null}
                      </div>
                  ))(local.run.stats)
                : null}
            {local.run.branch
                ? ((branch) => (
                      <div
                          className="happy2-agent-run-card__branch"
                          data-happy2-ui="agent-run-card-branch"
                      >
                          <span
                              aria-hidden="true"
                              className="happy2-agent-run-card__branch-icon"
                              data-happy2-ui="agent-run-card-branch-icon"
                          >
                              <Icon name="branch" size={14} />
                          </span>
                          <span
                              className="happy2-agent-run-card__branch-name"
                              data-happy2-ui="agent-run-card-branch-name"
                          >
                              {branch}
                          </span>
                      </div>
                  ))(local.run.branch)
                : null}
            {local.expanded && local.run.steps.length > 0 ? (
                <ul className="happy2-agent-run-card__steps" data-happy2-ui="agent-run-card-steps">
                    {local.run.steps.map((step, index) => (
                        <li
                            className="happy2-agent-run-card__step"
                            key={`${step.label}-${index}`}
                            data-happy2-ui="agent-run-card-step"
                            data-status={step.status}
                        >
                            <span
                                aria-hidden="true"
                                className="happy2-agent-run-card__step-glyph"
                                data-happy2-ui="agent-run-card-step-glyph"
                            >
                                {step.status === "done" ? (
                                    <Icon name="check-circle" size={16} />
                                ) : (
                                    <span
                                        className="happy2-agent-run-card__step-dot"
                                        data-happy2-ui="agent-run-card-step-dot"
                                    />
                                )}
                            </span>
                            <span
                                className="happy2-agent-run-card__step-label"
                                data-happy2-ui="agent-run-card-step-label"
                            >
                                {step.label}
                            </span>
                        </li>
                    ))}
                </ul>
            ) : null}
            {local.expanded && local.children ? (
                <div className="happy2-agent-run-card__body" data-happy2-ui="agent-run-card-body">
                    {local.children}
                </div>
            ) : null}
            {local.actions?.length ? (
                <div
                    className="happy2-agent-run-card__actions"
                    data-happy2-ui="agent-run-card-actions"
                >
                    {local.actions.map((action) => (
                        <Button
                            key={action.id}
                            onClick={() => local.onAction?.(action.id)}
                            size="small"
                            variant={action.variant ?? "secondary"}
                        >
                            {action.label}
                        </Button>
                    ))}
                </div>
            ) : null}
        </article>
    );
}
