import { For, Show, splitProps, type JSX } from "solid-js";
import type { Dimension } from "./dimensions";
import { toCssDimension } from "./dimensions";
import { Icon } from "./Icon";

export type SelectSize = "small" | "medium" | "large";
export type SelectOption = { value: string; label: string; disabled?: boolean };

export type SelectProps = {
    class?: string;
    "data-testid"?: string;
    style?: JSX.CSSProperties;
    value?: string;
    onValueChange?: (value: string) => void;
    options: SelectOption[];
    label?: string;
    placeholder?: string;
    size?: SelectSize;
    disabled?: boolean;
    error?: string;
    hint?: string;
    fullWidth?: boolean;
    /* Optional, additive: give the control an explicit width or bind a form. */
    id?: string;
    name?: string;
    width?: Dimension;
};

/* Chevron affordance grows with the control but stays smaller than the field. */
const chevronSizes: Record<SelectSize, 14 | 16> = {
    small: 14,
    medium: 16,
    large: 16,
};

/**
 * C-019 Select — a styled single-select built on the native overlay pattern: a
 * real, transparent `<select>` fills the control so open/keyboard/click stay
 * fully native and reliable, while a measurable value `<span>` and a tuned Icon
 * chevron render the visible chrome. Placeholder, error, hint, disabled, and
 * size are prop-driven so a fixture renders every state without a store.
 */
export function Select(props: SelectProps) {
    const [local] = splitProps(props, [
        "class",
        "data-testid",
        "style",
        "value",
        "onValueChange",
        "options",
        "label",
        "placeholder",
        "size",
        "disabled",
        "error",
        "hint",
        "fullWidth",
        "id",
        "name",
        "width",
    ]);
    const size = () => local.size ?? "medium";
    const matched = () => local.options.find((option) => option.value === local.value);
    const usePlaceholder = () => matched() === undefined && local.placeholder !== undefined;
    const displayLabel = () =>
        usePlaceholder() ? local.placeholder : (matched()?.label ?? local.options[0]?.label ?? "");
    const message = () => local.error ?? local.hint;

    return (
        <div
            class={["happy2-select", local.class].filter(Boolean).join(" ")}
            data-disabled={local.disabled ? "" : undefined}
            data-error={local.error ? "" : undefined}
            data-full-width={local.fullWidth ? "" : undefined}
            data-placeholder={usePlaceholder() ? "" : undefined}
            data-happy2-ui="select"
            data-size={size()}
            data-testid={local["data-testid"]}
            style={{
                ...local.style,
                ...(local.fullWidth
                    ? {}
                    : local.width === undefined
                      ? {}
                      : { width: toCssDimension(local.width) }),
            }}
        >
            <Show when={local.label}>
                {(label) => (
                    <label
                        class="happy2-select__label"
                        data-happy2-ui="select-label"
                        for={local.id}
                    >
                        {label()}
                    </label>
                )}
            </Show>
            <div class="happy2-select__control" data-happy2-ui="select-control">
                <span
                    aria-hidden="true"
                    class="happy2-select__value"
                    data-placeholder={usePlaceholder() ? "" : undefined}
                    data-happy2-ui="select-value"
                >
                    {displayLabel()}
                </span>
                <span
                    aria-hidden="true"
                    class="happy2-select__chevron"
                    data-happy2-ui="select-chevron"
                >
                    <Icon name="chevron-down" size={chevronSizes[size()]} />
                </span>
                <select
                    aria-label={local.label}
                    class="happy2-select__native"
                    data-happy2-ui="select-native"
                    disabled={local.disabled}
                    id={local.id}
                    name={local.name}
                    onChange={(event) => local.onValueChange?.(event.currentTarget.value)}
                    value={local.value ?? ""}
                >
                    <Show when={local.placeholder}>
                        {(placeholder) => (
                            <option disabled hidden value="">
                                {placeholder()}
                            </option>
                        )}
                    </Show>
                    <For each={local.options}>
                        {(option) => (
                            <option disabled={option.disabled} value={option.value}>
                                {option.label}
                            </option>
                        )}
                    </For>
                </select>
            </div>
            <Show when={message()}>
                {(text) => (
                    <span
                        class="happy2-select__message"
                        data-happy2-ui={local.error ? "select-error" : "select-hint"}
                    >
                        {text()}
                    </span>
                )}
            </Show>
        </div>
    );
}
