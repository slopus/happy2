import { partitionComponentProps } from "./componentProps";
import { type CSSProperties } from "react";
import { agentTraceKindIcon, type AgentTraceRowKind } from "./AgentTraceRow";
import { Badge, type BadgeVariant } from "./Badge";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { SURFACE_HEADER_HEIGHT } from "./InfoPanel";
import { Toolbar } from "./Toolbar";
export type AgentTracePanelStatus = "pending" | "running" | "complete" | "failed";
export interface AgentTracePanelEntry {
    readonly id: string;
    readonly kind: AgentTraceRowKind;
    readonly title: string;
    readonly detail?: string;
    readonly status: "running" | "complete" | "failed";
    /** Epoch milliseconds when the activity occurred. */
    readonly occurredAt: number;
    readonly completedAt?: number;
}
export interface AgentTracePanelProps {
    readonly className?: string;
    readonly "data-testid"?: string;
    readonly style?: CSSProperties;
    /** Header title, e.g. the agent display name. */
    readonly title: string;
    /** Turn status; drives the header badge. */
    readonly status: AgentTracePanelStatus;
    readonly entries: readonly AgentTracePanelEntry[];
    /** Durable entry count (may equal entries.length). */
    readonly entryCount: number;
    /** Initial load only. */
    readonly loading?: boolean;
    /** Load failure message. */
    readonly error?: string;
    readonly onClose?: () => void;
    readonly closeLabel?: string;
}
type StatusBadge = { variant: BadgeVariant; label: string };
const STATUS_BADGES: Record<AgentTracePanelStatus, StatusBadge> = {
    pending: { variant: "neutral", label: "PENDING" },
    running: { variant: "accent", label: "RUNNING" },
    complete: { variant: "success", label: "COMPLETE" },
    failed: { variant: "danger", label: "FAILED" },
};
/**
 * HH:MM:SS in UTC via plain epoch math (no Intl, no local time zone), so the
 * same epoch renders one deterministic string in every engine and test run.
 */
function formatUtcClock(epochMs: number): string {
    const totalSeconds = Math.floor(epochMs / 1_000);
    const daySeconds = ((totalSeconds % 86_400) + 86_400) % 86_400;
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${pad(Math.floor(daySeconds / 3_600))}:${pad(Math.floor((daySeconds % 3_600) / 60))}:${pad(daySeconds % 60)}`;
}
/**
 * C-068 AgentTracePanel — the right-sidebar activity trace for one agent turn:
 * an activity log, not a chat. A 56px surface header (shared height with
 * ChannelHeader, InfoPanel, and ThreadPanel) carries the agent title, the step
 * count, a turn-status badge, and a close button; below it a full-bleed
 * scrollport body lists entries (kind glyph, title, mono detail, UTC
 * timestamp, status dot) or a centered loading/error/empty state. Props only —
 * the app supplies entries and the close handler; no timers or animation.
 */
export function AgentTracePanel(props: AgentTracePanelProps) {
    const [local] = partitionComponentProps(props, [
        "className",
        "data-testid",
        "style",
        "title",
        "status",
        "entries",
        "entryCount",
        "loading",
        "error",
        "onClose",
        "closeLabel",
    ]);
    const badge = () => STATUS_BADGES[local.status];
    return (
        <section
            className={["happy2-agent-trace-panel", local.className].filter(Boolean).join(" ")}
            data-happy2-ui="agent-trace-panel"
            data-status={local.status}
            data-testid={local["data-testid"]}
            style={local.style}
        >
            <Toolbar
                className="happy2-agent-trace-panel__header"
                height={SURFACE_HEADER_HEIGHT}
                subtitle={`${local.entryCount} ${local.entryCount === 1 ? "step" : "steps"}`}
                title={local.title}
                trailing={
                    <>
                        <Badge
                            className="happy2-agent-trace-panel__badge"
                            label={badge().label}
                            variant={badge().variant}
                        />
                        {local.onClose ? (
                            <Button
                                aria-label={local.closeLabel ?? "Close trace"}
                                icon="close"
                                iconOnly
                                onClick={() => local.onClose?.()}
                                size="small"
                                variant="ghost"
                            />
                        ) : null}
                    </>
                }
            />
            <div className="happy2-agent-trace-panel__body" data-happy2-ui="agent-trace-panel-body">
                {local.loading ? (
                    <div
                        className="happy2-agent-trace-panel__state"
                        data-happy2-ui="agent-trace-panel-state"
                        data-state="loading"
                    >
                        Loading activity…
                    </div>
                ) : local.error !== undefined ? (
                    <div
                        className="happy2-agent-trace-panel__state"
                        data-happy2-ui="agent-trace-panel-state"
                        data-state="error"
                    >
                        {local.error}
                    </div>
                ) : local.entries.length === 0 ? (
                    <div
                        className="happy2-agent-trace-panel__state"
                        data-happy2-ui="agent-trace-panel-state"
                        data-state="empty"
                    >
                        No activity yet
                    </div>
                ) : (
                    <div
                        className="happy2-agent-trace-panel__entries"
                        data-happy2-ui="agent-trace-panel-entries"
                    >
                        {local.entries.map((entry) => (
                            <div
                                className="happy2-agent-trace-panel__entry"
                                data-happy2-ui="agent-trace-panel-entry"
                                data-kind={entry.kind}
                                data-status={entry.status}
                                key={entry.id}
                            >
                                <span
                                    aria-hidden="true"
                                    className="happy2-agent-trace-panel__entry-dot-lane"
                                >
                                    <span
                                        className="happy2-agent-trace-panel__entry-dot"
                                        data-happy2-ui="agent-trace-panel-entry-dot"
                                    />
                                </span>
                                <span
                                    aria-hidden="true"
                                    className="happy2-agent-trace-panel__entry-icon"
                                    data-happy2-ui="agent-trace-panel-entry-icon"
                                >
                                    <Icon name={agentTraceKindIcon(entry.kind)} size={14} />
                                </span>
                                <span className="happy2-agent-trace-panel__entry-main">
                                    <span
                                        className="happy2-agent-trace-panel__entry-title"
                                        data-happy2-ui="agent-trace-panel-entry-title"
                                    >
                                        {entry.title}
                                    </span>
                                    {entry.detail !== undefined ? (
                                        <span
                                            className="happy2-agent-trace-panel__entry-detail"
                                            data-happy2-ui="agent-trace-panel-entry-detail"
                                        >
                                            {entry.detail}
                                        </span>
                                    ) : null}
                                </span>
                                <span
                                    className="happy2-agent-trace-panel__entry-time"
                                    data-happy2-ui="agent-trace-panel-entry-time"
                                >
                                    {formatUtcClock(entry.occurredAt)}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
}
