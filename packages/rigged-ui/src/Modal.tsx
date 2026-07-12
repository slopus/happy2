import { Show, splitProps, type JSX } from "solid-js";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";

export type ModalSize = "small" | "medium" | "large";
export type ModalTone = "default" | "danger";

export type ModalProps = {
    class?: string;
    closeLabel?: string;
    "data-testid"?: string;
    style?: JSX.CSSProperties;
    title: string;
    children: JSX.Element;
    footer?: JSX.Element;
    onClose?: () => void;
    size?: ModalSize;
    tone?: ModalTone;
    icon?: IconName;
};

/**
 * C-028 Modal — dialog card with header / body / footer on a raised surface.
 *
 * The root `.rigged-modal` is a transparent centering layer (no scrim, no fixed
 * positioning) so the dialog renders as a screenshot-safe specimen; a consuming
 * app portals it over its own backdrop. The measured card is the inner
 * `data-rigged-ui="modal-dialog"`: three fixed widths (360 / 480 / 640), a 14px
 * shell radius, header (optional leading icon chip + title + close), a scrollable
 * body slot, and an optional right-aligned footer action row.
 */
export function Modal(props: ModalProps) {
    const [local, rest] = splitProps(props, [
        "class",
        "closeLabel",
        "style",
        "title",
        "children",
        "footer",
        "onClose",
        "size",
        "tone",
        "icon",
    ]);
    const size = () => local.size ?? "medium";
    const tone = () => local.tone ?? "default";

    return (
        <div
            {...rest}
            class={["rigged-modal", local.class].filter(Boolean).join(" ")}
            data-rigged-ui="modal"
            style={local.style}
        >
            <div
                aria-label={local.title}
                aria-modal="true"
                class="rigged-modal__dialog"
                data-rigged-ui="modal-dialog"
                data-size={size()}
                data-tone={tone()}
                role="dialog"
            >
                <header class="rigged-modal__header" data-rigged-ui="modal-header">
                    <Show when={local.icon}>
                        {(name) => (
                            <span class="rigged-modal__icon" data-rigged-ui="modal-icon">
                                <Icon name={name()} size={16} />
                            </span>
                        )}
                    </Show>
                    <h2 class="rigged-modal__title" data-rigged-ui="modal-title">
                        {local.title}
                    </h2>
                    <Show when={local.onClose}>
                        <Button
                            aria-label={local.closeLabel ?? "Close"}
                            class="rigged-modal__close"
                            icon="close"
                            iconOnly
                            onClick={() => local.onClose?.()}
                            size="small"
                            variant="ghost"
                        />
                    </Show>
                </header>
                <div class="rigged-modal__body" data-rigged-ui="modal-body">
                    {local.children}
                </div>
                <Show when={local.footer}>
                    <footer class="rigged-modal__footer" data-rigged-ui="modal-footer">
                        {local.footer}
                    </footer>
                </Show>
            </div>
        </div>
    );
}
