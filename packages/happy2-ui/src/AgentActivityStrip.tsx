import { partitionComponentProps } from "./componentProps";
import { type CSSProperties } from "react";
import { Icon } from "./Icon";
export type AgentActivityStripSubagentStatus =
    | "idle"
    | "queued"
    | "running"
    | "completed"
    | "aborted"
    | "suspended"
    | "error";
export interface AgentActivityStripSubagent {
    readonly id: string;
    readonly description: string;
    readonly status: AgentActivityStripSubagentStatus;
    readonly latestText?: string;
    /** Epoch milliseconds when the subagent started. */
    readonly startedAt: number;
    readonly totalTokens: number;
}
export interface AgentActivityStripTerminal {
    readonly id: string;
    readonly command: string;
    readonly cwd: string;
    /** Epoch milliseconds when the terminal command started. */
    readonly startedAt: number;
}
export interface AgentActivityStripProps {
    readonly className?: string;
    readonly "data-testid"?: string;
    readonly style?: CSSProperties;
    readonly subagents: readonly AgentActivityStripSubagent[];
    readonly terminals: readonly AgentActivityStripTerminal[];
    /** Caller-supplied clock for elapsed rendering; the component owns no timers. */
    readonly now: number;
}
/** Compact token total: 999 stays plain, 1.2k under ten thousand, 12k beyond. */
function formatTokenTotal(count: number): string {
    const whole = Math.max(0, Math.trunc(count));
    if (whole < 1_000) return String(whole);
    if (whole < 10_000) {
        const tenths = Math.round(whole / 100) / 10;
        return `${Number.isInteger(tenths) ? tenths.toFixed(0) : tenths.toFixed(1)}k`;
    }
    return `${Math.round(whole / 1_000)}k`;
}
/** m:ss from the caller clock; a not-yet-started entry clamps to 0:00. */
function formatElapsed(now: number, startedAt: number): string {
    const total = Math.max(0, Math.floor((now - startedAt) / 1_000));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
/**
 * C-066 AgentActivityStrip — a dense, TUI-like live strip shown above the chat
 * composer while an agent turn runs: one 24px row per active subagent (status
 * dot, description, latest mono output, token total, elapsed) and per
 * background terminal (terminal glyph, command, cwd, elapsed). Renders nothing
 * when both collections are empty. Deterministic and screenshot safe: the
 * caller supplies `now` from its own ticking clock, so the component owns no
 * timers, animation, or local state.
 */
export function AgentActivityStrip(props: AgentActivityStripProps) {
    const [local] = partitionComponentProps(props, [
        "className",
        "data-testid",
        "style",
        "subagents",
        "terminals",
        "now",
    ]);
    if (local.subagents.length === 0 && local.terminals.length === 0) return null;
    return (
        <div
            className={["happy2-agent-activity-strip", local.className].filter(Boolean).join(" ")}
            data-happy2-ui="agent-activity-strip"
            data-testid={local["data-testid"]}
            style={local.style}
        >
            <div
                className="happy2-agent-activity-strip__scrollport"
                data-happy2-ui="agent-activity-strip-scrollport"
            >
                <div
                    className="happy2-agent-activity-strip__rows"
                    data-happy2-ui="agent-activity-strip-rows"
                >
                    {local.subagents.map((subagent) => (
                        <div
                            className="happy2-agent-activity-strip__subagent"
                            data-happy2-ui="agent-activity-strip-subagent"
                            data-status={subagent.status}
                            key={subagent.id}
                        >
                            <span
                                aria-hidden="true"
                                className="happy2-agent-activity-strip__dot"
                                data-happy2-ui="agent-activity-strip-dot"
                            />
                            <span
                                className="happy2-agent-activity-strip__description"
                                data-happy2-ui="agent-activity-strip-description"
                            >
                                {subagent.description}
                            </span>
                            {subagent.latestText !== undefined ? (
                                <span
                                    className="happy2-agent-activity-strip__latest"
                                    data-happy2-ui="agent-activity-strip-latest"
                                >
                                    {subagent.latestText}
                                </span>
                            ) : null}
                            <span
                                className="happy2-agent-activity-strip__meta"
                                data-happy2-ui="agent-activity-strip-meta"
                            >
                                <span
                                    className="happy2-agent-activity-strip__tokens"
                                    data-happy2-ui="agent-activity-strip-tokens"
                                >
                                    {formatTokenTotal(subagent.totalTokens)}
                                </span>
                                <span
                                    className="happy2-agent-activity-strip__elapsed"
                                    data-happy2-ui="agent-activity-strip-elapsed"
                                >
                                    {formatElapsed(local.now, subagent.startedAt)}
                                </span>
                            </span>
                        </div>
                    ))}
                    {local.terminals.map((terminal) => (
                        <div
                            className="happy2-agent-activity-strip__terminal"
                            data-happy2-ui="agent-activity-strip-terminal"
                            key={terminal.id}
                        >
                            <span
                                aria-hidden="true"
                                className="happy2-agent-activity-strip__terminal-icon"
                                data-happy2-ui="agent-activity-strip-terminal-icon"
                            >
                                <Icon name="terminal" size={12} />
                            </span>
                            <span
                                className="happy2-agent-activity-strip__command"
                                data-happy2-ui="agent-activity-strip-command"
                            >
                                {terminal.command}
                            </span>
                            <span
                                className="happy2-agent-activity-strip__cwd"
                                data-happy2-ui="agent-activity-strip-cwd"
                            >
                                {terminal.cwd}
                            </span>
                            <span
                                className="happy2-agent-activity-strip__meta"
                                data-happy2-ui="agent-activity-strip-meta"
                            >
                                <span
                                    className="happy2-agent-activity-strip__elapsed"
                                    data-happy2-ui="agent-activity-strip-elapsed"
                                >
                                    {formatElapsed(local.now, terminal.startedAt)}
                                </span>
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
