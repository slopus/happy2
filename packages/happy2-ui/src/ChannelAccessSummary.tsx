import { type CSSProperties } from "react";
import { Icon } from "./Icon";
export type ChannelVisibility = "public" | "private";
export type ChannelStewardRole = "creator" | "owner";
export type ChannelAccessSummaryProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    /**
     * Public channels are freely joinable and creator/admin-managed with no
     * owner; listed public channels are discoverable in the directory. Private
     * channels are invite/prior-member constrained and have exactly one owner.
     */
    visibility: ChannelVisibility;
    /**
     * Whether a public top-level channel appears in the directory. Inherited
     * children use their parent-membership rule regardless of this value.
     */
    directoryListed?: boolean;
    /**
     * Present when this channel inherits its visibility from a parent (a child
     * channel). The parent's name is shown, and the summary states that
     * membership and history are independent of the parent.
     */
    inheritedFrom?: string;
    /**
     * The person credited for the channel. For a public channel this is its
     * creator (an admin, never an "owner"); for a private channel this is its
     * owner. Omit when the identity is not resolvable.
     */
    steward?: { name: string };
};
/**
 * A compact, read-only summary of a channel's access model: whether it is public
 * (freely joinable and creator/admin-managed, with listing disclosed separately)
 * or private (invite/prior-member constrained, single owner), who is credited
 * for it, and — for a child channel — that it inherits its parent's visibility
 * while keeping an independent membership and history. It is prop-driven and
 * carries no product logic; the caller resolves visibility, listing, and the
 * credited person. The public/private wording is deliberately exact so a public
 * channel's creator is never mislabeled as an owner.
 */
export function ChannelAccessSummary(props: ChannelAccessSummaryProps) {
    const isPublic = props.visibility === "public";
    const title = isPublic ? "Public channel" : "Private channel";
    const stewardRole: ChannelStewardRole = isPublic ? "creator" : "owner";
    const access = props.inheritedFrom
        ? "Eligible parent members can find and join this subchannel."
        : isPublic
          ? props.directoryListed === false
              ? "This channel is not listed in the directory, but anyone who can reach it can join."
              : "Anyone can find this channel in the directory and join it."
          : "Only people who are invited, or who were members before, can find and join it.";
    return (
        <div
            className={["happy2-channel-access", props.className].filter(Boolean).join(" ")}
            data-happy2-ui="channel-access"
            data-testid={props["data-testid"]}
            data-visibility={props.visibility}
            style={props.style}
        >
            <div className="happy2-channel-access__head" data-happy2-ui="channel-access-head">
                <span
                    aria-hidden="true"
                    className="happy2-channel-access__icon"
                    data-happy2-ui="channel-access-icon"
                >
                    <Icon name={isPublic ? "hash" : "lock"} size={14} />
                </span>
                <span
                    className="happy2-channel-access__title"
                    data-happy2-ui="channel-access-title"
                >
                    {title}
                </span>
            </div>
            <p className="happy2-channel-access__line" data-happy2-ui="channel-access-access">
                {access}
            </p>
            {props.inheritedFrom ? (
                <p
                    className="happy2-channel-access__line"
                    data-happy2-ui="channel-access-inherited"
                >
                    Inherits {props.inheritedFrom}’s visibility. Its membership and history are
                    independent.
                </p>
            ) : null}
            {props.steward ? (
                <p
                    className="happy2-channel-access__line happy2-channel-access__steward"
                    data-happy2-ui="channel-access-steward"
                >
                    {stewardRole === "creator" ? "Created by " : "Owned by "}
                    <span
                        className="happy2-channel-access__steward-name"
                        data-happy2-ui="channel-access-steward-name"
                    >
                        {props.steward.name}
                    </span>
                </p>
            ) : null}
        </div>
    );
}
