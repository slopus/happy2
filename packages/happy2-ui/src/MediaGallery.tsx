import { splitProps } from "./reactProps";
import { type CSSProperties, type ReactNode } from "react";
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
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    items: MediaItem[];
    columns?: number;
    onOpen?: (id: string) => void;
    empty?: ReactNode;
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
            className="happy2-media-gallery__tile"
            data-kind={item().kind}
            data-media-id={item().id}
            data-happy2-ui="media-tile"
            onClick={() => props.onOpen?.(item().id)}
            type="button"
        >
            <span className="happy2-media-gallery__thumb" data-happy2-ui="media-thumb">
                {item().thumbnailUrl ? (
                    ((url) => (
                        <img
                            alt={item().name ?? ""}
                            className="happy2-media-gallery__image"
                            data-happy2-ui="media-image"
                            src={url}
                        />
                    ))(item().thumbnailUrl!)
                ) : (
                    <span className="happy2-media-gallery__glyph" data-happy2-ui="media-glyph">
                        <Icon name={glyphIcons[item().kind]} size={20} />
                    </span>
                )}
                {kindLabel()
                    ? ((label) => (
                          <span className="happy2-media-gallery__kind" data-happy2-ui="media-kind">
                              <Badge label={label} variant="neutral" />
                          </span>
                      ))(kindLabel()!)
                    : null}
                {item().duration
                    ? ((duration) => (
                          <span
                              className="happy2-media-gallery__duration"
                              data-happy2-ui="media-duration"
                          >
                              {duration}
                          </span>
                      ))(item().duration!)
                    : null}
            </span>
            {hasFooter() ? (
                <span className="happy2-media-gallery__footer" data-happy2-ui="media-footer">
                    {item().name
                        ? ((name) => (
                              <span
                                  className="happy2-media-gallery__name"
                                  data-happy2-ui="media-name"
                              >
                                  {name}
                              </span>
                          ))(item().name)
                        : null}
                    {item().size
                        ? ((size) => (
                              <span
                                  className="happy2-media-gallery__size"
                                  data-happy2-ui="media-size"
                              >
                                  {size}
                              </span>
                          ))(item().size)
                        : null}
                </span>
            ) : null}
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
        "className",
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
            className={["happy2-media-gallery", local.className].filter(Boolean).join(" ")}
            data-happy2-ui="media-gallery"
            data-testid={local["data-testid"]}
            style={{
                ...local.style,
                gridTemplateColumns: `repeat(${columns()}, minmax(0, 1fr))`,
            }}
        >
            {!isEmpty() ? (
                local.items.map((item) => (
                    <MediaTile key={item.id} item={item} onOpen={local.onOpen} />
                ))
            ) : (
                <div className="happy2-media-gallery__empty" data-happy2-ui="media-empty">
                    {local.empty}
                </div>
            )}
        </div>
    );
}
