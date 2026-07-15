import { For, Show, splitProps, type JSX } from "solid-js";
import { CountBadge } from "./Badge";
import { Icon, type IconName } from "./Icon";

export type TabsSize = "small" | "medium" | "large";
export type TabItem = { id: string; label: string; icon?: IconName; badge?: number };

export type TabsProps = {
    class?: string;
    "data-testid"?: string;
    style?: JSX.CSSProperties;
    activeId: string;
    onSelect: (id: string) => void;
    tabs: TabItem[];
    size?: TabsSize;
};

const iconSizes: Record<TabsSize, 14 | 16 | 18> = {
    small: 14,
    medium: 16,
    large: 18,
};

/**
 * C-025 Tabs — horizontal tab bar on a bottom hairline. Each tab is a `role=tab`
 * button that optionally carries a leading Icon and a trailing CountBadge; the
 * active tab paints a 2px accent underline that overlaps the container hairline
 * and switches its label/icon to the primary text color. Sizes 32/40/48 high.
 */
export function Tabs(props: TabsProps) {
    const [local, rest] = splitProps(props, [
        "class",
        "style",
        "activeId",
        "onSelect",
        "tabs",
        "size",
    ]);
    const size = () => local.size ?? "medium";

    return (
        <div
            {...rest}
            class={["happy2-tabs", local.class].filter(Boolean).join(" ")}
            data-happy2-ui="tabs"
            data-size={size()}
            role="tablist"
            style={local.style}
        >
            <For each={local.tabs}>
                {(tab) => {
                    const active = () => tab.id === local.activeId;
                    return (
                        <button
                            aria-selected={active() ? "true" : "false"}
                            class="happy2-tabs__tab"
                            data-active={active() ? "" : undefined}
                            data-happy2-ui="tab"
                            data-tab-id={tab.id}
                            onClick={() => local.onSelect(tab.id)}
                            role="tab"
                            type="button"
                        >
                            <Show when={tab.icon}>
                                {(name) => (
                                    <span class="happy2-tabs__tab-icon" data-happy2-ui="tab-icon">
                                        <Icon name={name()} size={iconSizes[size()]} />
                                    </span>
                                )}
                            </Show>
                            <span class="happy2-tabs__tab-label" data-happy2-ui="tab-label">
                                {tab.label}
                            </span>
                            <Show when={tab.badge !== undefined}>
                                <CountBadge
                                    class="happy2-tabs__tab-badge"
                                    count={tab.badge!}
                                    tone={active() ? "accent" : "neutral"}
                                />
                            </Show>
                            <Show when={active()}>
                                <span
                                    aria-hidden="true"
                                    class="happy2-tabs__tab-underline"
                                    data-happy2-ui="tab-underline"
                                />
                            </Show>
                        </button>
                    );
                }}
            </For>
        </div>
    );
}
