import { splitProps } from "./reactProps";
import { type CSSProperties, type ReactNode } from "react";
import { Avatar, type AvatarSize, type ToneName } from "./Avatar";
export type ProfileCardSize = "compact" | "full";
export type ProfilePresence = "online" | "offline";
export type ProfileStatus = {
    emoji?: string;
    text?: string;
};
export type ProfileCardProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    name: string;
    username: string;
    title?: string;
    tone?: ToneName;
    imageUrl?: string;
    initials: string;
    presence?: ProfilePresence;
    status?: ProfileStatus;
    actions?: ReactNode;
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
        "className",
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
            className={["happy2-profile-card", local.className].filter(Boolean).join(" ")}
            data-happy2-ui="profile-card"
            data-size={size()}
            data-testid={local["data-testid"]}
            style={local.style}
        >
            <Avatar
                className="happy2-profile-card__avatar"
                imageUrl={local.imageUrl}
                initials={local.initials}
                online={local.presence === "online" ? true : undefined}
                size={avatarSizes[size()]}
                tone={local.tone}
            />

            <div className="happy2-profile-card__body" data-happy2-ui="profile-card-body">
                <div
                    className="happy2-profile-card__identity"
                    data-happy2-ui="profile-card-identity"
                >
                    <span className="happy2-profile-card__name" data-happy2-ui="profile-card-name">
                        {local.name}
                    </span>
                    <span
                        className="happy2-profile-card__username"
                        data-happy2-ui="profile-card-username"
                    >
                        @{local.username}
                    </span>
                </div>

                {local.title ? (
                    <span
                        className="happy2-profile-card__title"
                        data-happy2-ui="profile-card-title"
                    >
                        {local.title}
                    </span>
                ) : null}

                {hasStatus() ? (
                    <span
                        className="happy2-profile-card__status"
                        data-happy2-ui="profile-card-status"
                    >
                        {local.status?.emoji
                            ? ((emoji) => (
                                  <span
                                      className="happy2-profile-card__status-emoji"
                                      data-happy2-ui="profile-card-status-emoji"
                                  >
                                      <span
                                          className="happy2-profile-card__status-emoji-glyph"
                                          data-happy2-ui="profile-card-status-emoji-glyph"
                                      >
                                          {emoji}
                                      </span>
                                  </span>
                              ))(local.status?.emoji)
                            : null}
                        {local.status?.text ? (
                            <span
                                className="happy2-profile-card__status-text"
                                data-happy2-ui="profile-card-status-text"
                            >
                                {local.status?.text}
                            </span>
                        ) : null}
                    </span>
                ) : null}
            </div>

            {local.actions ? (
                <div className="happy2-profile-card__actions" data-happy2-ui="profile-card-actions">
                    {local.actions}
                </div>
            ) : null}
        </div>
    );
}
