import { For, Show, splitProps, type JSX } from "solid-js";
import { TextField } from "./TextField";

export type EmojiItem = { id: string; char?: string; imageUrl?: string; name: string };

export type EmojiPickerProps = {
    class?: string;
    "data-testid"?: string;
    style?: JSX.CSSProperties;
    emoji: EmojiItem[];
    recent?: string[];
    query?: string;
    onQueryChange?: (value: string) => void;
    onSelect?: (id: string) => void;
    columns?: number;
    /** Search-field placeholder copy (default "Search emoji"). */
    searchPlaceholder?: string;
    /** Section label above the recent row (default "Recently used"). */
    recentLabel?: string;
    /** Section label above the full grid when a recent row is shown (default "All emoji"). */
    allLabel?: string;
    /** Message shown when the emoji list is empty (default "No emoji found"). */
    emptyLabel?: string;
};

/* Fixed square slot for every emoji, unicode or custom image (DESIGN.md: put
 * font emoji in a fixed, explicitly sized slot and keep labels separate). */
const CELL = 36;
const DEFAULT_COLUMNS = 8;
/* Card border-box = grid (columns × CELL) + 2×8 padding + 2×1 hairline. */
const CHROME = 18;

function EmojiCell(props: { item: EmojiItem; onSelect?: (id: string) => void }) {
    return (
        <button
            aria-label={props.item.name}
            class="rigged-emoji-picker__cell"
            data-emoji-id={props.item.id}
            data-rigged-ui="emoji-picker-cell"
            onClick={() => props.onSelect?.(props.item.id)}
            title={props.item.name}
            type="button"
        >
            <span class="rigged-emoji-picker__art" data-rigged-ui="emoji-picker-art">
                <Show
                    when={props.item.imageUrl}
                    fallback={
                        <span
                            class="rigged-emoji-picker__glyph"
                            data-rigged-ui="emoji-picker-glyph"
                        >
                            {props.item.char}
                        </span>
                    }
                >
                    {(url) => (
                        <img
                            alt=""
                            class="rigged-emoji-picker__image"
                            data-rigged-ui="emoji-picker-image"
                            draggable={false}
                            src={url()}
                        />
                    )}
                </Show>
            </span>
        </button>
    );
}

/**
 * C-043 EmojiPicker — reaction-picker popover on the raised surface. A search
 * field over an emoji grid of fixed, equal 36px slots. Every emoji (unicode
 * char or custom image) sits in the same explicitly sized art slot so the grid
 * stays perfectly regular regardless of artwork; names ride in aria-label/title
 * rather than overlapping the glyph. Props-only and fully controlled: the host
 * filters `emoji` for the current `query` and the component only renders it.
 */
export function EmojiPicker(props: EmojiPickerProps) {
    const [local, rest] = splitProps(props, [
        "class",
        "style",
        "emoji",
        "recent",
        "query",
        "onQueryChange",
        "onSelect",
        "columns",
        "searchPlaceholder",
        "recentLabel",
        "allLabel",
        "emptyLabel",
    ]);

    const columns = () => local.columns ?? DEFAULT_COLUMNS;
    const searching = () => (local.query ?? "") !== "";
    const recentItems = () => {
        const ids = local.recent;
        if (searching() || !ids || ids.length === 0) return [];
        const byId = new Map(local.emoji.map((item) => [item.id, item]));
        return ids
            .map((id) => byId.get(id))
            .filter((item): item is EmojiItem => item !== undefined);
    };
    const hasRecent = () => recentItems().length > 0;
    const gridColumns = () => `repeat(${columns()}, ${CELL}px)`;

    return (
        <div
            {...rest}
            class={["rigged-emoji-picker", local.class].filter(Boolean).join(" ")}
            data-rigged-ui="emoji-picker"
            style={{ ...local.style, width: `${columns() * CELL + CHROME}px` }}
        >
            <div class="rigged-emoji-picker__search" data-rigged-ui="emoji-picker-search">
                <TextField
                    fullWidth
                    leadingIcon="search"
                    onValueChange={(value) => local.onQueryChange?.(value)}
                    placeholder={local.searchPlaceholder ?? "Search emoji"}
                    size="small"
                    type="search"
                    value={local.query ?? ""}
                />
            </div>

            <Show when={hasRecent()}>
                <section
                    class="rigged-emoji-picker__section"
                    data-rigged-ui="emoji-picker-recent-section"
                >
                    <div
                        class="rigged-emoji-picker__label"
                        data-rigged-ui="emoji-picker-recent-label"
                    >
                        {local.recentLabel ?? "Recently used"}
                    </div>
                    <div
                        class="rigged-emoji-picker__grid"
                        data-rigged-ui="emoji-picker-recent-grid"
                        style={{ "grid-template-columns": gridColumns() }}
                    >
                        <For each={recentItems()}>
                            {(item) => <EmojiCell item={item} onSelect={local.onSelect} />}
                        </For>
                    </div>
                </section>
            </Show>

            <section class="rigged-emoji-picker__section" data-rigged-ui="emoji-picker-all-section">
                <Show when={hasRecent()}>
                    <div class="rigged-emoji-picker__label" data-rigged-ui="emoji-picker-all-label">
                        {local.allLabel ?? "All emoji"}
                    </div>
                </Show>
                <Show
                    when={local.emoji.length > 0}
                    fallback={
                        <div class="rigged-emoji-picker__empty" data-rigged-ui="emoji-picker-empty">
                            {local.emptyLabel ?? "No emoji found"}
                        </div>
                    }
                >
                    <div
                        class="rigged-emoji-picker__grid"
                        data-rigged-ui="emoji-picker-grid"
                        style={{ "grid-template-columns": gridColumns() }}
                    >
                        <For each={local.emoji}>
                            {(item) => <EmojiCell item={item} onSelect={local.onSelect} />}
                        </For>
                    </div>
                </Show>
            </section>
        </div>
    );
}
