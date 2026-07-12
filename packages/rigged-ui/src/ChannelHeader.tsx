import { For, Show, splitProps, type JSX } from "solid-js";
import { Avatar, type AvatarType, type ToneName } from "./Avatar";
import { Badge } from "./Badge";
import { Icon } from "./Icon";

export type ChannelMember = {
    initials: string;
    tone?: ToneName;
    type?: AvatarType;
};

export type ChannelHeaderProps = Omit<JSX.HTMLAttributes<HTMLElement>, "style"> & {
    actions?: JSX.Element;
    agentCount?: number;
    icon?: "hash" | "spark" | "inbox";
    memberCount?: number;
    members?: ChannelMember[];
    style?: JSX.CSSProperties;
    title: string;
    topic?: string;
};

/**
 * 52px channel context strip that sits at the top of the main app surface:
 * channel icon + title + truncating topic on the left; overlapping member
 * facepile, member count, agent chip, and an actions slot on the right.
 */
export function ChannelHeader(props: ChannelHeaderProps) {
    const [local, rest] = splitProps(props, [
        "actions",
        "agentCount",
        "class",
        "icon",
        "memberCount",
        "members",
        "style",
        "title",
        "topic",
    ]);
    const faces = () => (local.members ?? []).slice(0, 3);

    return (
        <header
            {...rest}
            class={["rigged-channel-header", local.class].filter(Boolean).join(" ")}
            data-rigged-ui="channel-header"
            style={local.style}
        >
            <div class="rigged-channel-header__info" data-rigged-ui="channel-header-info">
                <span class="rigged-channel-header__icon" data-rigged-ui="channel-header-icon">
                    <Icon name={local.icon ?? "hash"} size={16} />
                </span>
                <h2 class="rigged-channel-header__title" data-rigged-ui="channel-header-title">
                    <span class="rigged-channel-header__title-ink">{local.title}</span>
                </h2>
                <Show when={local.topic}>
                    <span
                        aria-hidden="true"
                        class="rigged-channel-header__dot"
                        data-rigged-ui="channel-header-dot"
                    />
                    <span
                        class="rigged-channel-header__topic"
                        data-rigged-ui="channel-header-topic"
                    >
                        <span class="rigged-channel-header__topic-ink">{local.topic}</span>
                    </span>
                </Show>
            </div>
            <div class="rigged-channel-header__meta" data-rigged-ui="channel-header-meta">
                <Show when={faces().length > 0 || local.memberCount !== undefined}>
                    <div
                        class="rigged-channel-header__members"
                        data-rigged-ui="channel-header-members"
                    >
                        <Show when={faces().length > 0}>
                            <div
                                class="rigged-channel-header__facepile"
                                data-rigged-ui="channel-header-facepile"
                            >
                                <For each={faces()}>
                                    {(member) => (
                                        <Avatar
                                            class="rigged-channel-header__face"
                                            initials={member.initials}
                                            size="xs"
                                            tone={member.tone}
                                            type={member.type}
                                        />
                                    )}
                                </For>
                            </div>
                        </Show>
                        <Show when={local.memberCount !== undefined}>
                            <span
                                class="rigged-channel-header__member-count"
                                data-rigged-ui="channel-header-member-count"
                            >
                                <span class="rigged-channel-header__member-count-ink">
                                    {local.memberCount}
                                </span>
                            </span>
                        </Show>
                    </div>
                </Show>
                <Show when={local.agentCount !== undefined}>
                    <Badge
                        class="rigged-channel-header__agents"
                        icon="spark"
                        label={local.agentCount === 1 ? "1 agent" : `${local.agentCount} agents`}
                        variant="accent"
                    />
                </Show>
                <Show when={local.actions}>
                    <div
                        class="rigged-channel-header__actions"
                        data-rigged-ui="channel-header-actions"
                    >
                        {local.actions}
                    </div>
                </Show>
            </div>
        </header>
    );
}
