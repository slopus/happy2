import { For, Show, splitProps, type JSX } from "solid-js";
import { Badge } from "./Badge";
import { Icon, type IconName } from "./Icon";

export type MediaKind = "photo" | "video" | "gif" | "file";
export type MediaItem = {
    id: string;
    kind: MediaKind;
    name?: string;
    thumbnailUrl?: string;
    size?: string;
    duration?: string;
};

export type MediaGalleryProps = {
    class?: string;
    "data-testid"?: string;
    style?: JSX.CSSProperties;
    items: MediaItem[];
    columns?: number;
    onOpen?: (id: string) => void;
    empty?: JSX.Element;
};

/* Fallback glyph for a tile with no thumbnail, by kind. `doc` is the file
 * document glyph; the others cover a missing preview. Only the symmetric
 * glyphs are optically strict — directional ones (play) keep their own axis
 * bias, exactly as Icon.tsx documents. */
const glyphIcons: Record<MediaKind, IconName> = {
    photo: "files",
    video: "play",
    gif: "play",
    file: "doc",
};

/* Only ambiguous thumbnail kinds carry a kind badge overlay. */
const kindLabels: Partial<Record<MediaKind, string>> = {
    video: "VIDEO",
    gif: "GIF",
};

function MediaTile(props: { item: MediaItem; onOpen?: (id: string) => void }) {
    const item = () => props.item;
    const kindLabel = () => kindLabels[item().kind];
    const hasFooter = () => item().name !== undefined || item().size !== undefined;

    return (
        <button
            class="happy2-media-gallery__tile"
            data-kind={item().kind}
            data-media-id={item().id}
            data-happy2-ui="media-tile"
            onClick={() => props.onOpen?.(item().id)}
            type="button"
        >
            <span class="happy2-media-gallery__thumb" data-happy2-ui="media-thumb">
                <Show
                    when={item().thumbnailUrl}
                    fallback={
                        <span class="happy2-media-gallery__glyph" data-happy2-ui="media-glyph">
                            <Icon name={glyphIcons[item().kind]} size={20} />
                        </span>
                    }
                >
                    {(url) => (
                        <img
                            alt={item().name ?? ""}
                            class="happy2-media-gallery__image"
                            data-happy2-ui="media-image"
                            src={url()}
                        />
                    )}
                </Show>
                <Show when={kindLabel()}>
                    {(label) => (
                        <span class="happy2-media-gallery__kind" data-happy2-ui="media-kind">
                            <Badge label={label()} variant="neutral" />
                        </span>
                    )}
                </Show>
                <Show when={item().duration}>
                    {(duration) => (
                        <span
                            class="happy2-media-gallery__duration"
                            data-happy2-ui="media-duration"
                        >
                            {duration()}
                        </span>
                    )}
                </Show>
            </span>
            <Show when={hasFooter()}>
                <span class="happy2-media-gallery__footer" data-happy2-ui="media-footer">
                    <Show when={item().name}>
                        {(name) => (
                            <span class="happy2-media-gallery__name" data-happy2-ui="media-name">
                                {name()}
                            </span>
                        )}
                    </Show>
                    <Show when={item().size}>
                        {(size) => (
                            <span class="happy2-media-gallery__size" data-happy2-ui="media-size">
                                {size()}
                            </span>
                        )}
                    </Show>
                </span>
            </Show>
        </button>
    );
}

/**
 * C-038 MediaGallery — files/media grid. An equal-track grid of tiles; each
 * tile is a 4:3 thumbnail (data-URI image or a centered file-glyph medallion)
 * with an optional kind badge (video/gif) and duration chip overlay, plus a
 * name + size footer. Product data (thumbnails, sizes, durations) arrives via
 * props; the component never loads a network asset.
 */
export function MediaGallery(props: MediaGalleryProps) {
    const [local] = splitProps(props, [
        "class",
        "columns",
        "data-testid",
        "empty",
        "items",
        "onOpen",
        "style",
    ]);
    const columns = () => local.columns ?? 4;
    const isEmpty = () => local.items.length === 0 && local.empty !== undefined;

    return (
        <div
            class={["happy2-media-gallery", local.class].filter(Boolean).join(" ")}
            data-happy2-ui="media-gallery"
            data-testid={local["data-testid"]}
            style={{
                ...local.style,
                "grid-template-columns": `repeat(${columns()}, minmax(0, 1fr))`,
            }}
        >
            <Show
                when={!isEmpty()}
                fallback={
                    <div class="happy2-media-gallery__empty" data-happy2-ui="media-empty">
                        {local.empty}
                    </div>
                }
            >
                <For each={local.items}>
                    {(item) => <MediaTile item={item} onOpen={local.onOpen} />}
                </For>
            </Show>
        </div>
    );
}
