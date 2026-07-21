import { type CSSProperties } from "react";
import { Icon } from "./Icon";

export type AudienceValue = "people" | "agents";
export type AudienceToggleProps = {
    className?: string;
    "data-testid"?: string;
    disabled?: boolean;
    onChange?: (value: AudienceValue) => void;
    style?: CSSProperties;
    value: AudienceValue;
};
/**
 * C-065 AudienceToggle — a compact current-destination toggle. It exposes one
 * icon-and-label control, so the composer stays quiet while Shift+Tab and a
 * click still switch the host-owned audience.
 */
export function AudienceToggle(props: AudienceToggleProps) {
    return (
        <button
            aria-label={props.value === "people" ? "Switch to Agents" : "Switch to People"}
            aria-pressed={props.value === "people"}
            className={["happy2-audience-toggle", props.className].filter(Boolean).join(" ")}
            data-happy2-ui="audience-toggle"
            data-testid={props["data-testid"]}
            data-value={props.value}
            disabled={props.disabled}
            onClick={() => props.onChange?.(props.value === "people" ? "agents" : "people")}
            style={props.style}
            type="button"
        >
            <Icon name={props.value === "people" ? "users" : "spark"} size={16} />
            <span>{props.value === "people" ? "People" : "Agents"}</span>
        </button>
    );
}
