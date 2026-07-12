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
 * Composes on --rg-bg-surface with a bottom hairline.
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
            class={["rigged-toolbar", local.class].filter(Boolean).join(" ")}
            data-rigged-ui="toolbar"
            data-testid={local["data-testid"]}
            style={{
                ...local.style,
                ...(local.height === undefined
                    ? {}
                    : { "--rigged-toolbar-height": `${local.height}px` }),
            }}
        >
            <Show when={local.leading}>
                <div class="rigged-toolbar__leading" data-rigged-ui="toolbar-leading">
                    {local.leading}
                </div>
            </Show>
            <Show when={hasHeading()}>
                <div class="rigged-toolbar__heading" data-rigged-ui="toolbar-heading">
                    <Show when={local.title !== undefined}>
                        <span class="rigged-toolbar__title" data-rigged-ui="toolbar-title">
                            <span class="rigged-toolbar__title-ink">{local.title}</span>
                        </span>
                    </Show>
                    <Show when={local.subtitle !== undefined}>
                        <span class="rigged-toolbar__subtitle" data-rigged-ui="toolbar-subtitle">
                            <span class="rigged-toolbar__subtitle-ink">{local.subtitle}</span>
                        </span>
                    </Show>
                </div>
            </Show>
            <Show when={hasActions()}>
                <div class="rigged-toolbar__actions" data-rigged-ui="toolbar-actions">
                    <Show when={local.search}>
                        {(search) => (
                            <div class="rigged-toolbar__search" data-rigged-ui="toolbar-search">
                                <span
                                    aria-hidden="true"
                                    class="rigged-toolbar__search-icon"
                                    data-rigged-ui="toolbar-search-icon"
                                >
                                    <Icon name="search" size={14} />
                                </span>
                                <input
                                    aria-label={search().placeholder ?? "Search"}
                                    class="rigged-toolbar__search-input"
                                    data-rigged-ui="toolbar-search-input"
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
                        <div class="rigged-toolbar__trailing" data-rigged-ui="toolbar-trailing">
                            {local.trailing}
                        </div>
                    </Show>
                </div>
            </Show>
        </header>
    );
}
