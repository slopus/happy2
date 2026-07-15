import { splitProps, type JSX } from "solid-js";

export type AvatarSize = "xs" | "sm" | "md" | "lg";
export type AvatarType = "human" | "agent";
export type ToneName = "violet" | "ember" | "mint" | "ocean" | "rose" | "amber" | "slate" | "brand";

export type AvatarProps = Omit<JSX.HTMLAttributes<HTMLSpanElement>, "style"> & {
    imageUrl?: string;
    initials: string;
    online?: boolean;
    size?: AvatarSize;
    style?: JSX.CSSProperties;
    tone?: ToneName;
    type?: AvatarType;
};

export function Avatar(props: AvatarProps) {
    const [local, rest] = splitProps(props, [
        "children",
        "class",
        "imageUrl",
        "initials",
        "online",
        "size",
        "style",
        "tone",
        "type",
    ]);
    const size = () => local.size ?? "md";
    const type = () => local.type ?? "human";
    const tone = () => local.tone ?? "slate";

    return (
        <span
            {...rest}
            class={["happy2-avatar", local.class].filter(Boolean).join(" ")}
            data-happy2-ui="avatar"
            data-size={size()}
            data-tone={tone()}
            data-type={type()}
            style={local.style}
            role={props["aria-label"] ? "img" : undefined}
            aria-hidden={props["aria-label"] ? undefined : "true"}
        >
            {local.imageUrl ? (
                <img
                    class="happy2-avatar__image"
                    data-happy2-ui="avatar-image"
                    src={local.imageUrl}
                    alt=""
                    draggable={false}
                />
            ) : (
                <span class="happy2-avatar__initials" data-happy2-ui="avatar-initials">
                    {local.initials}
                </span>
            )}
            {local.online && (
                <span
                    class="happy2-avatar__presence"
                    data-happy2-ui="avatar-presence"
                    aria-hidden="true"
                />
            )}
        </span>
    );
}
