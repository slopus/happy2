import { splitProps } from "./reactProps";
import { type CSSProperties, type ReactNode } from "react";
import { Icon } from "./Icon";
export type ToolbarSearch = {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
};
export type ToolbarProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    title?: string;
    subtitle?: string;
    leading?: ReactNode;
    trailing?: ReactNode;
    search?: ToolbarSearch;
    height?: number;
};
/**
 * C-026 Toolbar — panel/section header bar. A default 48px strip that sits at
 * the top of a panel (admin tables, settings sections): a title with an
 * optional subtitle on the left, an optional leading slot, and a right-pinned
 * actions cluster holding an optional inset search well and a trailing slot.
 * Composes on --happy2-bg-surface with a bottom hairline.
 */
export function Toolbar(props: ToolbarProps) {
    const [local] = splitProps(props, [
        "className",
        "data-testid",
        "style",
        "title",
        "subtitle",
        "leading",
        "trailing",
        "search",
        "height",
    ]);
    const hasHeading = () => local.title !== undefined || local.subtitle !== undefined;
    const hasActions = () => local.search !== undefined || local.trailing !== undefined;
    return (
        <header
            className={["happy2-toolbar", local.className].filter(Boolean).join(" ")}
            data-happy2-ui="toolbar"
            data-testid={local["data-testid"]}
            style={{
                ...local.style,
                ...(local.height === undefined
                    ? {}
                    : { "--happy2-toolbar-height": `${local.height}px` }),
            }}
        >
            {local.leading ? (
                <div className="happy2-toolbar__leading" data-happy2-ui="toolbar-leading">
                    {local.leading}
                </div>
            ) : null}
            {hasHeading() ? (
                <div className="happy2-toolbar__heading" data-happy2-ui="toolbar-heading">
                    {local.title !== undefined ? (
                        <span className="happy2-toolbar__title" data-happy2-ui="toolbar-title">
                            <span className="happy2-toolbar__title-ink">{local.title}</span>
                        </span>
                    ) : null}
                    {local.subtitle !== undefined ? (
                        <span
                            className="happy2-toolbar__subtitle"
                            data-happy2-ui="toolbar-subtitle"
                        >
                            <span className="happy2-toolbar__subtitle-ink">{local.subtitle}</span>
                        </span>
                    ) : null}
                </div>
            ) : null}
            {hasActions() ? (
                <div className="happy2-toolbar__actions" data-happy2-ui="toolbar-actions">
                    {local.search
                        ? ((search) => (
                              <div
                                  className="happy2-toolbar__search"
                                  data-happy2-ui="toolbar-search"
                              >
                                  <span
                                      aria-hidden="true"
                                      className="happy2-toolbar__search-icon"
                                      data-happy2-ui="toolbar-search-icon"
                                  >
                                      <Icon name="search" size={14} />
                                  </span>
                                  <input
                                      aria-label={search.placeholder ?? "Search"}
                                      className="happy2-toolbar__search-input"
                                      data-happy2-ui="toolbar-search-input"
                                      onInput={(event) =>
                                          search.onChange(event.currentTarget.value)
                                      }
                                      placeholder={search.placeholder ?? "Search"}
                                      type="text"
                                      value={search.value}
                                  />
                              </div>
                          ))(local.search)
                        : null}
                    {local.trailing ? (
                        <div className="happy2-toolbar__trailing" data-happy2-ui="toolbar-trailing">
                            {local.trailing}
                        </div>
                    ) : null}
                </div>
            ) : null}
        </header>
    );
}
