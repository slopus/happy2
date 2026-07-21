import { partitionComponentProps } from "./componentProps";
import { type CSSProperties, type HTMLAttributes } from "react";
export type AvatarSize = "xs" | "sm" | "md" | "lg";
export type AvatarType = "human" | "agent";
export type ToneName = "violet" | "ember" | "mint" | "ocean" | "rose" | "amber" | "slate" | "brand";
export type AvatarProps = Omit<HTMLAttributes<HTMLSpanElement>, "style"> & {
    imageUrl?: string;
    initials: string;
    online?: boolean;
    size?: AvatarSize;
    style?: CSSProperties;
    tone?: ToneName;
    type?: AvatarType;
};
export function Avatar(props: AvatarProps) {
    const [local, rest] = partitionComponentProps(props, [
        "children",
        "className",
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
            className={["happy2-avatar", local.className].filter(Boolean).join(" ")}
            data-image={local.imageUrl ? "" : undefined}
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
                    className="happy2-avatar__image"
                    data-happy2-ui="avatar-image"
                    src={local.imageUrl}
                    alt=""
                    draggable={false}
                />
            ) : (
                <span className="happy2-avatar__initials" data-happy2-ui="avatar-initials">
                    {local.initials}
                </span>
            )}
            {local.online && (
                <span
                    className="happy2-avatar__presence"
                    data-happy2-ui="avatar-presence"
                    aria-hidden="true"
                />
            )}
        </span>
    );
}
