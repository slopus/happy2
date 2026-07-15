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
 * The root `.happy2-modal` is a transparent centering layer (no scrim, no fixed
 * positioning) so the dialog renders as a screenshot-safe specimen; a consuming
 * app portals it over its own backdrop. The measured card is the inner
 * `data-happy2-ui="modal-dialog"`: three fixed widths (360 / 480 / 640), a 14px
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
            class={["happy2-modal", local.class].filter(Boolean).join(" ")}
            data-happy2-ui="modal"
            style={local.style}
        >
            <div
                aria-label={local.title}
                aria-modal="true"
                class="happy2-modal__dialog"
                data-happy2-ui="modal-dialog"
                data-size={size()}
                data-tone={tone()}
                role="dialog"
            >
                <header class="happy2-modal__header" data-happy2-ui="modal-header">
                    <Show when={local.icon}>
                        {(name) => (
                            <span class="happy2-modal__icon" data-happy2-ui="modal-icon">
                                <Icon name={name()} size={16} />
                            </span>
                        )}
                    </Show>
                    <h2 class="happy2-modal__title" data-happy2-ui="modal-title">
                        {local.title}
                    </h2>
                    <Show when={local.onClose}>
                        <Button
                            aria-label={local.closeLabel ?? "Close"}
                            class="happy2-modal__close"
                            icon="close"
                            iconOnly
                            onClick={() => local.onClose?.()}
                            size="small"
                            variant="ghost"
                        />
                    </Show>
                </header>
                <div class="happy2-modal__body" data-happy2-ui="modal-body">
                    {local.children}
                </div>
                <Show when={local.footer}>
                    <footer class="happy2-modal__footer" data-happy2-ui="modal-footer">
                        {local.footer}
                    </footer>
                </Show>
            </div>
        </div>
    );
}
