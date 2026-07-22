import { type CSSProperties } from "react";
import { Button } from "./Button";
import { Icon } from "./Icon";
import type { ChannelVisibility } from "./ChannelAccessSummary";

/** One joinable channel projected from a directory; it intentionally excludes chat history. */
export interface ChannelDirectoryItem {
    id: string;
    name: string;
    visibility: ChannelVisibility;
    /** Project context remains visible when the directory spans multiple projects. */
    projectName?: string;
    /** Present for a child channel so its parent context remains discoverable. */
    parentName?: string;
}

export interface ChannelDirectoryListProps {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    channels: readonly ChannelDirectoryItem[];
    /** The in-flight row id; all Join controls pause until the action settles. */
    joiningId?: string;
    /** A displayable failure from the most recent explicit join action. */
    error?: string;
    onJoin(channelId: string): void;
}

/**
 * A reusable, history-free directory of eligible channels. Each stable channel
 * row communicates its public/private access and optional parent context, then
 * offers an explicit Join action rather than selecting a non-member preview.
 */
export function ChannelDirectoryList(props: ChannelDirectoryListProps) {
    return (
        <div
            className={["happy2-channel-directory-list", props.className].filter(Boolean).join(" ")}
            data-happy2-ui="channel-directory-list"
            data-testid={props["data-testid"]}
            style={props.style}
        >
            {props.channels.map((channel) => {
                const joining = props.joiningId === channel.id;
                const isPublic = channel.visibility === "public";
                return (
                    <div
                        className="happy2-channel-directory-list__row"
                        data-channel-id={channel.id}
                        data-happy2-ui="channel-directory-row"
                        data-visibility={channel.visibility}
                        key={channel.id}
                    >
                        <span
                            aria-hidden="true"
                            className="happy2-channel-directory-list__icon"
                            data-happy2-ui="channel-directory-row-icon"
                        >
                            <Icon name={isPublic ? "hash" : "lock"} size={16} />
                        </span>
                        <span
                            className="happy2-channel-directory-list__body"
                            data-happy2-ui="channel-directory-row-body"
                        >
                            <span
                                className="happy2-channel-directory-list__name"
                                data-happy2-ui="channel-directory-row-name"
                            >
                                {channel.name}
                            </span>
                            <span
                                className="happy2-channel-directory-list__meta"
                                data-happy2-ui="channel-directory-row-meta"
                            >
                                {channel.projectName ? `${channel.projectName} · ` : ""}
                                {isPublic ? "Public" : "Private"}
                                {channel.parentName ? ` · Inherits #${channel.parentName}` : ""}
                            </span>
                        </span>
                        <Button
                            aria-label={`Join ${channel.name}`}
                            disabled={props.joiningId !== undefined}
                            onClick={() => props.onJoin(channel.id)}
                            size="small"
                            variant="secondary"
                        >
                            {joining ? "Joining…" : "Join"}
                        </Button>
                    </div>
                );
            })}
            {props.error ? (
                <div
                    className="happy2-channel-directory-list__error"
                    data-happy2-ui="channel-directory-error"
                    role="alert"
                >
                    {props.error}
                </div>
            ) : null}
        </div>
    );
}
