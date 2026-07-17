import { type JSX } from "solid-js";
import { Avatar, type ToneName } from "./Avatar";

export type AgentActivityPhase = "thinking" | "typing";

export type AgentActivityIndicatorProps = {
    class?: string;
    /** Avatar initials for the working agent. */
    initials: string;
    /** Display name of the working agent. */
    name: string;
    /** What the agent is doing right now. */
    phase: AgentActivityPhase;
    /** Total model tokens reported for this turn so far. */
    tokenCount: number;
    /** Whole seconds since the turn started, computed by the caller's clock. */
    elapsedSeconds: number;
    style?: JSX.CSSProperties;
    tone?: ToneName;
};

const PHASE_LABEL: Record<AgentActivityPhase, string> = {
    thinking: "thinking…",
    typing: "typing…",
};

/** Group an integer with thousands separators without locale dependence. */
function formatTokens(count: number): string {
    const whole = Math.max(0, Math.trunc(count));
    return String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** m:ss, or h:mm:ss once the turn passes an hour. */
function formatElapsed(seconds: number): string {
    const total = Math.max(0, Math.trunc(seconds));
    const hours = Math.floor(total / 3_600);
    const minutes = Math.floor((total % 3_600) / 60);
    const secs = total % 60;
    const pad = (value: number) => String(value).padStart(2, "0");
    return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}

/**
 * AgentActivityIndicator — a compact live pill for the turn an agent is
 * currently working on: its avatar, a phase word (thinking/typing), and the
 * running token count and elapsed time. Purely presentational: the caller
 * feeds it the phase, the token total, and a whole-second elapsed value from
 * its own ticking clock, so the component stays deterministic and screenshot
 * safe. Content-sized; place it wherever the working state should read.
 */
export function AgentActivityIndicator(props: AgentActivityIndicatorProps) {
    const tokenLabel = () => `${formatTokens(props.tokenCount)} tokens`;
    const elapsedLabel = () => formatElapsed(props.elapsedSeconds);
    return (
        <div
            class={["happy2-agent-activity", props.class].filter(Boolean).join(" ")}
            data-happy2-ui="agent-activity"
            data-phase={props.phase}
            role="status"
            aria-label={`${props.name} is ${PHASE_LABEL[props.phase].replace("…", "")}, ${tokenLabel()}, ${elapsedLabel()} elapsed`}
            style={props.style}
        >
            <Avatar
                class="happy2-agent-activity__avatar"
                initials={props.initials}
                size="xs"
                tone={props.tone}
                type="agent"
            />
            <span class="happy2-agent-activity__name" data-happy2-ui="agent-activity-name">
                {props.name}
            </span>
            <span
                class="happy2-agent-activity__dot"
                data-happy2-ui="agent-activity-dot"
                aria-hidden="true"
            />
            <span class="happy2-agent-activity__phase" data-happy2-ui="agent-activity-phase">
                {PHASE_LABEL[props.phase]}
            </span>
            <span class="happy2-agent-activity__meta" data-happy2-ui="agent-activity-meta">
                <span class="happy2-agent-activity__tokens" data-happy2-ui="agent-activity-tokens">
                    {tokenLabel()}
                </span>
                <span class="happy2-agent-activity__sep" aria-hidden="true">
                    ·
                </span>
                <span
                    class="happy2-agent-activity__elapsed"
                    data-happy2-ui="agent-activity-elapsed"
                >
                    {elapsedLabel()}
                </span>
            </span>
        </div>
    );
}
