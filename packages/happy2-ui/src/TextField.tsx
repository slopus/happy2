import { splitProps } from "./reactProps";
import { useId, type CSSProperties } from "react";
import { Icon, type IconName } from "./Icon";
export type TextFieldType = "text" | "email" | "password" | "search";
export type TextFieldSize = "small" | "medium" | "large";
export type TextFieldProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    value?: string;
    onValueChange?: (value: string) => void;
    label?: string;
    placeholder?: string;
    type?: TextFieldType;
    multiline?: boolean;
    rows?: number;
    size?: TextFieldSize;
    hint?: string;
    error?: string;
    disabled?: boolean;
    required?: boolean;
    leadingIcon?: IconName;
    fullWidth?: boolean;
    id?: string;
    name?: string;
    autoComplete?: string;
};
/** Leading-icon glyph box by control size (matches Button's 14/16/18 ramp). */
const iconSizes: Record<TextFieldSize, 14 | 16 | 18> = {
    small: 14,
    medium: 16,
    large: 18,
};
/*
 * Multiline line box. The textarea is given an explicit height of
 * rows × MULTILINE_LINE_HEIGHT so its box is deterministic across engines
 * (native `rows` sizing drifts a pixel or two between Blink/Gecko/WebKit).
 */
const MULTILINE_LINE_HEIGHT = 20;
/**
 * C-018 TextField — labeled text input / textarea on the Relay inset well.
 * Three contract heights (28/36/44), optional label with required marker,
 * leading icon, hint, and error message. Props-only and fully controlled.
 */
export function TextField(props: TextFieldProps) {
    const [local] = splitProps(props, [
        "autoComplete",
        "className",
        "data-testid",
        "disabled",
        "error",
        "fullWidth",
        "hint",
        "id",
        "label",
        "leadingIcon",
        "multiline",
        "name",
        "onValueChange",
        "placeholder",
        "required",
        "rows",
        "size",
        "style",
        "type",
        "value",
    ]);
    const size = () => local.size ?? "medium";
    const invalid = () => local.error !== undefined && local.error !== "";
    const message = () => (invalid() ? local.error : local.hint);
    const rows = () => local.rows ?? 3;
    const generatedId = useId();
    const fallbackId = `happy2-text-field-${generatedId}`;
    const fieldId = () => local.id ?? fallbackId;
    const messageId = () => `${fieldId()}-message`;
    const describedBy = () => (message() ? messageId() : undefined);
    return (
        <div
            className={["happy2-text-field", local.className].filter(Boolean).join(" ")}
            data-disabled={local.disabled ? "" : undefined}
            data-full-width={local.fullWidth ? "" : undefined}
            data-invalid={invalid() ? "" : undefined}
            data-multiline={local.multiline ? "" : undefined}
            data-happy2-ui="text-field"
            data-size={size()}
            data-testid={local["data-testid"]}
            style={local.style}
        >
            {local.label ? (
                <label
                    className="happy2-text-field__label"
                    data-happy2-ui="text-field-label"
                    htmlFor={fieldId()}
                >
                    {local.label}
                    {local.required ? (
                        <span
                            aria-hidden="true"
                            className="happy2-text-field__required"
                            data-happy2-ui="text-field-required"
                        >
                            *
                        </span>
                    ) : null}
                </label>
            ) : null}

            <div
                className="happy2-text-field__control"
                data-invalid={invalid() ? "" : undefined}
                data-multiline={local.multiline ? "" : undefined}
                data-happy2-ui="text-field-control"
                data-size={size()}
            >
                {local.leadingIcon
                    ? ((name) => (
                          <span
                              aria-hidden="true"
                              className="happy2-text-field__icon"
                              data-happy2-ui="text-field-icon"
                          >
                              <Icon name={name} size={iconSizes[size()]} />
                          </span>
                      ))(local.leadingIcon)
                    : null}

                {local.multiline ? (
                    <textarea
                        aria-describedby={describedBy()}
                        aria-invalid={invalid() ? "true" : undefined}
                        className="happy2-text-field__input"
                        data-happy2-ui="text-field-input"
                        disabled={local.disabled}
                        id={fieldId()}
                        name={local.name}
                        onInput={(event) => local.onValueChange?.(event.currentTarget.value)}
                        placeholder={local.placeholder}
                        required={local.required}
                        rows={rows()}
                        style={{ height: `${rows() * MULTILINE_LINE_HEIGHT}px` }}
                        value={local.value ?? ""}
                    />
                ) : (
                    <input
                        aria-describedby={describedBy()}
                        aria-invalid={invalid() ? "true" : undefined}
                        autoComplete={local.autoComplete}
                        className="happy2-text-field__input"
                        data-happy2-ui="text-field-input"
                        disabled={local.disabled}
                        id={fieldId()}
                        name={local.name}
                        onInput={(event) => local.onValueChange?.(event.currentTarget.value)}
                        placeholder={local.placeholder}
                        required={local.required}
                        type={local.type ?? "text"}
                        value={local.value ?? ""}
                    />
                )}
            </div>

            {message() ? (
                <div
                    className="happy2-text-field__message"
                    data-happy2-ui={invalid() ? "text-field-error" : "text-field-hint"}
                    data-tone={invalid() ? "error" : "hint"}
                    id={messageId()}
                >
                    {message()}
                </div>
            ) : null}
        </div>
    );
}
