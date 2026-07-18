import { splitProps } from "./reactProps";
import { type CSSProperties, type ReactNode } from "react";
export type FormRowLayout = "inline" | "stacked";
export type FormRowAlign = "start" | "center";
export type FormRowProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    label: string;
    description?: string;
    htmlFor?: string;
    control: ReactNode;
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
        "className",
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
            className={["happy2-form-row", local.className].filter(Boolean).join(" ")}
            data-align={align()}
            data-layout={layout()}
            data-happy2-ui="form-row"
            style={local.style}
        >
            <div className="happy2-form-row__text" data-happy2-ui="form-row-text">
                <label
                    className="happy2-form-row__label"
                    data-happy2-ui="form-row-label"
                    htmlFor={local.htmlFor}
                >
                    {local.label}
                </label>
                {local.description ? (
                    <span
                        className="happy2-form-row__description"
                        data-happy2-ui="form-row-description"
                    >
                        {local.description}
                    </span>
                ) : null}
            </div>
            <div className="happy2-form-row__control" data-happy2-ui="form-row-control">
                {local.control}
            </div>
        </div>
    );
}
