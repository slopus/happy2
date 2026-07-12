import { Show, splitProps, type JSX } from "solid-js";

export type AppShellProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, "style"> & {
    children: JSX.Element;
    panel?: JSX.Element;
    panelWidth?: number;
    rail: JSX.Element;
    sidebar?: JSX.Element;
    style?: JSX.CSSProperties;
    titleBar: JSX.Element;
};

/*
 * Window composition for the Relay desktop app. Chrome base, title bar row,
 * then rail | the main card (no top/left inset, 8px right/bottom inset and
 * native-window radius) and an optional right panel card across an 8px gap.
 * The optional sidebar lives inside the main card so navigation and workspace
 * form one continuous content panel.
 */
export function AppShell(props: AppShellProps) {
    const [local, rest] = splitProps(props, [
        "children",
        "class",
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
            class={["rigged-app-shell", local.class].filter(Boolean).join(" ")}
            data-rigged-ui="app-shell"
            style={local.style}
        >
            <div class="rigged-app-shell__title-bar" data-rigged-ui="app-shell-title-bar">
                {local.titleBar}
            </div>
            <div class="rigged-app-shell__body" data-rigged-ui="app-shell-body">
                <div class="rigged-app-shell__rail" data-rigged-ui="app-shell-rail">
                    {local.rail}
                </div>
                <div class="rigged-app-shell__content" data-rigged-ui="app-shell-content">
                    <main class="rigged-app-shell__main" data-rigged-ui="app-shell-main">
                        <Show when={local.sidebar}>
                            <div
                                class="rigged-app-shell__sidebar"
                                data-rigged-ui="app-shell-sidebar"
                            >
                                {local.sidebar}
                            </div>
                        </Show>
                        <div
                            class="rigged-app-shell__workspace"
                            data-rigged-ui="app-shell-workspace"
                        >
                            {local.children}
                        </div>
                    </main>
                    <Show when={local.panel}>
                        <aside
                            class="rigged-app-shell__panel"
                            data-rigged-ui="app-shell-panel"
                            style={{ width: `${local.panelWidth ?? 340}px` }}
                        >
                            {local.panel}
                        </aside>
                    </Show>
                </div>
            </div>
        </div>
    );
}
