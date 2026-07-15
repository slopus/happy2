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
            class={["happy2-app-shell", local.class].filter(Boolean).join(" ")}
            data-happy2-ui="app-shell"
            style={local.style}
        >
            <div class="happy2-app-shell__title-bar" data-happy2-ui="app-shell-title-bar">
                {local.titleBar}
            </div>
            <div class="happy2-app-shell__body" data-happy2-ui="app-shell-body">
                <div class="happy2-app-shell__rail" data-happy2-ui="app-shell-rail">
                    {local.rail}
                </div>
                <div class="happy2-app-shell__content" data-happy2-ui="app-shell-content">
                    <main class="happy2-app-shell__main" data-happy2-ui="app-shell-main">
                        <Show when={local.sidebar}>
                            <div
                                class="happy2-app-shell__sidebar"
                                data-happy2-ui="app-shell-sidebar"
                            >
                                {local.sidebar}
                            </div>
                        </Show>
                        <div
                            class="happy2-app-shell__workspace"
                            data-happy2-ui="app-shell-workspace"
                        >
                            {local.children}
                        </div>
                    </main>
                    <Show when={local.panel}>
                        <aside
                            class="happy2-app-shell__panel"
                            data-happy2-ui="app-shell-panel"
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
