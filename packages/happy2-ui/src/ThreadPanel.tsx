import { partitionComponentProps } from "./componentProps";
import { type CSSProperties, type ReactNode } from "react";
import { Button } from "./Button";
import { SURFACE_HEADER_HEIGHT } from "./InfoPanel";
import { Toolbar } from "./Toolbar";
export type ThreadPanelProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    title?: string;
    subtitle?: string;
    onClose?: () => void;
    closeLabel?: string;
    /** The thread transcript — typically a MessageList. Fills and scrolls. */
    children: ReactNode;
    /** Reply composer pinned to the bottom of the panel. */
    composer?: ReactNode;
};
/**
 * C-048 ThreadPanel — the thread side panel. A 52px surface header (shared
 * height with ChannelHeader and InfoPanel), a flexible transcript body that
 * fills and scrolls, and an optional reply composer pinned to the bottom.
 * Props only — the app supplies the message list, composer, and close handler.
 */
export function ThreadPanel(props: ThreadPanelProps) {
    const [local] = partitionComponentProps(props, [
        "className",
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
            className={["happy2-thread-panel", local.className].filter(Boolean).join(" ")}
            data-happy2-ui="thread-panel"
            data-testid={local["data-testid"]}
            style={local.style}
        >
            <Toolbar
                className="happy2-thread-panel__header"
                height={SURFACE_HEADER_HEIGHT}
                subtitle={local.subtitle}
                title={local.title ?? "Thread"}
                trailing={
                    local.onClose ? (
                        <Button
                            aria-label={local.closeLabel ?? "Close thread"}
                            icon="close"
                            iconOnly
                            onClick={() => local.onClose?.()}
                            size="small"
                            variant="ghost"
                        />
                    ) : null
                }
            />
            <div className="happy2-thread-panel__body" data-happy2-ui="thread-panel-body">
                {local.children}
            </div>
            {local.composer ? (
                <div
                    className="happy2-thread-panel__composer"
                    data-happy2-ui="thread-panel-composer"
                >
                    {local.composer}
                </div>
            ) : null}
        </section>
    );
}
