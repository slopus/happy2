import { Show, splitProps, type JSX } from "solid-js";
import { Icon } from "./Icon";

export type ToolbarSearch = {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
};

export type ToolbarProps = {
    class?: string;
    "data-testid"?: string;
    style?: JSX.CSSProperties;
    title?: string;
    subtitle?: string;
    leading?: JSX.Element;
    trailing?: JSX.Element;
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
        "class",
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
            class={["happy2-toolbar", local.class].filter(Boolean).join(" ")}
            data-happy2-ui="toolbar"
            data-testid={local["data-testid"]}
            style={{
                ...local.style,
                ...(local.height === undefined
                    ? {}
                    : { "--happy2-toolbar-height": `${local.height}px` }),
            }}
        >
            <Show when={local.leading}>
                <div class="happy2-toolbar__leading" data-happy2-ui="toolbar-leading">
                    {local.leading}
                </div>
            </Show>
            <Show when={hasHeading()}>
                <div class="happy2-toolbar__heading" data-happy2-ui="toolbar-heading">
                    <Show when={local.title !== undefined}>
                        <span class="happy2-toolbar__title" data-happy2-ui="toolbar-title">
                            <span class="happy2-toolbar__title-ink">{local.title}</span>
                        </span>
                    </Show>
                    <Show when={local.subtitle !== undefined}>
                        <span class="happy2-toolbar__subtitle" data-happy2-ui="toolbar-subtitle">
                            <span class="happy2-toolbar__subtitle-ink">{local.subtitle}</span>
                        </span>
                    </Show>
                </div>
            </Show>
            <Show when={hasActions()}>
                <div class="happy2-toolbar__actions" data-happy2-ui="toolbar-actions">
                    <Show when={local.search}>
                        {(search) => (
                            <div class="happy2-toolbar__search" data-happy2-ui="toolbar-search">
                                <span
                                    aria-hidden="true"
                                    class="happy2-toolbar__search-icon"
                                    data-happy2-ui="toolbar-search-icon"
                                >
                                    <Icon name="search" size={14} />
                                </span>
                                <input
                                    aria-label={search().placeholder ?? "Search"}
                                    class="happy2-toolbar__search-input"
                                    data-happy2-ui="toolbar-search-input"
                                    onInput={(event) =>
                                        search().onChange(event.currentTarget.value)
                                    }
                                    placeholder={search().placeholder ?? "Search"}
                                    type="text"
                                    value={search().value}
                                />
                            </div>
                        )}
                    </Show>
                    <Show when={local.trailing}>
                        <div class="happy2-toolbar__trailing" data-happy2-ui="toolbar-trailing">
                            {local.trailing}
                        </div>
                    </Show>
                </div>
            </Show>
        </header>
    );
}
