import { partitionComponentProps } from "./componentProps";
import { type CSSProperties, type HTMLAttributes } from "react";
import type { Dimension } from "./dimensions";
import { toCssDimension } from "./dimensions";
export type BoxProps = Omit<HTMLAttributes<HTMLDivElement>, "style"> & {
    height?: Dimension;
    style?: CSSProperties;
    width?: Dimension;
};
export function Box(props: BoxProps) {
    const [local, rest] = partitionComponentProps(props, [
        "children",
        "className",
        "height",
        "style",
        "width",
    ]);
    return (
        <div
            {...rest}
            className={["happy2-box", local.className].filter(Boolean).join(" ")}
            /* A composing component's explicit part marker must survive so its
               measurable parts stay addressable; plain boxes keep the generic
               marker. */
            data-happy2-ui={
                ((rest as Record<string, unknown>)["data-happy2-ui"] as string | undefined) ?? "box"
            }
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
