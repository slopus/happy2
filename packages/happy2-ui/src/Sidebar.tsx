import { partitionComponentProps } from "./componentProps";
import { type CSSProperties, type HTMLAttributes, type ReactNode } from "react";
import { Avatar, type ToneName } from "./Avatar";
import { CountBadge } from "./Badge";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
export type SidebarItem = {
    /** Marks a row as archived; the row keeps its position but paints muted. */
    archived?: boolean;
    badge?: number;
    /** Nesting level. `0`/absent is top level; each level adds `SIDEBAR_ROW_INDENT` of left inset. */
    depth?: number;
    icon?: IconName;
    id: string;
    imageUrl?: string;
    initials?: string;
    kind: "view" | "channel" | "person" | "agent" | "action";
    label: string;
    meta?: string;
    online?: boolean;
    status?: "ready" | "working";
    tone?: ToneName;
    unread?: boolean;
};
/** Left inset of the row content at depth 0 (matches the CSS `padding-left`). */
export const SIDEBAR_ROW_PADDING_X = 10;
/** Additional left inset applied per nesting level so children sit under their parent. */
export const SIDEBAR_ROW_INDENT = 16;
export type SidebarSection = {
    action?: {
        icon: IconName;
        label: string;
    };
    empty?: {
        actionLabel: string;
        description: string;
        icon?: IconName;
        title?: string;
    };
    id: string;
    items: SidebarItem[];
    label?: string;
};
export type SidebarProps = Omit<HTMLAttributes<HTMLElement>, "style"> & {
    activeItemId: string;
    /** Renders the product mark ("Happy" + faint "2") instead of a custom title row. */
    brand?: boolean;
    composeLabel?: string;
    footer?: ReactNode;
    onCompose?: () => void;
    onItemSelect: (id: string) => void;
    onSectionAction?: (sectionId: string) => void;
    sections: SidebarSection[];
    style?: CSSProperties;
    subtitle?: string;
    title?: string;
};
function leadingIcon(item: SidebarItem): IconName {
    if (item.kind === "channel") return "hash";
    if (item.kind === "action") return item.icon ?? "plus";
    return item.icon ?? "inbox";
}
function SidebarRow(props: { active: boolean; item: SidebarItem; onSelect: (id: string) => void }) {
    const item = () => props.item;
    const unread = () => item().unread === true;
    const mentioned = () => (item().badge ?? 0) > 0;
    const depth = () => Math.max(0, item().depth ?? 0);
    const showStatus = () =>
        item().kind === "agent" && item().status !== undefined && !unread() && !mentioned();
    const showMeta = () => item().meta !== undefined && !unread() && !mentioned() && !showStatus();
    return (
        <button
            aria-current={props.active ? "page" : undefined}
            className="happy2-sidebar__item"
            data-active={props.active ? "" : undefined}
            data-archived={item().archived ? "" : undefined}
            data-depth={depth() > 0 ? String(depth()) : undefined}
            data-item-id={item().id}
            data-kind={item().kind}
            data-mentioned={mentioned() ? "" : undefined}
            data-happy2-ui="sidebar-item"
            data-unread={unread() ? "" : undefined}
            onClick={() => props.onSelect(item().id)}
            style={
                depth() > 0
                    ? { paddingLeft: SIDEBAR_ROW_PADDING_X + depth() * SIDEBAR_ROW_INDENT }
                    : undefined
            }
            type="button"
        >
            <span className="happy2-sidebar__item-leading" data-happy2-ui="sidebar-item-leading">
                {item().kind === "person" || item().kind === "agent" ? (
                    <Avatar
                        imageUrl={item().imageUrl}
                        initials={item().initials ?? item().label.slice(0, 1).toUpperCase()}
                        online={item().kind === "person" ? item().online : undefined}
                        size="xs"
                        tone={item().tone}
                        type={item().kind === "agent" ? "agent" : "human"}
                    />
                ) : (
                    <Icon name={leadingIcon(item())} size={16} />
                )}
            </span>
            <span className="happy2-sidebar__item-label" data-happy2-ui="sidebar-item-label">
                {item().label}
            </span>
            {unread() && !mentioned() ? (
                <span
                    aria-label="Unread"
                    className="happy2-sidebar__item-unread"
                    data-happy2-ui="sidebar-item-unread"
                />
            ) : null}
            {mentioned() ? (
                <CountBadge className="happy2-sidebar__item-badge" count={item().badge!} />
            ) : null}
            {showStatus() ? (
                <>
                    {item().status === "working" ? (
                        <span
                            className="happy2-sidebar__item-working"
                            data-happy2-ui="sidebar-item-working"
                        >
                            working
                        </span>
                    ) : null}
                    <span
                        aria-hidden="true"
                        className="happy2-sidebar__item-status"
                        data-happy2-ui="sidebar-item-status"
                        data-status={item().status}
                    />
                </>
            ) : null}
            {showMeta() ? (
                <span className="happy2-sidebar__item-meta" data-happy2-ui="sidebar-item-meta">
                    {item().meta}
                </span>
            ) : null}
        </button>
    );
}
/**
 * C-009 Sidebar — responsive native navigation column. Header with
 * workspace title, scrollable sectioned rows (views, channels, people, agents,
 * actions), actionable empty-section guidance, and an optional footer.
 */
