import { splitProps, type JSX } from "solid-js";

export type AvatarType = "bot" | "human";
export type AvatarSize = "md" | "sm" | "xs";

export type AvatarProps = Omit<JSX.HTMLAttributes<HTMLSpanElement>, "children" | "style"> & {
    backgroundClass?: string;
    imageUrl?: string;
    initials: string;
    label?: string;
    online?: boolean;
    size?: AvatarSize;
    style?: JSX.CSSProperties;
    type?: AvatarType;
};

export function Avatar(props: AvatarProps) {
    const [local, rest] = splitProps(props, [
        "backgroundClass",
        "class",
        "imageUrl",
        "initials",
        "label",
        "online",
        "size",
        "style",
        "type",
    ]);
    const type = () => local.type ?? "human";
    const size = () => local.size ?? "sm";

    return (
        <span
            {...rest}
            class={["rigged-avatar", local.backgroundClass, local.class].filter(Boolean).join(" ")}
            data-rigged-ui="avatar"
            data-size={size()}
            data-type={type()}
            style={local.style}
            role={local.label ? "img" : undefined}
            aria-label={local.label}
            aria-hidden={local.label ? undefined : "true"}
        >
            {local.imageUrl ? (
                <img class="rigged-avatar__image" src={local.imageUrl} alt="" />
            ) : (
                <span class="rigged-avatar__initials" data-rigged-ui="avatar-initials">
                    {local.initials}
                </span>
            )}
            {local.online && (
                <span
                    class="rigged-avatar__presence"
                    data-rigged-ui="avatar-presence"
                    aria-hidden="true"
                />
            )}
        </span>
    );
}
