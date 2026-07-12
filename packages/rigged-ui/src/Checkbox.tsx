import { createEffect, Show, splitProps, type JSX } from "solid-js";
import { Icon } from "./Icon";

export type CheckboxProps = {
    "aria-label"?: string;
    checked: boolean;
    class?: string;
    "data-testid"?: string;
    disabled?: boolean;
    id?: string;
    indeterminate?: boolean;
    label?: string;
    name?: string;
    onChange?: (checked: boolean) => void;
    style?: JSX.CSSProperties;
};

/**
 * C-021 Checkbox — an 18px control box with a reused Icon check glyph (checked)
 * or a symmetric bar (indeterminate). The real state lives on a visually hidden
 * native <input type="checkbox"> so keyboard, focus, and screen-reader semantics
 * come for free; the painted box and glyph are prop-driven. Compose it inside
 * FormRow/DataTable/Menu wherever a boolean toggle is needed.
 */
export function Checkbox(props: CheckboxProps) {
    const [local] = splitProps(props, [
        "aria-label",
        "checked",
        "class",
        "data-testid",
        "disabled",
        "id",
        "indeterminate",
        "label",
        "name",
        "onChange",
        "style",
    ]);

    let control: HTMLInputElement | undefined;
    // indeterminate is a DOM property, not an attribute — mirror the prop onto
    // the live input so assistive tech announces the mixed state.
    createEffect(() => {
        if (control) control.indeterminate = local.indeterminate ?? false;
    });

    const state = () =>
        local.indeterminate ? "indeterminate" : local.checked ? "checked" : "unchecked";

    return (
        <label
            class={["rigged-checkbox", local.class].filter(Boolean).join(" ")}
            data-checked={local.checked ? "" : undefined}
            data-disabled={local.disabled ? "" : undefined}
            data-indeterminate={local.indeterminate ? "" : undefined}
            data-rigged-ui="checkbox"
            data-state={state()}
            data-testid={local["data-testid"]}
            style={local.style}
        >
            <input
                aria-label={local["aria-label"]}
                checked={local.checked}
                class="rigged-checkbox__control"
                data-rigged-ui="checkbox-control"
                disabled={local.disabled}
                id={local.id}
                name={local.name}
                onChange={(event) => local.onChange?.(event.currentTarget.checked)}
                ref={(element) => (control = element)}
                type="checkbox"
            />
            <span class="rigged-checkbox__box" data-rigged-ui="checkbox-box">
                <Show
                    fallback={
                        <Show when={local.checked}>
                            <Icon name="check" size={14} />
                        </Show>
                    }
                    when={local.indeterminate}
                >
                    <span class="rigged-checkbox__dash" data-rigged-ui="checkbox-mark" />
                </Show>
            </span>
            <Show when={local.label !== undefined}>
                <span class="rigged-checkbox__label" data-rigged-ui="checkbox-label">
                    {local.label}
                </span>
            </Show>
        </label>
    );
}
