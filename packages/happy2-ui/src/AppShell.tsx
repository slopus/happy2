import { partitionComponentProps } from "./componentProps";
import { useRef, useState, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";
import { Icon } from "./Icon";
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
    /**
     * Enables the left sidebar show/hide toggle and pointer/keyboard resize. When
     * omitted the sidebar keeps its fixed `clamp(250px, 30vw, 360px)` contract and
     * renders no interaction chrome, so existing callers are unaffected.
     */
    sidebarCollapsible?: boolean;
    /** Initial sidebar width (clamped) once `sidebarCollapsible` is set. */
    sidebarDefaultWidth?: number;
    sidebarMinWidth?: number;
    sidebarMaxWidth?: number;
    /** Start collapsed. The sidebar DOM stays mounted; only its box is hidden. */
    sidebarDefaultCollapsed?: boolean;
    sidebarCollapseLabel?: string;
    sidebarExpandLabel?: string;
    sidebarResizeLabel?: string;
    /**
     * Enables pointer/keyboard resize of the right inspector panel. When omitted the
     * panel keeps its existing `panelWidth`/clamp contract and renders no handle.
     */
    panelResizable?: boolean;
    /** Initial panel width (clamped) once `panelResizable` is set; falls back to `panelWidth`. */
    panelDefaultWidth?: number;
    panelMinWidth?: number;
    panelMaxWidth?: number;
    /** Enables the panel maximize/restore control that overlays the whole content region. */
    panelMaximizable?: boolean;
    panelDefaultMaximized?: boolean;
    /**
     * Controlled maximize state. When provided the caller owns whether the panel is
     * maximized (e.g. to swap in extra panel content while expanded); AppShell stops
     * tracking it internally and only reports intent through `onPanelMaximizedChange`.
     */
    panelMaximized?: boolean;
    onPanelMaximizedChange?: (maximized: boolean) => void;
    /**
     * Optional content pinned to the bottom of the panel column, below the panel
     * body. Used to keep a composer/input usable while the panel body (e.g. a live
     * trace) fills the expanded region. Rendering it does not affect the panel body's
     * identity, so the body stays mounted as the footer mounts/unmounts.
     */
    panelFooter?: ReactNode;
    panelMaximizeLabel?: string;
    panelRestoreLabel?: string;
    panelResizeLabel?: string;
};
const SIDEBAR_DEFAULT_WIDTH = 288;
const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_WIDTH = 480;
const PANEL_DEFAULT_WIDTH = 340;
const PANEL_MIN_WIDTH = 280;
const PANEL_MAX_WIDTH = 560;
const FIXED_SIDEBAR_MIN_WIDTH = 250;
const RESIZE_HANDLE_WIDTH = 8;
const REVEAL_WIDTH = 48;
const WINDOW_CONTROLS_REVEAL_WIDTH = 76;
const WORKSPACE_MIN_WIDTH = 140;
function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}
/**
 * A vertical drag divider. It is the ARIA `separator` that owns the adjacent
 * region's width: pointer drags use pointer capture (no window listeners), and
 * Arrow/Home/End keys nudge the boundary. `edge` names which side of the region
 * the handle sits on, so the same math grows the sidebar (handle on its right)
 * and the panel (handle on its left). All resize state is local UI state; the
 * caller receives only clamped width values through `onResize`.
 */
