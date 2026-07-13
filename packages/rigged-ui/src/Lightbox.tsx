import { Show, splitProps, type JSX } from "solid-js";
import { Button } from "./Button";

export type LightboxProps = {
    class?: string;
    "data-testid"?: string;
    style?: JSX.CSSProperties;
    imageUrl: string;
    alt?: string;
    /** Primary label above the frame — usually the file name. */
    caption?: string;
    /** Secondary meta above the frame — usually size / dimensions. */
    detail?: string;
    /** Trailing controls in the header, e.g. a download button. */
    actions?: JSX.Element;
    onClose?: () => void;
    closeLabel?: string;
};

/**
 * C-046 Lightbox — full image preview shown inside a web modal (never a new
 * browser tab). Like Modal, the root `.rigged-lightbox` is a transparent
 * centering layer (no scrim, no fixed positioning) so it renders as a
 * screenshot-safe specimen; a consuming app portals it over its own backdrop.
 * The measured card is the inner `data-rigged-ui="lightbox-dialog"`: an optional
 * caption/detail + actions header and a contained image on the code surface.
 */
export function Lightbox(props: LightboxProps) {
    const [local, rest] = splitProps(props, [
        "class",
        "style",
        "imageUrl",
        "alt",
        "caption",
        "detail",
        "actions",
        "onClose",
        "closeLabel",
    ]);
    const hasHeader = () =>
        Boolean(local.caption || local.detail || local.actions || local.onClose);

    return (
        <div
            {...rest}
            class={["rigged-lightbox", local.class].filter(Boolean).join(" ")}
            data-rigged-ui="lightbox"
            style={local.style}
        >
            <div
                aria-label={local.caption ?? local.alt ?? "Image preview"}
                aria-modal="true"
                class="rigged-lightbox__dialog"
                data-rigged-ui="lightbox-dialog"
                role="dialog"
            >
                <Show when={hasHeader()}>
                    <header class="rigged-lightbox__header" data-rigged-ui="lightbox-header">
                        <div class="rigged-lightbox__caption" data-rigged-ui="lightbox-caption">
                            <Show when={local.caption}>
                                <span
                                    class="rigged-lightbox__caption-title"
                                    data-rigged-ui="lightbox-caption-title"
                                >
                                    {local.caption}
                                </span>
                            </Show>
                            <Show when={local.detail}>
                                <span
                                    class="rigged-lightbox__caption-detail"
                                    data-rigged-ui="lightbox-caption-detail"
                                >
                                    {local.detail}
                                </span>
                            </Show>
                        </div>
                        <div class="rigged-lightbox__tools" data-rigged-ui="lightbox-tools">
                            {local.actions}
                            <Show when={local.onClose}>
                                <Button
                                    aria-label={local.closeLabel ?? "Close"}
                                    icon="close"
                                    iconOnly
                                    onClick={() => local.onClose?.()}
                                    size="small"
                                    variant="ghost"
                                />
                            </Show>
                        </div>
                    </header>
                </Show>
                <div class="rigged-lightbox__frame" data-rigged-ui="lightbox-frame">
                    <img
                        alt={local.alt ?? local.caption ?? ""}
                        class="rigged-lightbox__image"
                        data-rigged-ui="lightbox-image"
                        draggable={false}
                        src={local.imageUrl}
                    />
                </div>
            </div>
        </div>
    );
}
