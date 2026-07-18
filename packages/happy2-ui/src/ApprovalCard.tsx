import { splitProps } from "./reactProps";
import { type CSSProperties, type HTMLAttributes } from "react";
import { Avatar, type ToneName } from "./Avatar";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Icon } from "./Icon";
export type ApprovalResolution = "approved" | "denied" | "pending";
export type ApprovalRequest = {
    /** Mono action line, e.g. "edit config/releases/onboarding.json". */
    action: string;
    agent: string;
    impact: string;
    initials: string;
    reason: string;
    resources: string[];
    title: string;
    tone?: ToneName;
    typeLabel: string;
};
export type ApprovalCardProps = Omit<HTMLAttributes<HTMLElement>, "style"> & {
    expanded: boolean;
    onExpandedChange: (expanded: boolean) => void;
    onResolutionChange: (resolution: ApprovalResolution) => void;
    request: ApprovalRequest;
    resolution: ApprovalResolution;
    style?: CSSProperties;
};
/**
 * Approval gate posted by an agent before a guarded change. Pending shows the
 * amber shield treatment with Approve / Request changes actions; approved and
 * denied collapse the actions into a state line under a resolution banner.
 */
export function ApprovalCard(props: ApprovalCardProps) {
    const [local, rest] = splitProps(props, [
        "className",
        "expanded",
        "onExpandedChange",
        "onResolutionChange",
        "request",
        "resolution",
        "style",
    ]);
    const approved = () => local.resolution === "approved";
    const pending = () => local.resolution === "pending";
    return (
        <section
            {...rest}
            className={["happy2-approval-card", local.className].filter(Boolean).join(" ")}
            data-expanded={local.expanded ? "" : undefined}
            data-resolution={local.resolution}
            data-happy2-ui="approval-card"
            style={local.style}
        >
            {!pending() ? (
                <div className="happy2-approval-card__banner" data-happy2-ui="approval-card-banner">
                    <Icon name={approved() ? "check" : "close"} size={14} />
                    <span
                        className="happy2-approval-card__banner-label"
                        data-happy2-ui="approval-card-banner-label"
                    >
                        {approved() ? "Approved" : "Denied"}
                    </span>
                </div>
            ) : null}
            <div className="happy2-approval-card__body" data-happy2-ui="approval-card-body">
                <div className="happy2-approval-card__header" data-happy2-ui="approval-card-header">
                    <span
                        className="happy2-approval-card__chip"
                        data-happy2-ui="approval-card-chip"
                    >
                        <Icon name="shield" size={14} />
                    </span>
                    <Badge
                        label={local.request.typeLabel}
                        variant={pending() ? "warning" : "neutral"}
                    />
                    <span
                        className="happy2-approval-card__agent"
                        data-happy2-ui="approval-card-agent"
                    >
                        <Avatar
                            initials={local.request.initials}
                            size="xs"
                            tone={local.request.tone}
                            type="agent"
                        />
                        <span
                            className="happy2-approval-card__agent-name"
                            data-happy2-ui="approval-card-agent-name"
                        >
                            {local.request.agent}
                        </span>
                    </span>
                </div>
                <h3 className="happy2-approval-card__title" data-happy2-ui="approval-card-title">
                    {local.request.title}
                </h3>
                <p className="happy2-approval-card__reason" data-happy2-ui="approval-card-reason">
                    {local.request.reason}
                </p>
                <code
                    className="happy2-approval-card__action"
                    data-happy2-ui="approval-card-action"
                >
                    <span
                        className="happy2-approval-card__action-text"
                        data-happy2-ui="approval-card-action-text"
                    >
                        {local.request.action}
                    </span>
                </code>
                {local.expanded ? (
                    <div
                        className="happy2-approval-card__details"
                        data-happy2-ui="approval-card-details"
                    >
                        <span
                            className="happy2-approval-card__detail-label"
                            data-happy2-ui="approval-card-detail-label"
                        >
                            Impact
                        </span>
                        <p
                            className="happy2-approval-card__impact"
                            data-happy2-ui="approval-card-impact"
                        >
                            {local.request.impact}
                        </p>
                        <span
                            className="happy2-approval-card__detail-label"
                            data-happy2-ui="approval-card-detail-label"
                        >
                            Resources
                        </span>
                        <div
                            className="happy2-approval-card__resources"
                            data-happy2-ui="approval-card-resources"
                        >
                            {local.request.resources.map((resource) => (
                                <Badge key={resource} label={resource} variant="outline" />
                            ))}
                        </div>
                    </div>
                ) : null}
            </div>
            <footer className="happy2-approval-card__footer" data-happy2-ui="approval-card-footer">
                {pending() ? (
                    <>
                        <Button
                            data-action="approve"
                            icon="check"
                            onClick={() => local.onResolutionChange("approved")}
                            size="small"
                        >
                            Approve
                        </Button>
                        <Button
                            data-action="deny"
                            onClick={() => local.onResolutionChange("denied")}
                            size="small"
                            variant="secondary"
                        >
                            Request changes
                        </Button>
                    </>
                ) : (
                    <span
                        className="happy2-approval-card__state"
                        data-happy2-ui="approval-card-state"
                    >
                        <Icon name={approved() ? "check-circle" : "close"} size={14} />
                        <span
                            className="happy2-approval-card__state-label"
                            data-happy2-ui="approval-card-state-label"
                        >
                            {approved()
                                ? `Approved — ${local.request.agent} can proceed`
                                : `Denied — ${local.request.agent} will hold this change`}
                        </span>
                    </span>
                )}
                <button
                    aria-expanded={local.expanded ? "true" : "false"}
                    className="happy2-approval-card__toggle"
                    data-happy2-ui="approval-card-toggle"
                    onClick={() => local.onExpandedChange(!local.expanded)}
                    type="button"
                >
                    <span
                        className="happy2-approval-card__toggle-label"
                        data-happy2-ui="approval-card-toggle-label"
                    >
                        Details
                    </span>
                    <Icon name="chevron-down" size={14} />
                </button>
            </footer>
        </section>
    );
}
