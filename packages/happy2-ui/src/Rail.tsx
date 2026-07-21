import {
    useLayoutEffect,
    useRef,
    useState,
    type CSSProperties,
    type HTMLAttributes,
    type ReactNode,
} from "react";
import { happyLogoUrl } from "./assets";
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
export type RailAppearance = "dark" | "light";
export type RailProps = Omit<HTMLAttributes<HTMLElement>, "style"> & {
    activeItemId: string;
    /** Current explicit appearance; renders a compact toggle when paired with its handler. */
    appearance?: RailAppearance;
    brand?: ReactNode;
    footer?: ReactNode;
    footerLabel?: string;
    items: RailItem[];
    onFooterSelect?: () => void;
    onItemSelect: (id: string) => void;
    onAppearanceToggle?: () => void;
    /** Prominent accent action (usually "+") pinned above the footer profile. */
    primaryAction?: RailPrimaryAction;
    style?: CSSProperties;
};
/**
 * The 64px feature rail: Happy brand mark (replaceable through the brand
 * slot), icon+label destinations, and a footer slot pinned to the bottom.
 * Navigation only — the app shell composes it next to the main content panel.
 */
export function Rail(props: RailProps) {
    const {
        activeItemId,
        appearance,
        brand,
        className,
        footer,
        footerLabel,
        items,
        onFooterSelect,
        onItemSelect,
        onAppearanceToggle,
        primaryAction,
        style,
        ...rest
    } = props;
    const [primaryMenuOpen, setPrimaryMenuOpen] = useState(false);
    const primaryRoot = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        if (!primaryMenuOpen) return;
        const close = (event: PointerEvent) => {
            if (!primaryRoot.current?.contains(event.target as Node)) setPrimaryMenuOpen(false);
        };
        const closeOnFocus = (event: FocusEvent) => {
            if (!primaryRoot.current?.contains(event.target as Node)) setPrimaryMenuOpen(false);
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            setPrimaryMenuOpen(false);
            primaryRoot.current
                ?.querySelector<HTMLButtonElement>('[data-happy2-ui="rail-primary"]')
                ?.focus();
        };
        const dismiss = () => setPrimaryMenuOpen(false);
        document.addEventListener("pointerdown", close);
        document.addEventListener("focusin", closeOnFocus);
        document.addEventListener("keydown", closeOnEscape);
        window.addEventListener("resize", dismiss);
        return () => {
            document.removeEventListener("pointerdown", close);
            document.removeEventListener("focusin", closeOnFocus);
            document.removeEventListener("keydown", closeOnEscape);
            window.removeEventListener("resize", dismiss);
        };
    }, [primaryMenuOpen]);
    return (
        <nav
            {...rest}
            className={["happy2-rail", className].filter(Boolean).join(" ")}
            data-happy2-ui="rail"
            style={style}
        >
            <div className="happy2-rail__brand" data-happy2-ui="rail-brand">
                {brand ? (
                    brand
                ) : (
                    <img
                        alt=""
                        aria-hidden="true"
                        className="happy2-rail__brand-image"
                        data-happy2-ui="rail-brand-image"
                        draggable={false}
                        src={happyLogoUrl}
                    />
                )}
            </div>
            <div className="happy2-rail__items" data-happy2-ui="rail-items">
                {items.map((item) => (
                    <button
                        aria-current={item.id === activeItemId ? "page" : undefined}
                        className="happy2-rail__item"
                        data-active={item.id === activeItemId ? "" : undefined}
                        data-item-id={item.id}
                        data-happy2-ui="rail-item"
                        key={item.id}
                        onClick={() => onItemSelect(item.id)}
                        type="button"
                    >
                        <span className="happy2-rail__item-icon" data-happy2-ui="rail-item-icon">
                            <Icon name={item.icon} size={20} />
                            {item.badge
                                ? ((count) => (
                                      <span
                                          className="happy2-rail__item-badge"
                                          data-happy2-ui="rail-item-badge"
                                      >
                                          <CountBadge count={count} />
                                      </span>
                                  ))(item.badge)
                                : null}
                        </span>
                        <span className="happy2-rail__item-label" data-happy2-ui="rail-item-label">
                            {item.label}
                        </span>
                    </button>
                ))}
            </div>
            {appearance && onAppearanceToggle ? (
                <div className="happy2-rail__appearance" data-happy2-ui="rail-appearance">
                    <button
                        aria-label={
                            appearance === "dark" ? "Use light appearance" : "Use dark appearance"
                        }
                        aria-pressed={appearance === "dark"}
                        className="happy2-rail__appearance-toggle"
                        data-happy2-ui="rail-appearance-toggle"
                        onClick={onAppearanceToggle}
                        title={
                            appearance === "dark" ? "Use light appearance" : "Use dark appearance"
                        }
                        type="button"
                    >
                        <Icon name={appearance === "dark" ? "sun" : "moon"} size={16} />
                    </button>
                </div>
            ) : null}
            {primaryAction || footer ? (
                <div className="happy2-rail__footer" data-happy2-ui="rail-footer">
                    {primaryAction ? (
                        <div
                            className="happy2-rail__primary-wrap"
                            data-happy2-ui="rail-primary-wrap"
                            ref={primaryRoot}
                        >
                            <button
                                aria-expanded={
                                    primaryAction.menuItems ? primaryMenuOpen : undefined
                                }
                                aria-haspopup={primaryAction.menuItems ? "menu" : undefined}
                                aria-label={primaryAction.label}
                                className="happy2-rail__primary"
                                data-happy2-ui="rail-primary"
                                onClick={() => {
                                    if (primaryAction.menuItems) {
                                        setPrimaryMenuOpen((open) => !open);
                                    } else {
                                        primaryAction.onSelect?.();
                                    }
                                }}
                                type="button"
                            >
                                <Icon name={primaryAction.icon ?? "plus"} size={20} />
                            </button>
                            {primaryMenuOpen && primaryAction.menuItems ? (
                                <div
                                    className="happy2-rail__primary-popover"
                                    data-happy2-ui="rail-primary-popover"
                                >
                                    <Menu
                                        items={primaryAction.menuItems}
                                        onSelect={(id) => {
                                            setPrimaryMenuOpen(false);
                                            primaryAction.onMenuSelect(id);
                                        }}
                                        width={184}
                                    />
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                    {footer ? (
                        onFooterSelect ? (
                            <button
                                aria-label={footerLabel}
                                className="happy2-rail__footer-action"
                                data-happy2-ui="rail-footer-action"
                                onClick={onFooterSelect}
                                type="button"
                            >
                                {footer}
                            </button>
                        ) : (
                            footer
                        )
                    ) : null}
                </div>
            ) : null}
        </nav>
    );
}
