import { createEffect, createSignal, onCleanup, Show, splitProps, type JSX } from "solid-js";
import { type AvatarType, type ToneName } from "./Avatar";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { Menu, type MenuItem } from "./Menu";

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
    /** Overflow "⋮" menu shown at the right edge. No button renders when empty. */
    menuItems?: MenuItem[];
    menuLabel?: string;
    onMembersClick?: () => void;
    membersLabel?: string;
    onMenuSelect?: (id: string) => void;
    /** Makes the icon+title a button that opens channel/user details. */
    onTitleClick?: () => void;
    /** Star toggle shown before the title. No star renders when omitted. */
    onStarToggle?: () => void;
    starLabel?: string;
    starred?: boolean;
    style?: JSX.CSSProperties;
    title: string;
    titleLabel?: string;
    topic?: string;
};

/**
 * 52px channel context strip at the top of the main app surface, modeled on
 * Slack: an optional leading star toggle, a clickable channel icon + title that
 * opens details, a truncating topic, and a right cluster with a member-count
 * pill, an agent chip, a free actions slot, and an overflow "⋮" menu.
 */
export function ChannelHeader(props: ChannelHeaderProps) {
    const [local, rest] = splitProps(props, [
        "actions",
        "agentCount",
        "class",
        "icon",
        "memberCount",
        "menuItems",
        "menuLabel",
        "onMembersClick",
        "membersLabel",
        "onMenuSelect",
        "onTitleClick",
        "onStarToggle",
        "starLabel",
        "starred",
        "style",
        "title",
        "titleLabel",
        "topic",
    ]);

    const [menuOpen, setMenuOpen] = createSignal(false);
    let root: HTMLElement | undefined;

    const menuActions = () =>
        (local.menuItems ?? []).filter((item) => item.kind === "item").length > 0;
    const hasMenu = () => Boolean(local.onMenuSelect) && menuActions();

    createEffect(() => {
        if (!menuOpen()) return;
        const close = (event: Event) => {
            if (!root?.contains(event.target as Node)) setMenuOpen(false);
        };
        const dismiss = () => setMenuOpen(false);
        document.addEventListener("pointerdown", close);
        window.addEventListener("resize", dismiss);
        onCleanup(() => {
            document.removeEventListener("pointerdown", close);
            window.removeEventListener("resize", dismiss);
        });
    });

    const titleInner = (
        <>
            <span class="rigged-channel-header__icon" data-rigged-ui="channel-header-icon">
                <Icon name={local.icon ?? "hash"} size={16} />
            </span>
            <span class="rigged-channel-header__title" data-rigged-ui="channel-header-title">
                <span class="rigged-channel-header__title-ink">{local.title}</span>
            </span>
        </>
    );

    return (
        <header
            {...rest}
            class={["rigged-channel-header", local.class].filter(Boolean).join(" ")}
            data-rigged-ui="channel-header"
            onKeyDown={(event) => {
                if (event.key === "Escape") setMenuOpen(false);
            }}
            ref={(element) => (root = element)}
            style={local.style}
        >
            <div class="rigged-channel-header__info" data-rigged-ui="channel-header-info">
                <Show when={local.onStarToggle}>
                    {(toggle) => (
                        <button
                            aria-label={local.starLabel ?? (local.starred ? "Unstar" : "Star")}
                            aria-pressed={local.starred ? "true" : "false"}
                            class="rigged-channel-header__star"
                            data-rigged-ui="channel-header-star"
                            data-starred={local.starred ? "" : undefined}
                            onClick={() => toggle()()}
                            type="button"
                        >
                            <Icon name="star" size={16} />
                        </button>
                    )}
                </Show>
                <Show
                    fallback={
                        <h2
                            class="rigged-channel-header__lead"
                            data-rigged-ui="channel-header-lead"
                        >
                            {titleInner}
                        </h2>
                    }
                    when={local.onTitleClick}
                >
                    {(open) => (
                        <button
                            aria-label={local.titleLabel ?? `Open ${local.title} details`}
                            class="rigged-channel-header__lead rigged-channel-header__lead--button"
                            data-rigged-ui="channel-header-lead"
                            onClick={() => open()()}
                            type="button"
                        >
                            {titleInner}
                        </button>
                    )}
                </Show>
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
                <Show when={local.memberCount !== undefined}>
                    {(_) => {
                        const label = () =>
                            local.membersLabel ??
                            `${local.memberCount} ${local.memberCount === 1 ? "member" : "members"}`;
                        const inner = (
                            <>
                                <Icon name="users" size={16} />
                                <span
                                    class="rigged-channel-header__member-count"
                                    data-rigged-ui="channel-header-member-count"
                                >
                                    <span class="rigged-channel-header__member-count-ink">
                                        {local.memberCount}
                                    </span>
                                </span>
                            </>
                        );
                        return (
                            <Show
                                fallback={
                                    <span
                                        class="rigged-channel-header__members"
                                        data-rigged-ui="channel-header-members"
                                    >
                                        {inner}
                                    </span>
                                }
                                when={local.onMembersClick}
                            >
                                {(click) => (
                                    <button
                                        aria-label={label()}
                                        class="rigged-channel-header__members rigged-channel-header__members--button"
                                        data-rigged-ui="channel-header-members"
                                        onClick={() => click()()}
                                        type="button"
                                    >
                                        {inner}
                                    </button>
                                )}
                            </Show>
                        );
                    }}
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
                <Show when={hasMenu()}>
                    <div class="rigged-channel-header__menu" data-rigged-ui="channel-header-menu">
                        <Button
                            aria-expanded={menuOpen()}
                            aria-haspopup="menu"
                            aria-label={local.menuLabel ?? "Channel menu"}
                            icon="more"
                            iconOnly
                            onClick={() => setMenuOpen((open) => !open)}
                            size="small"
                            variant="ghost"
                        />
                        <Show when={menuOpen()}>
                            <div
                                class="rigged-channel-header__menu-popover"
                                data-rigged-ui="channel-header-menu-popover"
                            >
                                <Menu
                                    items={local.menuItems ?? []}
                                    onSelect={(id) => {
                                        setMenuOpen(false);
                                        local.onMenuSelect?.(id);
                                    }}
                                    width={216}
                                />
                            </div>
                        </Show>
                    </div>
                </Show>
            </div>
        </header>
    );
}
