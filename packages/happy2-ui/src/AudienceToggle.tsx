import { type CSSProperties } from "react";
import { SegmentedControl } from "./SegmentedControl";

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
 * C-065 AudienceToggle — the composer's message-destination switch. A fixed
 * two-segment People/Agents control built on SegmentedControl so the current
 * mode is always visible; Shift+Tab in the composer flips it without the
 * pointer. The host owns the value and receives typed audience changes.
 */
export function AudienceToggle(props: AudienceToggleProps) {
    return (
        <div
            className={["happy2-audience-toggle", props.className].filter(Boolean).join(" ")}
            data-happy2-ui="audience-toggle"
            data-testid={props["data-testid"]}
            data-value={props.value}
            style={props.style}
        >
            <SegmentedControl
                disabled={props.disabled}
                onChange={(value) => props.onChange?.(value as AudienceValue)}
                segments={[
                    { icon: "users", label: "People", value: "people" },
                    { icon: "spark", label: "Agents", value: "agents" },
                ]}
                size="small"
                value={props.value}
            />
        </div>
    );
}
