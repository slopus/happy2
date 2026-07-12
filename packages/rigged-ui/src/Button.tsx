import { Show, splitProps, type JSX } from "solid-js";
import type { Dimension } from "./dimensions";
import { toCssDimension } from "./dimensions";
import { Icon, type IconName } from "./Icon";

export type ButtonSize = "small" | "medium" | "large";
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";

export type ButtonProps = Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, "style"> & {
    fullWidth?: boolean;
    icon?: IconName;
    iconOnly?: boolean;
    size?: ButtonSize;
    style?: JSX.CSSProperties;
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
        "class",
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
            class={["rigged-button", local.class].filter(Boolean).join(" ")}
            data-icon-only={local.iconOnly ? "" : undefined}
            data-rigged-ui="button"
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
            <span class="rigged-button__content" data-rigged-ui="button-content">
                <Show when={local.icon}>
                    {(name) => (
                        <span class="rigged-button__icon" data-rigged-ui="button-icon">
                            <Icon name={name()} size={iconSizes[size()]} />
                        </span>
                    )}
                </Show>
                <Show when={!local.iconOnly}>
                    <span class="rigged-button__label" data-rigged-ui="button-label">
                        {local.children}
                    </span>
                </Show>
            </span>
        </button>
    );
}
