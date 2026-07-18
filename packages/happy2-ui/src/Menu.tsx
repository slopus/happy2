import { type CSSProperties } from "react";
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
    | {
          kind: "separator";
      }
    | {
          kind: "label";
          label: string;
      };
export type MenuProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
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
    const { className, items, onSelect, style, width, ...rest } = props;
    const hasIcons = items.some((item) => item.kind === "item" && item.icon !== undefined);
    return (
        <div
            {...rest}
            className={["happy2-menu", className].filter(Boolean).join(" ")}
            data-has-icons={hasIcons ? "" : undefined}
            data-happy2-ui="menu"
            role="menu"
            style={{
                ...style,
                ...(width === undefined ? {} : { width: `${width}px` }),
            }}
        >
            <div className="happy2-menu__list" data-happy2-ui="menu-list">
                {items.map((item, index) => {
                    if (item.kind === "separator") {
                        return (
                            <div
                                aria-hidden="true"
                                className="happy2-menu__separator"
                                data-happy2-ui="menu-separator"
                                key={`separator-${index}`}
                                role="separator"
                            />
                        );
                    }
                    if (item.kind === "label") {
                        return (
                            <div
                                className="happy2-menu__label"
                                data-happy2-ui="menu-label"
                                key={`label-${item.label}-${index}`}
                            >
                                {item.label}
                            </div>
                        );
                    }
                    return (
                        <button
                            aria-disabled={item.disabled ? "true" : undefined}
                            className="happy2-menu__item"
                            data-danger={item.danger ? "" : undefined}
                            data-item-id={item.id}
                            data-happy2-ui="menu-item"
                            disabled={item.disabled}
                            key={item.id}
                            onClick={() => {
                                if (!item.disabled) onSelect?.(item.id);
                            }}
                            role="menuitem"
                            type="button"
                        >
                            {hasIcons ? (
                                <span
                                    className="happy2-menu__item-icon"
                                    data-happy2-ui="menu-item-icon"
                                >
                                    {item.icon ? <Icon name={item.icon} size={16} /> : null}
                                </span>
                            ) : null}
                            <span
                                className="happy2-menu__item-label"
                                data-happy2-ui="menu-item-label"
                            >
                                {item.label}
                            </span>
                            {item.shortcut ? (
                                <KeyCap
                                    className="happy2-menu__item-shortcut"
                                    keys={item.shortcut}
                                />
                            ) : null}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
