import { For, Show, splitProps, type JSX } from "solid-js";
import { KeyCap } from "./Badge";
import { Icon, type IconName } from "./Icon";

export type MenuItem =
    | {
          kind: "item";
          id: string;
          label: string;
          icon?: IconName;
          danger?: boolean;
          disabled?: boolean;
          shortcut?: string;
      }
    | { kind: "separator" }
    | { kind: "label"; label: string };

export type MenuProps = {
    class?: string;
    "data-testid"?: string;
    style?: JSX.CSSProperties;
    items: MenuItem[];
    onSelect?: (id: string) => void;
    width?: number;
};

/**
 * C-027 Menu — dropdown / context-menu popover on the raised surface. Renders
 * as a static card (no open/close animation): a 6px-padded list of 32px item
 * rows, optional mono section labels, and 1px separators. When any item carries
 * an icon the whole menu reserves a 16px leading gutter so every label aligns.
 * Shortcuts reuse the tuned KeyCap primitive; danger items paint in --rg-danger.
 */
export function Menu(props: MenuProps) {
    const [local, rest] = splitProps(props, ["class", "style", "items", "onSelect", "width"]);
    const hasIcons = () =>
        local.items.some((item) => item.kind === "item" && item.icon !== undefined);

    return (
        <div
            {...rest}
            class={["rigged-menu", local.class].filter(Boolean).join(" ")}
            data-has-icons={hasIcons() ? "" : undefined}
            data-rigged-ui="menu"
            role="menu"
            style={{
                ...local.style,
                ...(local.width === undefined ? {} : { width: `${local.width}px` }),
            }}
        >
            <div class="rigged-menu__list" data-rigged-ui="menu-list">
                <For each={local.items}>
                    {(item) => {
                        if (item.kind === "separator") {
                            return (
                                <div
                                    aria-hidden="true"
                                    class="rigged-menu__separator"
                                    data-rigged-ui="menu-separator"
                                    role="separator"
                                />
                            );
                        }
                        if (item.kind === "label") {
                            return (
                                <div class="rigged-menu__label" data-rigged-ui="menu-label">
                                    {item.label}
                                </div>
                            );
                        }
                        return (
                            <button
                                aria-disabled={item.disabled ? "true" : undefined}
                                class="rigged-menu__item"
                                data-danger={item.danger ? "" : undefined}
                                data-item-id={item.id}
                                data-rigged-ui="menu-item"
                                disabled={item.disabled}
                                onClick={() => {
                                    if (!item.disabled) local.onSelect?.(item.id);
                                }}
                                role="menuitem"
                                type="button"
                            >
                                <Show when={hasIcons()}>
                                    <span
                                        class="rigged-menu__item-icon"
                                        data-rigged-ui="menu-item-icon"
                                    >
                                        <Show when={item.icon}>
                                            {(name) => <Icon name={name()} size={16} />}
                                        </Show>
                                    </span>
                                </Show>
                                <span
                                    class="rigged-menu__item-label"
                                    data-rigged-ui="menu-item-label"
                                >
                                    {item.label}
                                </span>
                                <Show when={item.shortcut}>
                                    {(shortcut) => (
                                        <KeyCap
                                            class="rigged-menu__item-shortcut"
                                            keys={shortcut()}
                                        />
                                    )}
                                </Show>
                            </button>
                        );
                    }}
                </For>
            </div>
        </div>
    );
}
