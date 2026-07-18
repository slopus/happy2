import { splitProps } from "./reactProps";
import { type ButtonHTMLAttributes, type CSSProperties } from "react";
import type { Dimension } from "./dimensions";
import { toCssDimension } from "./dimensions";
import { Icon, type IconName } from "./Icon";
export type ButtonSize = "small" | "medium" | "large";
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "style"> & {
    fullWidth?: boolean;
    icon?: IconName;
    iconOnly?: boolean;
    size?: ButtonSize;
    style?: CSSProperties;
    variant?: ButtonVariant;
    width?: Dimension;
};
const iconSizes: Record<ButtonSize, 14 | 16 | 18> = {
    small: 14,
    medium: 16,
    large: 18,
};
export function Button(props: ButtonProps) {
    const [local, rest] = splitProps(props, [
        "children",
        "className",
        "fullWidth",
        "icon",
        "iconOnly",
        "size",
        "style",
        "type",
        "variant",
        "width",
    ]);
    const size = () => local.size ?? "medium";
    const variant = () => local.variant ?? "primary";
    return (
        <button
            {...rest}
            className={["happy2-button", local.className].filter(Boolean).join(" ")}
            data-icon-only={local.iconOnly ? "" : undefined}
            data-happy2-ui="button"
            data-size={size()}
            data-variant={variant()}
            style={{
                ...local.style,
                ...(local.fullWidth
                    ? { width: "100%" }
                    : local.width === undefined
                      ? {}
                      : { width: toCssDimension(local.width) }),
            }}
            type={local.type ?? "button"}
        >
            <span className="happy2-button__content" data-happy2-ui="button-content">
                {local.icon
                    ? ((name) => (
                          <span className="happy2-button__icon" data-happy2-ui="button-icon">
                              <Icon name={name} size={iconSizes[size()]} />
                          </span>
                      ))(local.icon)
                    : null}
                {!local.iconOnly ? (
                    <span className="happy2-button__label" data-happy2-ui="button-label">
                        {local.children}
                    </span>
                ) : null}
            </span>
        </button>
    );
}
