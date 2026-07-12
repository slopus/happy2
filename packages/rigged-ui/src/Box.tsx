import { splitProps, type JSX } from "solid-js";
import type { Dimension } from "./dimensions";
import { toCssDimension } from "./dimensions";

export type BoxProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, "style"> & {
    height?: Dimension;
    style?: JSX.CSSProperties;
    width?: Dimension;
};

export function Box(props: BoxProps) {
    const [local, rest] = splitProps(props, ["children", "class", "height", "style", "width"]);

    return (
        <div
            {...rest}
            class={["rigged-box", local.class].filter(Boolean).join(" ")}
            data-rigged-ui="box"
            style={{
                ...local.style,
                ...(local.height === undefined ? {} : { height: toCssDimension(local.height) }),
                ...(local.width === undefined ? {} : { width: toCssDimension(local.width) }),
            }}
        >
            {local.children}
        </div>
    );
}