function ResizeHandle(props: {
    edge: "left" | "right";
    label: string;
    max: number;
    min: number;
    onResize: (next: number) => void;
    step?: number;
    value: number;
}) {
    const drag = useRef<{ pointerX: number; width: number } | null>(null);
    const sign = props.edge === "right" ? 1 : -1;
    const step = props.step ?? 16;
    function apply(width: number) {
        props.onResize(clamp(Math.round(width), props.min, props.max));
    }
    return (
        <div
            aria-label={props.label}
            aria-orientation="vertical"
            aria-valuemax={props.max}
            aria-valuemin={props.min}
            aria-valuenow={Math.round(props.value)}
            className="happy2-app-shell__resize-handle"
            data-edge={props.edge}
            data-happy2-ui="app-shell-resize-handle"
            onKeyDown={(event) => {
                const keyDelta =
                    event.key === "ArrowRight"
                        ? step
                        : event.key === "ArrowLeft"
                          ? -step
                          : undefined;
                if (keyDelta !== undefined) {
                    event.preventDefault();
                    apply(props.value + sign * keyDelta);
                } else if (event.key === "Home") {
                    event.preventDefault();
                    apply(props.edge === "right" ? props.min : props.max);
                } else if (event.key === "End") {
                    event.preventDefault();
                    apply(props.edge === "right" ? props.max : props.min);
                }
            }}
            onLostPointerCapture={() => {
                drag.current = null;
            }}
            onPointerCancel={() => {
                drag.current = null;
            }}
            onPointerDown={(event) => {
                event.preventDefault();
                drag.current = { pointerX: event.clientX, width: props.value };
                try {
                    event.currentTarget.setPointerCapture(event.pointerId);
                } catch {
                    // Synthetic or already-released pointers cannot be captured; the
                    // move handler still works when events target this element.
                }
            }}
            onPointerMove={(event) => {
                const start = drag.current;
                if (!start) return;
                apply(start.width + sign * (event.clientX - start.pointerX));
            }}
            onPointerUp={(event) => {
                drag.current = null;
                try {
                    event.currentTarget.releasePointerCapture(event.pointerId);
                } catch {
                    // Capture may already be lost; clearing drag state above is enough.
                }
            }}
            role="separator"
            // A focusable window splitter is an intentionally interactive separator
            // (WAI-ARIA window-splitter pattern): it must take keyboard focus so the
            // Arrow/Home/End resize keys above are reachable without a pointer.
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable resize separator
            tabIndex={0}
        >
            <span
                className="happy2-app-shell__resize-line"
                data-happy2-ui="app-shell-resize-line"
            />
        </div>
    );
}
/*
 * Window composition for the Happy desktop app. An optional title bar row,
 * then rail | navigation | workspace and an optional right inspector. Every
 * region meets on a hairline so the desktop feels like one native surface.
 *
 * The sidebar collapse/resize, the panel resize, and the panel maximize/restore
 * are narrowly scoped local UI interactions owned here so application code stays
 * props-only. Maximize overlays the whole content region — including the left
 * sidebar — while keeping the sidebar, workspace, and panel DOM nodes mounted so
 * focus, scroll, and any in-flight content survive the transition.
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
        "sidebarCollapsible",
        "sidebarDefaultWidth",
        "sidebarMinWidth",
        "sidebarMaxWidth",
        "sidebarDefaultCollapsed",
        "sidebarCollapseLabel",
        "sidebarExpandLabel",
        "sidebarResizeLabel",
        "panelResizable",
        "panelDefaultWidth",
        "panelMinWidth",
        "panelMaxWidth",
        "panelMaximizable",
        "panelDefaultMaximized",
        "panelMaximized",
        "onPanelMaximizedChange",
        "panelFooter",
        "panelMaximizeLabel",
        "panelRestoreLabel",
        "panelResizeLabel",
    ]);
    const sidebarMin = local.sidebarMinWidth ?? SIDEBAR_MIN_WIDTH;
    const sidebarMax = local.sidebarMaxWidth ?? SIDEBAR_MAX_WIDTH;
    const panelMin = local.panelMinWidth ?? PANEL_MIN_WIDTH;
    const panelMax = local.panelMaxWidth ?? PANEL_MAX_WIDTH;
    const [sidebarCollapsed, setSidebarCollapsed] = useState(
        local.sidebarDefaultCollapsed ?? false,
    );
    const [sidebarWidth, setSidebarWidth] = useState(() =>
        clamp(local.sidebarDefaultWidth ?? SIDEBAR_DEFAULT_WIDTH, sidebarMin, sidebarMax),
    );
    const [panelWidth, setPanelWidth] = useState(() =>
        clamp(
            local.panelDefaultWidth ?? local.panelWidth ?? PANEL_DEFAULT_WIDTH,
            panelMin,
            panelMax,
        ),
    );
    const [panelMaximizedState, setPanelMaximizedState] = useState(
        local.panelDefaultMaximized ?? false,
    );
    // Controlled when the caller supplies `panelMaximized`; otherwise AppShell owns it.
    const panelMaximizedControlled = local.panelMaximized !== undefined;
    const panelMaximized = panelMaximizedControlled ? local.panelMaximized! : panelMaximizedState;
    function togglePanelMaximized() {
        const next = !panelMaximized;
        if (!panelMaximizedControlled) setPanelMaximizedState(next);
        local.onPanelMaximizedChange?.(next);
    }
    const sidebarInteractive = local.sidebarCollapsible === true;
    const panelResizable = local.panelResizable === true;
    const panelMaximizable = local.panelMaximizable === true;
    const showSidebarHandle = sidebarInteractive && !sidebarCollapsed;
    const sidebarStyle: CSSProperties | undefined = sidebarInteractive
        ? {
              width: `${sidebarWidth}px`,
              minWidth: `${sidebarMin}px`,
              maxWidth: `${sidebarMax}px`,
          }
        : undefined;
    const panelStyle: CSSProperties | undefined = panelMaximized
        ? undefined
        : panelResizable
          ? {
                width: `${panelWidth}px`,
                minWidth: `${panelMin}px`,
                maxWidth: `${panelMax}px`,
            }
          : local.panelWidth === undefined
            ? undefined
            : { width: `${local.panelWidth}px` };
    const sidebarLayoutMin = !local.sidebar
        ? 0
        : sidebarInteractive && sidebarCollapsed
          ? local.windowControls
              ? WINDOW_CONTROLS_REVEAL_WIDTH
              : REVEAL_WIDTH
          : sidebarInteractive
            ? sidebarMin + RESIZE_HANDLE_WIDTH
            : FIXED_SIDEBAR_MIN_WIDTH;
    const mainStyle: CSSProperties = {
        minWidth: `${sidebarLayoutMin + WORKSPACE_MIN_WIDTH}px`,
    };
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
                    <main
                        className="happy2-app-shell__main"
                        data-happy2-ui="app-shell-main"
                        style={mainStyle}
                    >
                        {sidebarInteractive && sidebarCollapsed ? (
                            <div
                                className="happy2-app-shell__reveal"
                                data-happy2-ui="app-shell-reveal"
                                data-window-controls={local.windowControls ? "" : undefined}
                            >
                                <button
                                    aria-label={local.sidebarExpandLabel ?? "Show sidebar"}
                                    className="happy2-app-shell__reveal-button"
                                    data-happy2-ui="app-shell-reveal-button"
                                    onClick={() => setSidebarCollapsed(false)}
                                    type="button"
                                >
                                    <Icon name="chevron-right" size={16} />
                                </button>
                            </div>
                        ) : null}
                        {local.sidebar ? (
                            <div
                                className="happy2-app-shell__sidebar"
                                data-collapsed={
                                    sidebarInteractive && sidebarCollapsed ? "" : undefined
                                }
                                data-happy2-ui="app-shell-sidebar"
                                data-resizable={sidebarInteractive ? "" : undefined}
                                style={sidebarStyle}
                            >
                                {local.sidebar}
                                {sidebarInteractive ? (
                                    <button
                                        aria-label={local.sidebarCollapseLabel ?? "Hide sidebar"}
                                        className="happy2-app-shell__sidebar-collapse"
                                        data-happy2-ui="app-shell-sidebar-collapse"
                                        onClick={() => setSidebarCollapsed(true)}
                                        type="button"
                                    >
                                        <span className="happy2-app-shell__chevron-left">
                                            <Icon name="chevron-right" size={16} />
                                        </span>
                                    </button>
                                ) : null}
                            </div>
                        ) : null}
                        {showSidebarHandle ? (
                            <ResizeHandle
                                edge="right"
                                label={local.sidebarResizeLabel ?? "Resize sidebar"}
                                max={sidebarMax}
                                min={sidebarMin}
                                onResize={setSidebarWidth}
                                value={sidebarWidth}
                            />
                        ) : null}
                        <div
                            className="happy2-app-shell__workspace"
                            data-happy2-ui="app-shell-workspace"
                        >
                            {local.children}
                        </div>
                    </main>
                    {local.panel && panelResizable && !panelMaximized ? (
                        <ResizeHandle
                            edge="left"
                            label={local.panelResizeLabel ?? "Resize panel"}
                            max={panelMax}
                            min={panelMin}
                            onResize={setPanelWidth}
                            value={panelWidth}
                        />
                    ) : null}
                    {local.panel ? (
                        <aside
                            className="happy2-app-shell__panel"
                            data-happy2-ui="app-shell-panel"
                            data-maximized={panelMaximized ? "" : undefined}
                            data-resizable={panelResizable ? "" : undefined}
                            style={panelStyle}
                        >
                            <div
                                className="happy2-app-shell__panel-content"
                                data-happy2-ui="app-shell-panel-content"
                            >
                                {local.panel}
                            </div>
                            {local.panelFooter ? (
                                <div
                                    className="happy2-app-shell__panel-footer"
                                    data-happy2-ui="app-shell-panel-footer"
                                >
                                    {local.panelFooter}
                                </div>
                            ) : null}
                            {panelMaximizable ? (
                                <button
                                    aria-label={
                                        panelMaximized
                                            ? (local.panelRestoreLabel ?? "Restore panel")
                                            : (local.panelMaximizeLabel ?? "Expand panel")
                                    }
                                    aria-pressed={panelMaximized}
                                    className="happy2-app-shell__panel-toggle"
                                    data-happy2-ui="app-shell-panel-toggle"
                                    onClick={togglePanelMaximized}
                                    type="button"
                                >
                                    <span
                                        className={
                                            panelMaximized
                                                ? undefined
                                                : "happy2-app-shell__chevron-left"
                                        }
                                    >
                                        <Icon name="chevron-right" size={16} />
                                    </span>
                                </button>
                            ) : null}
                        </aside>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
