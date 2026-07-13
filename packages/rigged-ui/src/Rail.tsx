import { For, Show, splitProps, type JSX } from "solid-js";
import { happyOtterLogoUrl } from "./assets";
import { CountBadge } from "./Badge";
import { Icon, type IconName } from "./Icon";

export type RailItem = {
    badge?: number;
    icon: IconName;
    id: string;
    label: string;
};

export type RailProps = Omit<JSX.HTMLAttributes<HTMLElement>, "style"> & {
    activeItemId: string;
    brand?: JSX.Element;
    footer?: JSX.Element;
    footerLabel?: string;
    items: RailItem[];
    onFooterSelect?: () => void;
    onItemSelect: (id: string) => void;
    style?: JSX.CSSProperties;
};

/**
 * The 76px feature rail: happy otter brand mark (replaceable through the brand
 * slot), icon+label destinations, and a footer slot pinned to the bottom.
 * Navigation only — the app shell composes it next to the main content panel.
 */
export function Rail(props: RailProps) {
    const [local, rest] = splitProps(props, [
        "activeItemId",
        "brand",
        "class",
        "footer",
        "footerLabel",
        "items",
        "onFooterSelect",
        "onItemSelect",
        "style",
    ]);

    return (
        <nav
            {...rest}
            class={["rigged-rail", local.class].filter(Boolean).join(" ")}
            data-rigged-ui="rail"
            style={local.style}
        >
            <div class="rigged-rail__brand" data-rigged-ui="rail-brand">
                <Show
                    fallback={
                        <img
                            alt=""
                            aria-hidden="true"
                            class="rigged-rail__brand-image"
                            data-rigged-ui="rail-brand-image"
                            draggable={false}
                            src={happyOtterLogoUrl}
                        />
                    }
                    when={local.brand}
                >
                    {local.brand}
                </Show>
            </div>
            <div class="rigged-rail__items" data-rigged-ui="rail-items">
                <For each={local.items}>
                    {(item) => (
                        <button
                            aria-current={item.id === local.activeItemId ? "page" : undefined}
                            class="rigged-rail__item"
                            data-active={item.id === local.activeItemId ? "" : undefined}
                            data-item-id={item.id}
                            data-rigged-ui="rail-item"
                            onClick={() => local.onItemSelect(item.id)}
                            type="button"
                        >
                            <span class="rigged-rail__item-icon" data-rigged-ui="rail-item-icon">
                                <Icon name={item.icon} size={20} />
                                <Show when={item.badge}>
                                    {(count) => (
                                        <span
                                            class="rigged-rail__item-badge"
                                            data-rigged-ui="rail-item-badge"
                                        >
                                            <CountBadge count={count()} />
                                        </span>
                                    )}
                                </Show>
                            </span>
                            <span class="rigged-rail__item-label" data-rigged-ui="rail-item-label">
                                {item.label}
                            </span>
                        </button>
                    )}
                </For>
            </div>
            <Show when={local.footer}>
                <div class="rigged-rail__footer" data-rigged-ui="rail-footer">
                    <Show fallback={local.footer} when={local.onFooterSelect}>
                        {(onSelect) => (
                            <button
                                aria-label={local.footerLabel}
                                class="rigged-rail__footer-action"
                                data-rigged-ui="rail-footer-action"
                                onClick={onSelect()}
                                type="button"
                            >
                                {local.footer}
                            </button>
                        )}
                    </Show>
                </div>
            </Show>
        </nav>
    );
}
