import { Show, splitProps, type JSX } from "solid-js";
import { Avatar, type AvatarSize, type ToneName } from "./Avatar";

export type ProfileCardSize = "compact" | "full";
export type ProfilePresence = "online" | "offline";
export type ProfileStatus = { emoji?: string; text?: string };

export type ProfileCardProps = {
    class?: string;
    "data-testid"?: string;
    style?: JSX.CSSProperties;
    name: string;
    username: string;
    title?: string;
    tone?: ToneName;
    imageUrl?: string;
    initials: string;
    presence?: ProfilePresence;
    status?: ProfileStatus;
    actions?: JSX.Element;
    size?: ProfileCardSize;
};

const avatarSizes: Record<ProfileCardSize, AvatarSize> = {
    compact: "md",
    full: "lg",
};

/**
 * C-033 ProfileCard — profile header. An identity mark (Avatar + presence dot),
 * the person's name with their @username on a shared baseline, an optional
 * title, an optional status pill (emoji slot + text), and a right-aligned
 * actions slot. `size` scales the avatar and outer density (full: lg avatar /
 * 16px padding, compact: md avatar / 12px padding); typography is shared so a
 * row of cards keeps one name/username baseline. Colours are tokens only.
 */
export function ProfileCard(props: ProfileCardProps) {
    const [local] = splitProps(props, [
        "class",
        "data-testid",
        "style",
        "name",
        "username",
        "title",
        "tone",
        "imageUrl",
        "initials",
        "presence",
        "status",
        "actions",
        "size",
    ]);
    const size = () => local.size ?? "full";
    const hasStatus = () => Boolean(local.status && (local.status.emoji || local.status.text));

    return (
        <div
            class={["rigged-profile-card", local.class].filter(Boolean).join(" ")}
            data-rigged-ui="profile-card"
            data-size={size()}
            data-testid={local["data-testid"]}
            style={local.style}
        >
            <Avatar
                class="rigged-profile-card__avatar"
                imageUrl={local.imageUrl}
                initials={local.initials}
                online={local.presence === "online" ? true : undefined}
                size={avatarSizes[size()]}
                tone={local.tone}
            />

            <div class="rigged-profile-card__body" data-rigged-ui="profile-card-body">
                <div class="rigged-profile-card__identity" data-rigged-ui="profile-card-identity">
                    <span class="rigged-profile-card__name" data-rigged-ui="profile-card-name">
                        {local.name}
                    </span>
                    <span
                        class="rigged-profile-card__username"
                        data-rigged-ui="profile-card-username"
                    >
                        @{local.username}
                    </span>
                </div>

                <Show when={local.title}>
                    <span class="rigged-profile-card__title" data-rigged-ui="profile-card-title">
                        {local.title}
                    </span>
                </Show>

                <Show when={hasStatus()}>
                    <span class="rigged-profile-card__status" data-rigged-ui="profile-card-status">
                        <Show when={local.status?.emoji}>
                            {(emoji) => (
                                <span
                                    class="rigged-profile-card__status-emoji"
                                    data-rigged-ui="profile-card-status-emoji"
                                >
                                    <span
                                        class="rigged-profile-card__status-emoji-glyph"
                                        data-rigged-ui="profile-card-status-emoji-glyph"
                                    >
                                        {emoji()}
                                    </span>
                                </span>
                            )}
                        </Show>
                        <Show when={local.status?.text}>
                            <span
                                class="rigged-profile-card__status-text"
                                data-rigged-ui="profile-card-status-text"
                            >
                                {local.status?.text}
                            </span>
                        </Show>
                    </span>
                </Show>
            </div>

            <Show when={local.actions}>
                <div class="rigged-profile-card__actions" data-rigged-ui="profile-card-actions">
                    {local.actions}
                </div>
            </Show>
        </div>
    );
}
