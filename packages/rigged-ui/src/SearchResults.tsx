import { For, Show, type JSX } from "solid-js";
import { Avatar, type ToneName } from "./Avatar";
import { Icon, type IconName } from "./Icon";
import type { MessageSegment } from "./Message";

export type SearchResultType = "message" | "channel" | "user";
export type SearchResultAvatar = { initials: string; tone?: ToneName; imageUrl?: string };
export type SearchResultItem = {
    id: string;
    title: string | MessageSegment[];
    meta?: string;
    avatar?: SearchResultAvatar;
    icon?: IconName;
};
export type SearchResultGroup = { type: SearchResultType; results: SearchResultItem[] };

export type SearchResultsProps = {
    class?: string;
    "data-testid"?: string;
    style?: JSX.CSSProperties;
    groups: SearchResultGroup[];
    query?: string;
    onSelect?: (type: SearchResultType, id: string) => void;
    emptyLabel?: string;
};

const groupLabels: Record<SearchResultType, string> = {
    channel: "Channels",
    user: "People",
    message: "Messages",
};

const defaultIcons: Record<SearchResultType, IconName> = {
    channel: "hash",
    user: "at",
    message: "chat",
};

/**
 * Splits `text` on case-insensitive occurrences of `query`, wrapping each match
 * in a highlight <mark>. Preserves the original casing of the source text and
 * returns the raw string untouched when there is no query or no match, so a
 * plain title never gains an extra element.
 */
function highlight(text: string, query?: string): JSX.Element {
    const needle = query?.trim().toLowerCase();
    if (!needle) return text;
    const haystack = text.toLowerCase();
    let from = haystack.indexOf(needle);
    if (from === -1) return text;

    const parts: JSX.Element[] = [];
    let cursor = 0;
    while (from !== -1) {
        if (from > cursor) parts.push(text.slice(cursor, from));
        parts.push(
            <mark class="rigged-search-results__mark" data-rigged-ui="search-results-mark">
                {text.slice(from, from + needle.length)}
            </mark>,
        );
        cursor = from + needle.length;
        from = haystack.indexOf(needle, cursor);
    }
    if (cursor < text.length) parts.push(text.slice(cursor));
    return parts;
}

function renderSegment(segment: MessageSegment, query?: string): JSX.Element {
    switch (segment.kind) {
        case "mention":
            return (
                <span
                    class="rigged-search-results__mention"
                    data-rigged-ui="search-results-mention"
                >
                    @{segment.text}
                </span>
            );
        case "code":
            return (
                <code class="rigged-search-results__code" data-rigged-ui="search-results-code">
                    {segment.text}
                </code>
            );
        case "link":
            return (
                <a class="rigged-search-results__link" data-rigged-ui="search-results-link">
                    {segment.text}
                </a>
            );
        default:
            return highlight(segment.text, query);
    }
}

function renderTitle(title: string | MessageSegment[], query?: string): JSX.Element {
    if (typeof title === "string") return highlight(title, query);
    return <For each={title}>{(segment) => renderSegment(segment, query)}</For>;
}

function SearchResultRow(props: {
    item: SearchResultItem;
    onSelect?: (type: SearchResultType, id: string) => void;
    query?: string;
    type: SearchResultType;
}) {
    const item = () => props.item;
    return (
        <button
            class="rigged-search-results__row"
            data-item-id={item().id}
            data-rigged-ui="search-results-row"
            data-type={props.type}
            onClick={() => props.onSelect?.(props.type, item().id)}
            type="button"
        >
            <span
                class="rigged-search-results__row-leading"
                data-rigged-ui="search-results-row-leading"
            >
                <Show
                    when={item().avatar}
                    fallback={
                        <span
                            class="rigged-search-results__row-glyph"
                            data-rigged-ui="search-results-row-glyph"
                        >
                            <Icon name={item().icon ?? defaultIcons[props.type]} size={16} />
                        </span>
                    }
                >
                    {(avatar) => (
                        <Avatar
                            imageUrl={avatar().imageUrl}
                            initials={avatar().initials}
                            size="sm"
                            tone={avatar().tone}
                        />
                    )}
                </Show>
            </span>
            <span class="rigged-search-results__row-body" data-rigged-ui="search-results-row-body">
                <span
                    class="rigged-search-results__row-title"
                    data-rigged-ui="search-results-row-title"
                >
                    {renderTitle(item().title, props.query)}
                </span>
                <Show when={item().meta}>
                    <span
                        class="rigged-search-results__row-meta"
                        data-rigged-ui="search-results-row-meta"
                    >
                        {item().meta}
                    </span>
                </Show>
            </span>
        </button>
    );
}

/**
 * C-036 SearchResults — grouped unified search on a raised popover card. Each
 * group carries a mono uppercase header (type label + result count) over a
 * stack of 44px rows: channels lead with a hash-glyph tile, people and message
 * authors lead with an avatar, and message rows show a snippet. Query matches
 * are marked with the accent highlight token. Empty renders a centered notice.
 */
export function SearchResults(props: SearchResultsProps) {
    const total = () => props.groups.reduce((sum, group) => sum + group.results.length, 0);

    return (
        <div
            class={["rigged-search-results", props.class].filter(Boolean).join(" ")}
            data-rigged-ui="search-results"
            data-testid={props["data-testid"]}
            style={props.style}
        >
            <Show
                when={total() > 0}
                fallback={
                    <div class="rigged-search-results__empty" data-rigged-ui="search-results-empty">
                        <span
                            aria-hidden="true"
                            class="rigged-search-results__empty-icon"
                            data-rigged-ui="search-results-empty-icon"
                        >
                            <Icon name="search" size={20} />
                        </span>
                        <span
                            class="rigged-search-results__empty-label"
                            data-rigged-ui="search-results-empty-label"
                        >
                            {props.emptyLabel ?? "No results"}
                        </span>
                    </div>
                }
            >
                <For each={props.groups}>
                    {(group) => (
                        <Show when={group.results.length > 0}>
                            <section
                                class="rigged-search-results__group"
                                data-rigged-ui="search-results-group"
                                data-type={group.type}
                            >
                                <div
                                    class="rigged-search-results__group-head"
                                    data-rigged-ui="search-results-group-head"
                                >
                                    <span
                                        class="rigged-search-results__group-label"
                                        data-rigged-ui="search-results-group-label"
                                    >
                                        {groupLabels[group.type]}
                                    </span>
                                    <span
                                        class="rigged-search-results__group-count"
                                        data-rigged-ui="search-results-group-count"
                                    >
                                        {group.results.length}
                                    </span>
                                </div>
                                <For each={group.results}>
                                    {(item) => (
                                        <SearchResultRow
                                            item={item}
                                            onSelect={props.onSelect}
                                            query={props.query}
                                            type={group.type}
                                        />
                                    )}
                                </For>
                            </section>
                        </Show>
                    )}
                </For>
            </Show>
        </div>
    );
}