export function Sidebar(props: SidebarProps) {
    const [local, rest] = partitionComponentProps(props, [
        "activeItemId",
        "brand",
        "className",
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
            className={["happy2-sidebar", local.className].filter(Boolean).join(" ")}
            data-happy2-ui="sidebar"
            style={local.style}
        >
            <header className="happy2-sidebar__header" data-happy2-ui="sidebar-header">
                <div className="happy2-sidebar__heading" data-happy2-ui="sidebar-heading">
                    {local.brand ? (
                        <span className="happy2-sidebar__title-row">
                            <span className="happy2-sidebar__title" data-happy2-ui="sidebar-title">
                                Happy
                                <span
                                    className="happy2-sidebar__title-suffix"
                                    data-happy2-ui="sidebar-title-suffix"
                                >
                                    {" "}
                                    2
                                </span>
                            </span>
                        </span>
                    ) : (
                        <span className="happy2-sidebar__title-row">
                            <span className="happy2-sidebar__title" data-happy2-ui="sidebar-title">
                                {local.title}
                            </span>
                            <span className="happy2-sidebar__title-chevron" aria-hidden="true">
                                <Icon name="chevron-down" size={14} />
                            </span>
                        </span>
                    )}
                    {local.subtitle ? (
                        <span
                            className="happy2-sidebar__subtitle"
                            data-happy2-ui="sidebar-subtitle"
                        >
                            {local.subtitle}
                        </span>
                    ) : null}
                </div>
            </header>
            <div className="happy2-sidebar__body" data-happy2-ui="sidebar-body">
                <div className="happy2-sidebar__body-content" data-happy2-ui="sidebar-body-content">
                    {local.onCompose ? (
                        <div
                            className="happy2-sidebar__compose-row"
                            data-happy2-ui="sidebar-compose-row"
                        >
                            <Button
                                className="happy2-sidebar__compose"
                                fullWidth
                                icon="edit"
                                onClick={local.onCompose}
                                size="medium"
                                variant="secondary"
                            >
                                {local.composeLabel ?? "New chat"}
                            </Button>
                        </div>
                    ) : null}
                    {local.sections.map((section) => (
                        <section
                            className="happy2-sidebar__section"
                            key={section.id}
                            data-happy2-ui="sidebar-section"
                            data-section-id={section.id}
                        >
                            {section.label ? (
                                <div
                                    className="happy2-sidebar__section-head"
                                    data-happy2-ui="sidebar-section-head"
                                >
                                    <span
                                        className="happy2-sidebar__section-label"
                                        data-happy2-ui="sidebar-section-label"
                                    >
                                        {section.label}
                                    </span>
                                    {section.action
                                        ? ((action) => (
                                              <button
                                                  aria-label={action.label}
                                                  className="happy2-sidebar__section-action"
                                                  data-happy2-ui="sidebar-section-action"
                                                  onClick={() =>
                                                      local.onSectionAction?.(section.id)
                                                  }
                                                  type="button"
                                              >
                                                  <Icon name={action.icon} size={12} />
                                              </button>
                                          ))(section.action)
                                        : null}
                                </div>
                            ) : null}
                            {section.items.map((item) => (
                                <SidebarRow
                                    active={item.id === local.activeItemId}
                                    key={item.id}
                                    item={item}
                                    onSelect={local.onItemSelect}
                                />
                            ))}
                            {(section.items.length === 0 ? section.empty : undefined)
                                ? ((empty) => (
                                      <div
                                          className="happy2-sidebar__empty"
                                          data-happy2-ui="sidebar-section-empty"
                                      >
                                          <span
                                              className="happy2-sidebar__empty-description"
                                              data-happy2-ui="sidebar-section-empty-description"
                                          >
                                              {empty.description}
                                          </span>
                                          <Button
                                              className="happy2-sidebar__empty-action"
                                              onClick={() => local.onSectionAction?.(section.id)}
                                              size="small"
                                              variant="ghost"
                                          >
                                              {empty.actionLabel}
                                          </Button>
                                      </div>
                                  ))((section.items.length === 0 ? section.empty : undefined)!)
                                : null}
                        </section>
                    ))}
                </div>
            </div>
            {local.footer ? (
                <footer className="happy2-sidebar__footer" data-happy2-ui="sidebar-footer">
                    {local.footer}
                </footer>
            ) : null}
        </nav>
    );
}
