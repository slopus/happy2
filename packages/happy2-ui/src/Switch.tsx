import { type CSSProperties } from "react";
export type SwitchSize = "small" | "medium";
export type SwitchProps = {
    "aria-label"?: string;
    checked: boolean;
    className?: string;
    "data-testid"?: string;
    description?: string;
    disabled?: boolean;
    id?: string;
    label?: string;
    onChange?: (checked: boolean) => void;
    size?: SwitchSize;
    style?: CSSProperties;
};
/**
 * C-020 Switch — Happy toggle. Integer track/thumb geometry on the 4px grid,
 * accent-filled when on and inset-welled when off, with an optional label and
 * secondary description. The whole control is one `role="switch"` button so the
 * label and description are part of the hit target. Desktop only, props only.
 */
export function Switch(props: SwitchProps) {
    const size = () => props.size ?? "medium";
    return (
        <button
            aria-checked={props.checked}
            aria-label={props["aria-label"]}
            className={["happy2-switch", props.className].filter(Boolean).join(" ")}
            data-checked={props.checked ? "" : undefined}
            data-disabled={props.disabled ? "" : undefined}
            data-happy2-ui="switch"
            data-size={size()}
            data-testid={props["data-testid"]}
            disabled={props.disabled}
            id={props.id}
            onClick={() => props.onChange?.(!props.checked)}
            role="switch"
            style={props.style}
            type="button"
        >
            <span className="happy2-switch__track" data-happy2-ui="switch-track">
                <span className="happy2-switch__thumb" data-happy2-ui="switch-thumb" />
            </span>
            {props.label
                ? ((label) => (
                      <span className="happy2-switch__text" data-happy2-ui="switch-text">
                          <span className="happy2-switch__label" data-happy2-ui="switch-label">
                              {label}
                          </span>
                          {props.description
                              ? ((description) => (
                                    <span
                                        className="happy2-switch__description"
                                        data-happy2-ui="switch-description"
                                    >
                                        {description}
                                    </span>
                                ))(props.description)
                              : null}
                      </span>
                  ))(props.label)
                : null}
        </button>
    );
}
