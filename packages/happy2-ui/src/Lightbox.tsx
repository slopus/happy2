import { splitProps } from "./reactProps";
import { type CSSProperties, type ReactNode } from "react";
import { Button } from "./Button";
export type LightboxProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    imageUrl: string;
    alt?: string;
    /** Primary label above the frame — usually the file name. */
    caption?: string;
    /** Secondary meta above the frame — usually size / dimensions. */
    detail?: string;
    /** Trailing controls in the header, e.g. a download button. */
    actions?: ReactNode;
    onClose?: () => void;
    closeLabel?: string;
};
/**
 * C-046 Lightbox — full image preview shown inside a web modal (never a new
 * browser tab). Like Modal, the root `.happy2-lightbox` is a transparent
 * centering layer (no scrim, no fixed positioning) so it renders as a
 * screenshot-safe specimen; a consuming app portals it over its own backdrop.
 * The measured card is the inner `data-happy2-ui="lightbox-dialog"`: an optional
 * caption/detail + actions header and a contained image on the code surface.
 */
export function Lightbox(props: LightboxProps) {
    const [local, rest] = splitProps(props, [
        "className",
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
            className={["happy2-lightbox", local.className].filter(Boolean).join(" ")}
            data-happy2-ui="lightbox"
            style={local.style}
        >
            <div
                aria-label={local.caption ?? local.alt ?? "Image preview"}
                aria-modal="true"
                className="happy2-lightbox__dialog"
                data-happy2-ui="lightbox-dialog"
                role="dialog"
            >
                {hasHeader() ? (
                    <header className="happy2-lightbox__header" data-happy2-ui="lightbox-header">
                        <div className="happy2-lightbox__caption" data-happy2-ui="lightbox-caption">
                            {local.caption ? (
                                <span
                                    className="happy2-lightbox__caption-title"
                                    data-happy2-ui="lightbox-caption-title"
                                >
                                    {local.caption}
                                </span>
                            ) : null}
                            {local.detail ? (
                                <span
                                    className="happy2-lightbox__caption-detail"
                                    data-happy2-ui="lightbox-caption-detail"
                                >
                                    {local.detail}
                                </span>
                            ) : null}
                        </div>
                        <div className="happy2-lightbox__tools" data-happy2-ui="lightbox-tools">
                            {local.actions}
                            {local.onClose ? (
                                <Button
                                    aria-label={local.closeLabel ?? "Close"}
                                    icon="close"
                                    iconOnly
                                    onClick={() => local.onClose?.()}
                                    size="small"
                                    variant="ghost"
                                />
                            ) : null}
                        </div>
                    </header>
                ) : null}
                <div className="happy2-lightbox__frame" data-happy2-ui="lightbox-frame">
                    <img
                        alt={local.alt ?? local.caption ?? ""}
                        className="happy2-lightbox__image"
                        data-happy2-ui="lightbox-image"
                        draggable={false}
                        src={local.imageUrl}
                    />
                </div>
            </div>
        </div>
    );
}
