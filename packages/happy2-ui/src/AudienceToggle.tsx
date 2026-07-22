import { type CSSProperties } from "react";

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
 * C-065 AudienceToggle — a compact current-destination text control. It keeps
 * the composer quiet beneath the input while click and Shift+Tab switch the
 * host-owned audience.
 */
export function AudienceToggle(props: AudienceToggleProps) {
    return (
        <button
            aria-label={
                props.value === "people" ? "Switch to talk to agents" : "Switch to talk to people"
            }
            aria-pressed={props.value === "people"}
            className={["happy2-audience-toggle", props.className].filter(Boolean).join(" ")}
            data-happy2-ui="audience-toggle"
            data-testid={props["data-testid"]}
            data-value={props.value}
            disabled={props.disabled}
            onClick={() => props.onChange?.(props.value === "people" ? "agents" : "people")}
            style={props.style}
            title={`Shift+Tab switches to talk to ${props.value === "people" ? "agents" : "people"}`}
            type="button"
        >
            <span>{props.value === "people" ? "Talk to people" : "Talk to agents"}</span>
        </button>
    );
}
