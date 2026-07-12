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
 * then rail | optional sidebar | the inset main card (8px inset, 14px radius
 * contract) and an optional right panel card sharing the same 8px rhythm.
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
                <Show when={local.sidebar}>
                    <div class="rigged-app-shell__sidebar" data-rigged-ui="app-shell-sidebar">
                        {local.sidebar}
                    </div>
                </Show>
                <div class="rigged-app-shell__content" data-rigged-ui="app-shell-content">
                    <main class="rigged-app-shell__main" data-rigged-ui="app-shell-main">
                        {local.children}
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
