import { useReducer, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { App, DesktopStartupScreen, type DesktopStartupValues } from "happy2-app";
import type { DesktopUpdateSnapshot, HappyDesktopBridge } from "./shared/desktopContract";
import { desktopStartRequestFromValues, desktopStartupValues } from "./desktopStartupModel";
import { RigClientBoundary, RigInstallBoundary } from "./rigClientRenderer";
import { desktopRuntimeStoreCreate, type DesktopRuntimeStore } from "./runtimeStore";

function desktopAction(operation: Promise<void>): void {
    void operation.catch(() => undefined);
}

function ChoosingScreen(props: { bridge: HappyDesktopBridge; update: DesktopUpdateSnapshot }) {
    const [values, change] = useReducer(
        (_current: DesktopStartupValues, next: DesktopStartupValues) => next,
        { mode: "local", cloudUrl: "" } as DesktopStartupValues,
    );
    return (
        <DesktopStartupScreen
            onChange={change}
            onInstallUpdate={() => desktopAction(props.bridge.updateInstall())}
            onSubmit={() =>
                desktopAction(props.bridge.runtimeStart(desktopStartRequestFromValues(values)))
            }
            phase="choosing"
            update={props.update}
            values={values}
        />
    );
}

function DesktopRenderer(props: { bridge: HappyDesktopBridge; store: DesktopRuntimeStore }) {
    const snapshot = useSyncExternalStore(props.store.subscribe, props.store.get, props.store.get);
    if (!snapshot)
        return (
            <DesktopStartupScreen
                message="Reading desktop settings…"
                onChange={() => undefined}
                onSubmit={() => undefined}
                phase="starting"
                values={desktopStartupValues()}
            />
        );
    if (snapshot.phase === "choosing")
        return <ChoosingScreen bridge={props.bridge} update={snapshot.update} />;
    if (snapshot.phase === "starting")
        return (
            <DesktopStartupScreen
                message={snapshot.message}
                onChange={() => undefined}
                onInstallUpdate={() => desktopAction(props.bridge.updateInstall())}
                onSubmit={() => undefined}
                phase="starting"
                update={snapshot.update}
                values={desktopStartupValues(snapshot.request)}
            />
        );
    if (snapshot.phase === "installRequired")
        return (
            <RigInstallBoundary
                bridge={props.bridge}
                onChangeMode={() => desktopAction(props.bridge.runtimeReset())}
            />
        );
    if (snapshot.phase === "error")
        return (
            <DesktopStartupScreen
                error={snapshot.message}
                onChange={() => undefined}
                onChangeMode={() => desktopAction(props.bridge.runtimeReset())}
                onInstallUpdate={() => desktopAction(props.bridge.updateInstall())}
                onRetry={
                    snapshot.retryable
                        ? () => desktopAction(props.bridge.runtimeRetry())
                        : undefined
                }
                onSubmit={() => undefined}
                phase="error"
                update={snapshot.update}
                values={desktopStartupValues(snapshot.request)}
            />
        );

    const active = snapshot.activeTarget;
    // Main replaces the bundled renderer with a sandboxed, no-preload window for
    // cloud targets. This guard prevents a stale/racing local renderer from ever
    // opening cross-origin API transports while that window handoff completes.
    if (active.mode === "cloud")
        return (
            <DesktopStartupScreen
                message="Opening your cloud Happy workspace…"
                onChange={() => undefined}
                onSubmit={() => undefined}
                phase="starting"
                update={snapshot.update}
                values={desktopStartupValues({ mode: "cloud", serverUrl: active.serverUrl })}
            />
        );

    return (
        <RigClientBoundary
            bridge={props.bridge}
            connectionId={snapshot.connectionId}
            onChangeMode={() => desktopAction(props.bridge.runtimeReset())}
            rigVersion={active.rigVersion}
        />
    );
}

const bridge = window.happyDesktop;
createRoot(document.getElementById("root")!).render(
    bridge ? (
        <DesktopRenderer bridge={bridge} store={desktopRuntimeStoreCreate(bridge)} />
    ) : (
        <App cookieAuth platform="web" serverUrl="/" />
    ),
);
