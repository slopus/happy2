import { partitionComponentProps } from "./componentProps";
import { type CSSProperties, type ReactNode } from "react";
export type ModalOverlayProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    children: ReactNode;
    /**
     * Called when the dim outside the hosted card is clicked. Wiring it makes
     * the backdrop dismissable; omit it for surfaces that must not be closed by
     * clicking away — e.g. an editor holding unsaved work.
     */
    onDismiss?: () => void;
    /**
     * `center` (default) hosts dialogs and forms in the standard modal
     * location. `top` anchors transient type-ahead surfaces below the adaptive
     * top gutter; it is not a form placement.
     */
    placement?: "center" | "top";
};
/**
 * C-058 ModalOverlay — the single backdrop every modal-class surface sits on.
 *
 * One dim (`--happy2-scrim`), one stacking level (`--happy2-z-overlay`), fixed
 * to the app window, and a flex box that hosts exactly one card (Modal,
 * Lightbox, editor panel, or transient type-ahead) inside a 24px safe-area
 * gutter. The default placement centers dialogs and forms; `top` anchors a
 * transient type-ahead below an adaptive top gutter. Clicking the dim outside
 * the card calls `onDismiss` when wired; clicks inside the card never dismiss.
 */
export function ModalOverlay(props: ModalOverlayProps) {
    const [local, rest] = partitionComponentProps(props, [
        "className",
        "style",
        "children",
        "onDismiss",
        "placement",
    ]);
    return (
        <div
            {...rest}
            className={["happy2-modal-overlay", local.className].filter(Boolean).join(" ")}
            data-happy2-ui="modal-overlay"
            data-placement={local.placement === "top" ? "top" : undefined}
            onClick={(event) => {
                if (
                    local.onDismiss &&
                    (event.target === event.currentTarget ||
                        (local.placement === "top" &&
                            event.target instanceof HTMLElement &&
                            event.target.dataset.happy2Ui === "modal-overlay-top-layout"))
                )
                    local.onDismiss();
            }}
            onKeyDown={(event) => {
                if (event.key === "Escape") local.onDismiss?.();
            }}
            style={local.style}
        >
            {local.placement === "top" ? (
                <div
                    className="happy2-modal-overlay__top-layout"
                    data-happy2-ui="modal-overlay-top-layout"
                >
                    {local.children}
                </div>
            ) : (
                local.children
            )}
        </div>
    );
}
