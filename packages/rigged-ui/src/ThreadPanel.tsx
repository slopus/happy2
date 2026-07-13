import { Show, splitProps, type JSX } from "solid-js";
import { Button } from "./Button";
import { SURFACE_HEADER_HEIGHT } from "./InfoPanel";
import { Toolbar } from "./Toolbar";

export type ThreadPanelProps = {
    class?: string;
    "data-testid"?: string;
    style?: JSX.CSSProperties;
    title?: string;
    subtitle?: string;
    onClose?: () => void;
    closeLabel?: string;
    /** The thread transcript — typically a MessageList. Fills and scrolls. */
    children: JSX.Element;
    /** Reply composer pinned to the bottom of the panel. */
    composer?: JSX.Element;
};

/**
 * C-048 ThreadPanel — the thread side panel. A 52px surface header (shared
 * height with ChannelHeader and InfoPanel), a flexible transcript body that
 * fills and scrolls, and an optional reply composer pinned to the bottom.
 * Props only — the app supplies the message list, composer, and close handler.
 */
export function ThreadPanel(props: ThreadPanelProps) {
    const [local] = splitProps(props, [
        "class",
        "data-testid",
        "style",
        "title",
        "subtitle",
        "onClose",
        "closeLabel",
        "children",
        "composer",
    ]);

    return (
        <section
            class={["rigged-thread-panel", local.class].filter(Boolean).join(" ")}
            data-rigged-ui="thread-panel"
            data-testid={local["data-testid"]}
            style={local.style}
        >
            <Toolbar
                class="rigged-thread-panel__header"
                height={SURFACE_HEADER_HEIGHT}
                subtitle={local.subtitle}
                title={local.title ?? "Thread"}
                trailing={
                    <Show when={local.onClose}>
                        <Button
                            aria-label={local.closeLabel ?? "Close thread"}
                            icon="close"
                            iconOnly
                            onClick={() => local.onClose?.()}
                            size="small"
                            variant="ghost"
                        />
                    </Show>
                }
            />
            <div class="rigged-thread-panel__body" data-rigged-ui="thread-panel-body">
                {local.children}
            </div>
            <Show when={local.composer}>
                <div class="rigged-thread-panel__composer" data-rigged-ui="thread-panel-composer">
                    {local.composer}
                </div>
            </Show>
        </section>
    );
}
