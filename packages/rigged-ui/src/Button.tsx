import { splitProps, type JSX } from "solid-js";
import type { Dimension } from "./dimensions";
import { toCssDimension } from "./dimensions";

export type ButtonSize = "small" | "medium" | "large";
export type ButtonVariant = "primary" | "secondary" | "ghost";

export type ButtonProps = Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, "style"> & {
    fullWidth?: boolean;
    size?: ButtonSize;
    style?: JSX.CSSProperties;
    variant?: ButtonVariant;
    width?: Dimension;
};

export function Button(props: ButtonProps) {
    const [local, rest] = splitProps(props, [
        "children",
        "class",
        "fullWidth",
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
                {local.children}
            </span>
        </button>
    );
}
