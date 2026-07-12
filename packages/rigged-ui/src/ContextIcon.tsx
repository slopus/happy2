import { splitProps, type JSX } from "solid-js";

export type ContextKind = "file" | "run" | "thread";

export type ContextItem = {
    detail: string;
    id: string;
    kind: ContextKind;
    label: string;
};

export type ContextIconProps = Omit<
    JSX.SvgSVGAttributes<SVGSVGElement>,
    "children" | "color" | "style"
> & {
    color?: string;
    kind: ContextKind;
    label?: string;
    size?: number;
    style?: JSX.CSSProperties;
};

const artwork: Record<ContextKind, string> = {
    file: "M6.5 3.5h11v17h-11zM9 8h6M9 12h6M9 16h6",
    run: "M8.25 4.5 20.25 12l-12 7.5z",
    thread: "M5 3.5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-5l-2 4-2-4H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z",
};

export function ContextIcon(props: ContextIconProps) {
    const [local, rest] = splitProps(props, ["color", "kind", "label", "size", "style"]);
    const size = () => local.size ?? 14;

    return (
        <svg
            {...rest}
            data-rigged-ui="context-icon"
            data-kind={local.kind}
            viewBox="0 0 24 24"
            role={local.label ? "img" : undefined}
            aria-label={local.label}
            aria-hidden={local.label ? undefined : "true"}
            style={{
                "box-sizing": "border-box",
                color: local.color ?? "currentColor",
                display: "block",
                "flex-shrink": "0",
                height: `${size()}px`,
                overflow: "visible",
                width: `${size()}px`,
                ...local.style,
            }}
        >
            <path
                data-rigged-ui="context-icon-artwork"
                d={artwork[local.kind]}
                transform={
                    local.kind === "thread"
                        ? "translate(0 2)"
                        : local.kind === "run"
                          ? "translate(-0.25 0)"
                          : undefined
                }
                fill={local.kind === "run" ? "currentColor" : "none"}
                stroke={local.kind === "run" ? "none" : "currentColor"}
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
                vector-effect="non-scaling-stroke"
            />
        </svg>
    );
}
