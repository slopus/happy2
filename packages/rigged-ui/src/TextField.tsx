import { Show, splitProps, type JSX } from "solid-js";
import { Icon, type IconName } from "./Icon";

export type TextFieldType = "text" | "email" | "password" | "search";
export type TextFieldSize = "small" | "medium" | "large";

export type TextFieldProps = {
    class?: string;
    "data-testid"?: string;
    style?: JSX.CSSProperties;
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
    autocomplete?: string;
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

let nextId = 0;

/**
 * C-018 TextField — labeled text input / textarea on the Relay inset well.
 * Three contract heights (28/36/44), optional label with required marker,
 * leading icon, hint, and error message. Props-only and fully controlled.
 */
export function TextField(props: TextFieldProps) {
    const [local] = splitProps(props, [
        "autocomplete",
        "class",
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

    const fallbackId = `rg-text-field-${(nextId += 1)}`;
    const fieldId = () => local.id ?? fallbackId;
    const messageId = () => `${fieldId()}-message`;
    const describedBy = () => (message() ? messageId() : undefined);

    return (
        <div
            class={["rigged-text-field", local.class].filter(Boolean).join(" ")}
            data-disabled={local.disabled ? "" : undefined}
            data-full-width={local.fullWidth ? "" : undefined}
            data-invalid={invalid() ? "" : undefined}
            data-multiline={local.multiline ? "" : undefined}
            data-rigged-ui="text-field"
            data-size={size()}
            data-testid={local["data-testid"]}
            style={local.style}
        >
            <Show when={local.label}>
                <label
                    class="rigged-text-field__label"
                    data-rigged-ui="text-field-label"
                    for={fieldId()}
                >
                    {local.label}
                    <Show when={local.required}>
                        <span
                            aria-hidden="true"
                            class="rigged-text-field__required"
                            data-rigged-ui="text-field-required"
                        >
                            *
                        </span>
                    </Show>
                </label>
            </Show>

            <div
                class="rigged-text-field__control"
                data-invalid={invalid() ? "" : undefined}
                data-multiline={local.multiline ? "" : undefined}
                data-rigged-ui="text-field-control"
                data-size={size()}
            >
                <Show when={local.leadingIcon}>
                    {(name) => (
                        <span
                            aria-hidden="true"
                            class="rigged-text-field__icon"
                            data-rigged-ui="text-field-icon"
                        >
                            <Icon name={name()} size={iconSizes[size()]} />
                        </span>
                    )}
                </Show>

                <Show
                    when={local.multiline}
                    fallback={
                        <input
                            aria-describedby={describedBy()}
                            aria-invalid={invalid() ? "true" : undefined}
                            autocomplete={local.autocomplete}
                            class="rigged-text-field__input"
                            data-rigged-ui="text-field-input"
                            disabled={local.disabled}
                            id={fieldId()}
                            name={local.name}
                            onInput={(event) => local.onValueChange?.(event.currentTarget.value)}
                            placeholder={local.placeholder}
                            required={local.required}
                            type={local.type ?? "text"}
                            value={local.value ?? ""}
                        />
                    }
                >
                    <textarea
                        aria-describedby={describedBy()}
                        aria-invalid={invalid() ? "true" : undefined}
                        class="rigged-text-field__input"
                        data-rigged-ui="text-field-input"
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
                </Show>
            </div>

            <Show when={message()}>
                <div
                    class="rigged-text-field__message"
                    data-rigged-ui={invalid() ? "text-field-error" : "text-field-hint"}
                    data-tone={invalid() ? "error" : "hint"}
                    id={messageId()}
                >
                    {message()}
                </div>
            </Show>
        </div>
    );
}
