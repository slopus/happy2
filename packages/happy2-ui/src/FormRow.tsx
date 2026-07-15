import { Show, splitProps, type JSX } from "solid-js";

export type FormRowLayout = "inline" | "stacked";
export type FormRowAlign = "start" | "center";

export type FormRowProps = {
    class?: string;
    "data-testid"?: string;
    style?: JSX.CSSProperties;
    label: string;
    description?: string;
    htmlFor?: string;
    control: JSX.Element;
    layout?: FormRowLayout;
    align?: FormRowAlign;
};

/**
 * C-029 FormRow — a settings row. A left-aligned label + optional muted
 * description on the leading side and a trailing control slot (a TextField,
 * Select, Switch, Button, …). `inline` places the control to the right of the
 * text; `stacked` places it on its own line below the text. A hairline bottom
 * divider lets rows stack into a settings list without extra chrome.
 */
export function FormRow(props: FormRowProps) {
    const [local, rest] = splitProps(props, [
        "align",
        "class",
        "control",
        "description",
        "htmlFor",
        "label",
        "layout",
        "style",
    ]);
    const layout = () => local.layout ?? "inline";
    const align = () => local.align ?? "center";

    return (
        <div
            {...rest}
            class={["happy2-form-row", local.class].filter(Boolean).join(" ")}
            data-align={align()}
            data-layout={layout()}
            data-happy2-ui="form-row"
            style={local.style}
        >
            <div class="happy2-form-row__text" data-happy2-ui="form-row-text">
                <label
                    class="happy2-form-row__label"
                    data-happy2-ui="form-row-label"
                    for={local.htmlFor}
                >
                    {local.label}
                </label>
                <Show when={local.description}>
                    <span
                        class="happy2-form-row__description"
                        data-happy2-ui="form-row-description"
                    >
                        {local.description}
                    </span>
                </Show>
            </div>
            <div class="happy2-form-row__control" data-happy2-ui="form-row-control">
                {local.control}
            </div>
        </div>
    );
}
