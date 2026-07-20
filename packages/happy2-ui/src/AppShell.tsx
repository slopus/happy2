import { partitionComponentProps } from "./componentProps";
import { type CSSProperties, type HTMLAttributes, type ReactNode } from "react";
import { WindowDragRegion } from "./TitleBar";
export type AppShellProps = Omit<HTMLAttributes<HTMLDivElement>, "style"> & {
    children: ReactNode;
    panel?: ReactNode;
    panelWidth?: number;
    /** Optional 64px feature rail. When omitted the content spans the full body. */
    rail?: ReactNode;
    sidebar?: ReactNode;
    style?: CSSProperties;
    titleBar?: ReactNode;
    /** Overlays native macOS traffic-light drag chrome without reserving a title row. */
    windowControls?: boolean;
};
/*
 * Window composition for the Happy desktop app. An optional title bar row,
 * then rail | navigation | workspace and an optional right inspector. Every
 * region meets on a hairline so the desktop feels like one native surface.
 */
export function AppShell(props: AppShellProps) {
    const [local, rest] = partitionComponentProps(props, [
        "children",
        "className",
        "panel",
        "panelWidth",
        "rail",
        "sidebar",
        "style",
        "titleBar",
        "windowControls",
    ]);
    return (
        <div
            {...rest}
            className={["happy2-app-shell", local.className].filter(Boolean).join(" ")}
            data-happy2-ui="app-shell"
            data-window-controls={local.windowControls ? "" : undefined}
            style={local.style}
        >
            {local.windowControls ? (
                <>
                    <WindowDragRegion />
                    <div
                        aria-hidden="true"
                        className="happy2-app-shell__window-controls"
                        data-happy2-ui="app-shell-window-controls"
                    >
                        <span
                            className="happy2-title-bar__controls"
                            data-happy2-ui="title-bar-controls"
                        />
                    </div>
                </>
            ) : null}
            {local.titleBar ? (
                <div className="happy2-app-shell__title-bar" data-happy2-ui="app-shell-title-bar">
                    {local.titleBar}
                </div>
            ) : null}
            <div className="happy2-app-shell__body" data-happy2-ui="app-shell-body">
                {local.rail ? (
                    <div className="happy2-app-shell__rail" data-happy2-ui="app-shell-rail">
                        {local.rail}
                    </div>
                ) : null}
                <div className="happy2-app-shell__content" data-happy2-ui="app-shell-content">
                    <main className="happy2-app-shell__main" data-happy2-ui="app-shell-main">
                        {local.sidebar ? (
                            <div
                                className="happy2-app-shell__sidebar"
                                data-happy2-ui="app-shell-sidebar"
                            >
                                {local.sidebar}
                            </div>
                        ) : null}
                        <div
                            className="happy2-app-shell__workspace"
                            data-happy2-ui="app-shell-workspace"
                        >
                            {local.children}
                        </div>
                    </main>
                    {local.panel ? (
                        <aside
                            className="happy2-app-shell__panel"
                            data-happy2-ui="app-shell-panel"
                            style={
                                local.panelWidth === undefined
                                    ? undefined
                                    : { width: `${local.panelWidth}px` }
                            }
                        >
                            {local.panel}
                        </aside>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
