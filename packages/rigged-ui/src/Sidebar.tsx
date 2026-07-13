import { For, Show, splitProps, type JSX } from "solid-js";
import { Avatar, type ToneName } from "./Avatar";
import { CountBadge } from "./Badge";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";

export type SidebarItem = {
    badge?: number;
    icon?: IconName;
    id: string;
    initials?: string;
    kind: "view" | "channel" | "person" | "agent" | "action";
    label: string;
    meta?: string;
    online?: boolean;
    status?: "ready" | "working";
    tone?: ToneName;
};

export type SidebarSection = {
    action?: { icon: IconName; label: string };
    empty?: { actionLabel: string; description: string };
    id: string;
    items: SidebarItem[];
    label?: string;
};

export type SidebarProps = Omit<JSX.HTMLAttributes<HTMLElement>, "style"> & {
    activeItemId: string;
    composeLabel?: string;
    footer?: JSX.Element;
    onCompose?: () => void;
    onItemSelect: (id: string) => void;
    onSectionAction?: (sectionId: string) => void;
    sections: SidebarSection[];
    style?: JSX.CSSProperties;
    subtitle?: string;
    title: string;
};

function leadingIcon(item: SidebarItem): IconName {
    if (item.kind === "channel") return "hash";
    if (item.kind === "action") return item.icon ?? "plus";
    return item.icon ?? "inbox";
}

function SidebarRow(props: { active: boolean; item: SidebarItem; onSelect: (id: string) => void }) {
    const item = () => props.item;
    const unread = () => (item().badge ?? 0) > 0;
    const showStatus = () => item().kind === "agent" && item().status !== undefined && !unread();
    const showMeta = () => item().meta !== undefined && !unread() && !showStatus();

    return (
        <button
            aria-current={props.active ? "page" : undefined}
            class="rigged-sidebar__item"
            data-active={props.active ? "" : undefined}
            data-item-id={item().id}
            data-kind={item().kind}
            data-rigged-ui="sidebar-item"
            data-unread={unread() ? "" : undefined}
            onClick={() => props.onSelect(item().id)}
            type="button"
        >
            <span class="rigged-sidebar__item-leading" data-rigged-ui="sidebar-item-leading">
                <Show
                    when={item().kind === "person" || item().kind === "agent"}
                    fallback={<Icon name={leadingIcon(item())} size={16} />}
                >
                    <Avatar
                        initials={item().initials ?? item().label.slice(0, 1).toUpperCase()}
                        online={item().kind === "person" ? item().online : undefined}
                        size="xs"
                        tone={item().tone}
                        type={item().kind === "agent" ? "agent" : "human"}
                    />
                </Show>
            </span>
            <span class="rigged-sidebar__item-label" data-rigged-ui="sidebar-item-label">
                {item().label}
            </span>
            <Show when={unread()}>
                <CountBadge class="rigged-sidebar__item-badge" count={item().badge!} />
            </Show>
            <Show when={showStatus()}>
                <Show when={item().status === "working"}>
                    <span
                        class="rigged-sidebar__item-working"
                        data-rigged-ui="sidebar-item-working"
                    >
                        working
                    </span>
                </Show>
                <span
                    aria-hidden="true"
                    class="rigged-sidebar__item-status"
                    data-rigged-ui="sidebar-item-status"
                    data-status={item().status}
                />
            </Show>
            <Show when={showMeta()}>
                <span class="rigged-sidebar__item-meta" data-rigged-ui="sidebar-item-meta">
                    {item().meta}
                </span>
            </Show>
        </button>
    );
}

/**
 * C-009 Sidebar — 288px navigation column on the chrome surface. Header with
 * workspace title, scrollable sectioned rows (views, channels, people, agents,
 * actions), actionable empty-section guidance, and an optional pinned footer.
 */
export function Sidebar(props: SidebarProps) {
    const [local, rest] = splitProps(props, [
        "activeItemId",
        "class",
        "composeLabel",
        "footer",
        "onCompose",
        "onItemSelect",
        "onSectionAction",
        "sections",
        "style",
        "subtitle",
        "title",
    ]);

    return (
        <nav
            {...rest}
            class={["rigged-sidebar", local.class].filter(Boolean).join(" ")}
            data-rigged-ui="sidebar"
            style={local.style}
        >
            <header class="rigged-sidebar__header" data-rigged-ui="sidebar-header">
                <div class="rigged-sidebar__heading" data-rigged-ui="sidebar-heading">
                    <span class="rigged-sidebar__title-row">
                        <span class="rigged-sidebar__title" data-rigged-ui="sidebar-title">
                            {local.title}
                        </span>
                        <span class="rigged-sidebar__title-chevron" aria-hidden="true">
                            <Icon name="chevron-down" size={14} />
                        </span>
                    </span>
                    <Show when={local.subtitle}>
                        <span class="rigged-sidebar__subtitle" data-rigged-ui="sidebar-subtitle">
                            {local.subtitle}
                        </span>
                    </Show>
                </div>
                <Button
                    aria-label={local.composeLabel ?? "New message"}
                    class="rigged-sidebar__compose"
                    icon="edit"
                    iconOnly
                    onClick={local.onCompose}
                    size="small"
                    variant="ghost"
                />
            </header>
            <div class="rigged-sidebar__body" data-rigged-ui="sidebar-body">
                <For each={local.sections}>
                    {(section) => (
                        <section
                            class="rigged-sidebar__section"
                            data-rigged-ui="sidebar-section"
                            data-section-id={section.id}
                        >
                            <Show when={section.label}>
                                <div
                                    class="rigged-sidebar__section-head"
                                    data-rigged-ui="sidebar-section-head"
                                >
                                    <span
                                        class="rigged-sidebar__section-label"
                                        data-rigged-ui="sidebar-section-label"
                                    >
                                        {section.label}
                                    </span>
                                    <Show when={section.action}>
                                        {(action) => (
                                            <button
                                                aria-label={action().label}
                                                class="rigged-sidebar__section-action"
                                                data-rigged-ui="sidebar-section-action"
                                                onClick={() => local.onSectionAction?.(section.id)}
                                                type="button"
                                            >
                                                <Icon name={action().icon} size={12} />
                                            </button>
                                        )}
                                    </Show>
                                </div>
                            </Show>
                            <For each={section.items}>
                                {(item) => (
                                    <SidebarRow
                                        active={item.id === local.activeItemId}
                                        item={item}
                                        onSelect={local.onItemSelect}
                                    />
                                )}
                            </For>
                            <Show when={section.items.length === 0 ? section.empty : undefined}>
                                {(empty) => (
                                    <div
                                        class="rigged-sidebar__empty"
                                        data-rigged-ui="sidebar-section-empty"
                                    >
                                        <span
                                            class="rigged-sidebar__empty-description"
                                            data-rigged-ui="sidebar-section-empty-description"
                                        >
                                            {empty().description}
                                        </span>
                                        <Button
                                            class="rigged-sidebar__empty-action"
                                            icon={section.action?.icon ?? "plus"}
                                            onClick={() => local.onSectionAction?.(section.id)}
                                            size="small"
                                            variant="secondary"
                                        >
                                            {empty().actionLabel}
                                        </Button>
                                    </div>
                                )}
                            </Show>
                        </section>
                    )}
                </For>
            </div>
            <Show when={local.footer}>
                <footer class="rigged-sidebar__footer" data-rigged-ui="sidebar-footer">
                    {local.footer}
                </footer>
            </Show>
        </nav>
    );
}
