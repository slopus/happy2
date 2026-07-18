import { partitionComponentProps } from "./componentProps";
import { type CSSProperties, type HTMLAttributes, type ReactNode } from "react";
export type AppShellProps = Omit<HTMLAttributes<HTMLDivElement>, "style"> & {
    children: ReactNode;
    panel?: ReactNode;
    panelWidth?: number;
    rail: ReactNode;
    sidebar?: ReactNode;
    style?: CSSProperties;
    titleBar: ReactNode;
};
/*
 * Window composition for the Relay desktop app. Chrome base, title bar row,
 * then rail | the main card (no top/left inset, 8px right/bottom inset and
 * native-window radius) and an optional right panel card across an 8px gap.
 * The optional sidebar lives inside the main card so navigation and workspace
 * form one continuous content panel.
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
    ]);
    return (
        <div
            {...rest}
            className={["happy2-app-shell", local.className].filter(Boolean).join(" ")}
            data-happy2-ui="app-shell"
            style={local.style}
        >
            <div className="happy2-app-shell__title-bar" data-happy2-ui="app-shell-title-bar">
                {local.titleBar}
            </div>
            <div className="happy2-app-shell__body" data-happy2-ui="app-shell-body">
                <div className="happy2-app-shell__rail" data-happy2-ui="app-shell-rail">
                    {local.rail}
                </div>
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
                            style={{ width: `${local.panelWidth ?? 340}px` }}
                        >
                            {local.panel}
                        </aside>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
