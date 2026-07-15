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
 * Shortcuts reuse the tuned KeyCap primitive; danger items paint in --happy2-danger.
 */
export function Menu(props: MenuProps) {
    const [local, rest] = splitProps(props, ["class", "style", "items", "onSelect", "width"]);
    const hasIcons = () =>
        local.items.some((item) => item.kind === "item" && item.icon !== undefined);

    return (
        <div
            {...rest}
            class={["happy2-menu", local.class].filter(Boolean).join(" ")}
            data-has-icons={hasIcons() ? "" : undefined}
            data-happy2-ui="menu"
            role="menu"
            style={{
                ...local.style,
                ...(local.width === undefined ? {} : { width: `${local.width}px` }),
            }}
        >
            <div class="happy2-menu__list" data-happy2-ui="menu-list">
                <For each={local.items}>
                    {(item) => {
                        if (item.kind === "separator") {
                            return (
                                <div
                                    aria-hidden="true"
                                    class="happy2-menu__separator"
                                    data-happy2-ui="menu-separator"
                                    role="separator"
                                />
                            );
                        }
                        if (item.kind === "label") {
                            return (
                                <div class="happy2-menu__label" data-happy2-ui="menu-label">
                                    {item.label}
                                </div>
                            );
                        }
                        return (
                            <button
                                aria-disabled={item.disabled ? "true" : undefined}
                                class="happy2-menu__item"
                                data-danger={item.danger ? "" : undefined}
                                data-item-id={item.id}
                                data-happy2-ui="menu-item"
                                disabled={item.disabled}
                                onClick={() => {
                                    if (!item.disabled) local.onSelect?.(item.id);
                                }}
                                role="menuitem"
                                type="button"
                            >
                                <Show when={hasIcons()}>
                                    <span
                                        class="happy2-menu__item-icon"
                                        data-happy2-ui="menu-item-icon"
                                    >
                                        <Show when={item.icon}>
                                            {(name) => <Icon name={name()} size={16} />}
                                        </Show>
                                    </span>
                                </Show>
                                <span
                                    class="happy2-menu__item-label"
                                    data-happy2-ui="menu-item-label"
                                >
                                    {item.label}
                                </span>
                                <Show when={item.shortcut}>
                                    {(shortcut) => (
                                        <KeyCap
                                            class="happy2-menu__item-shortcut"
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
