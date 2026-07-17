import { splitProps, type JSX } from "solid-js";

export type ModalOverlayProps = {
    class?: string;
    "data-testid"?: string;
    style?: JSX.CSSProperties;
    children: JSX.Element;
    /**
     * Called when the dim outside the hosted card is clicked. Wiring it makes
     * the backdrop dismissable; omit it for surfaces that must not be closed by
     * clicking away — e.g. an editor holding unsaved work.
     */
    onDismiss?: () => void;
};

/**
 * C-058 ModalOverlay — the single backdrop every modal-class surface sits on.
 *
 * One dim (`--happy2-scrim`), one stacking level (`--happy2-z-overlay`), fixed
 * to the app window, and a flex box that centers exactly one hosted card
 * (Modal, Lightbox, or an editor panel) inside a 24px safe-area gutter. This is
 * the only sanctioned modal location: application code composes it instead of
 * hand-rolling per-view scrims, so every dialog dims, stacks, and centers
 * identically. Clicking the dim outside the card calls `onDismiss` when wired;
 * clicks inside the card never dismiss.
 */
export function ModalOverlay(props: ModalOverlayProps) {
    const [local, rest] = splitProps(props, ["class", "style", "children", "onDismiss"]);

    return (
        <div
            {...rest}
            class={["happy2-modal-overlay", local.class].filter(Boolean).join(" ")}
            data-happy2-ui="modal-overlay"
            onClick={(event) => {
                if (local.onDismiss && event.target === event.currentTarget) local.onDismiss();
            }}
            style={local.style}
        >
            {local.children}
        </div>
    );
}
