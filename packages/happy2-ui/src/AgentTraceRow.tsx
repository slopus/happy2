import { partitionComponentProps } from "./componentProps";
import { type CSSProperties } from "react";
import { Icon, type IconName } from "./Icon";
export type AgentTraceRowKind =
    | "reasoning"
    | "response"
    | "tool"
    | "subagent"
    | "terminal"
    | "status";
export type AgentTraceRowStatus = "running" | "complete" | "failed";
export interface AgentTraceRowProps {
    readonly className?: string;
    readonly "data-testid"?: string;
    readonly style?: CSSProperties;
    readonly status: AgentTraceRowStatus;
    /** Latest meaningful activity while running. */
    readonly kind?: AgentTraceRowKind;
    readonly title?: string;
    readonly detail?: string;
    readonly entryCount: number;
    /** The trace panel is currently showing this turn. */
    readonly open?: boolean;
    readonly onOpen?: () => void;
    /** Accessible name, default "Agent activity". */
    readonly label?: string;
}
const KIND_ICONS: Record<AgentTraceRowKind, IconName> = {
    reasoning: "spark",
    response: "check-circle",
    tool: "terminal",
    subagent: "branch",
    terminal: "terminal",
    status: "check-circle",
};
/** Existing Icon glyph for a trace activity kind (shared with AgentTracePanel). */
export function agentTraceKindIcon(kind: AgentTraceRowKind): IconName {
    return KIND_ICONS[kind];
}
/**
 * C-067 AgentTraceRow — a compact, single-line 28px button row rendered inside
 * an assistant message. While the turn runs it shows only the latest activity:
 * a static accent dot (no animation), the kind glyph, a title, and mono detail
 * when that detail is not already visible elsewhere — no counter churn. Once
 * the turn completes or fails it reads as a "View trace" link row with the
 * step count. Clicking fires `onOpen`; `aria-expanded` reflects whether the
 * trace panel currently shows this turn. Props only — no local state, timers,
 * or animation.
 */
export function AgentTraceRow(props: AgentTraceRowProps) {
    const [local] = partitionComponentProps(props, [
        "className",
        "data-testid",
        "style",
        "status",
        "kind",
        "title",
        "detail",
        "entryCount",
        "open",
        "onOpen",
        "label",
    ]);
    const running = () => local.status === "running";
    return (
        <button
            aria-expanded={local.open === true ? "true" : "false"}
            aria-label={local.label ?? "Agent activity"}
            className={["happy2-agent-trace-row", local.className].filter(Boolean).join(" ")}
            data-happy2-ui="agent-trace-row"
            data-status={local.status}
            data-testid={local["data-testid"]}
            onClick={() => local.onOpen?.()}
            style={local.style}
            type="button"
        >
            <span
                aria-hidden="true"
                className="happy2-agent-trace-row__dot"
                data-happy2-ui="agent-trace-row-dot"
            />
            {running() && local.kind !== undefined
                ? ((kind) => (
                      <span
                          aria-hidden="true"
                          className="happy2-agent-trace-row__icon"
                          data-happy2-ui="agent-trace-row-icon"
                      >
                          <Icon name={agentTraceKindIcon(kind)} size={14} />
                      </span>
                  ))(local.kind)
                : null}
            <span className="happy2-agent-trace-row__title" data-happy2-ui="agent-trace-row-title">
                {running() ? (local.title ?? "Working") : "View trace"}
            </span>
            {running() && local.detail !== undefined ? (
                <span
                    className="happy2-agent-trace-row__detail"
                    data-happy2-ui="agent-trace-row-detail"
                >
                    {local.detail}
                </span>
            ) : null}
            {running() ? null : (
                <span
                    className="happy2-agent-trace-row__count"
                    data-happy2-ui="agent-trace-row-count"
                >
                    {`${local.entryCount} steps`}
                </span>
            )}
        </button>
    );
}
