import { createEffect, createSignal, For, onCleanup, Show, splitProps, type JSX } from "solid-js";
import { happyOtterLogoUrl } from "./assets";
import { CountBadge } from "./Badge";
import { Icon, type IconName } from "./Icon";
import { Menu, type MenuItem } from "./Menu";

export type RailItem = {
    badge?: number;
    icon: IconName;
    id: string;
    label: string;
};

export type RailPrimaryAction =
    | {
          icon?: IconName;
          label: string;
          onSelect: () => void;
          menuItems?: never;
          onMenuSelect?: never;
      }
    | {
          icon?: IconName;
          label: string;
          menuItems: MenuItem[];
          onMenuSelect: (id: string) => void;
          onSelect?: never;
      };

export type RailProps = Omit<JSX.HTMLAttributes<HTMLElement>, "style"> & {
    activeItemId: string;
    brand?: JSX.Element;
    footer?: JSX.Element;
    footerLabel?: string;
    items: RailItem[];
    onFooterSelect?: () => void;
    onItemSelect: (id: string) => void;
    /** Prominent accent action (usually "+") pinned above the footer profile. */
    primaryAction?: RailPrimaryAction;
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
        "primaryAction",
        "style",
    ]);
    const [primaryMenuOpen, setPrimaryMenuOpen] = createSignal(false);
    let primaryRoot: HTMLDivElement | undefined;

    createEffect(() => {
        if (!primaryMenuOpen()) return;
        const close = (event: PointerEvent) => {
            if (!primaryRoot?.contains(event.target as Node)) setPrimaryMenuOpen(false);
        };
        const closeOnFocus = (event: FocusEvent) => {
            if (!primaryRoot?.contains(event.target as Node)) setPrimaryMenuOpen(false);
        };
        const dismiss = () => setPrimaryMenuOpen(false);
        document.addEventListener("pointerdown", close);
        document.addEventListener("focusin", closeOnFocus);
        window.addEventListener("resize", dismiss);
        onCleanup(() => {
            document.removeEventListener("pointerdown", close);
            document.removeEventListener("focusin", closeOnFocus);
            window.removeEventListener("resize", dismiss);
        });
    });

    return (
        <nav
            {...rest}
            class={["happy2-rail", local.class].filter(Boolean).join(" ")}
            data-happy2-ui="rail"
            style={local.style}
        >
            <div class="happy2-rail__brand" data-happy2-ui="rail-brand">
                <Show
                    fallback={
                        <img
                            alt=""
                            aria-hidden="true"
                            class="happy2-rail__brand-image"
                            data-happy2-ui="rail-brand-image"
                            draggable={false}
                            src={happyOtterLogoUrl}
                        />
                    }
                    when={local.brand}
                >
                    {local.brand}
                </Show>
            </div>
            <div class="happy2-rail__items" data-happy2-ui="rail-items">
                <For each={local.items}>
                    {(item) => (
                        <button
                            aria-current={item.id === local.activeItemId ? "page" : undefined}
                            class="happy2-rail__item"
                            data-active={item.id === local.activeItemId ? "" : undefined}
                            data-item-id={item.id}
                            data-happy2-ui="rail-item"
                            onClick={() => local.onItemSelect(item.id)}
                            type="button"
                        >
                            <span class="happy2-rail__item-icon" data-happy2-ui="rail-item-icon">
                                <Icon name={item.icon} size={20} />
                                <Show when={item.badge}>
                                    {(count) => (
                                        <span
                                            class="happy2-rail__item-badge"
                                            data-happy2-ui="rail-item-badge"
                                        >
                                            <CountBadge count={count()} />
                                        </span>
                                    )}
                                </Show>
                            </span>
                            <span class="happy2-rail__item-label" data-happy2-ui="rail-item-label">
                                {item.label}
                            </span>
                        </button>
                    )}
                </For>
            </div>
            <Show when={local.primaryAction || local.footer}>
                <div class="happy2-rail__footer" data-happy2-ui="rail-footer">
                    <Show when={local.primaryAction}>
                        {(action) => (
                            <div
                                class="happy2-rail__primary-wrap"
                                data-happy2-ui="rail-primary-wrap"
                                onKeyDown={(event) => {
                                    if (event.key !== "Escape" || !primaryMenuOpen()) return;
                                    event.preventDefault();
                                    setPrimaryMenuOpen(false);
                                    primaryRoot
                                        ?.querySelector<HTMLButtonElement>(
                                            '[data-happy2-ui="rail-primary"]',
                                        )
                                        ?.focus();
                                }}
                                ref={(element) => (primaryRoot = element)}
                            >
                                <button
                                    aria-expanded={
                                        action().menuItems ? primaryMenuOpen() : undefined
                                    }
                                    aria-haspopup={action().menuItems ? "menu" : undefined}
                                    aria-label={action().label}
                                    class="happy2-rail__primary"
                                    data-happy2-ui="rail-primary"
                                    onClick={() => {
                                        if (action().menuItems) setPrimaryMenuOpen((open) => !open);
                                        else action().onSelect?.();
                                    }}
                                    type="button"
                                >
                                    <Icon name={action().icon ?? "plus"} size={20} />
                                </button>
                                <Show when={primaryMenuOpen() && action().menuItems}>
                                    <div
                                        class="happy2-rail__primary-popover"
                                        data-happy2-ui="rail-primary-popover"
                                    >
                                        <Menu
                                            items={action().menuItems ?? []}
                                            onSelect={(id) => {
                                                setPrimaryMenuOpen(false);
                                                action().onMenuSelect?.(id);
                                            }}
                                            width={184}
                                        />
                                    </div>
                                </Show>
                            </div>
                        )}
                    </Show>
                    <Show when={local.footer}>
                        <Show fallback={local.footer} when={local.onFooterSelect}>
                            {(onSelect) => (
                                <button
                                    aria-label={local.footerLabel}
                                    class="happy2-rail__footer-action"
                                    data-happy2-ui="rail-footer-action"
                                    onClick={onSelect()}
                                    type="button"
                                >
                                    {local.footer}
                                </button>
                            )}
                        </Show>
                    </Show>
                </div>
            </Show>
        </nav>
    );
}
