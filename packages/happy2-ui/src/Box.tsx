import { splitProps } from "./reactProps";
import { type CSSProperties, type HTMLAttributes } from "react";
import type { Dimension } from "./dimensions";
import { toCssDimension } from "./dimensions";
export type BoxProps = Omit<HTMLAttributes<HTMLDivElement>, "style"> & {
    height?: Dimension;
    style?: CSSProperties;
    width?: Dimension;
};
export function Box(props: BoxProps) {
    const [local, rest] = splitProps(props, ["children", "className", "height", "style", "width"]);
    return (
        <div
            {...rest}
            className={["happy2-box", local.className].filter(Boolean).join(" ")}
            data-happy2-ui="box"
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
