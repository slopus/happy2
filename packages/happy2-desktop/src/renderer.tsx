import { useReducer, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import {
    App,
    type DesktopInstanceStatus,
    type DesktopInstanceTarget,
    DesktopStartupScreen,
    type DesktopStartupValues,
} from "happy2-app";
import type {
    DesktopActiveTarget,
    DesktopTopologyTarget,
    DesktopUpdateSnapshot,
    HappyDesktopBridge,
} from "./shared/desktopContract";
import { desktopStartRequestFromValues, desktopStartupValues } from "./desktopStartupModel";
import { desktopRuntimeStoreCreate, type DesktopRuntimeStore } from "./runtimeStore";

function desktopAction(operation: Promise<void>): void {
    void operation.catch(() => undefined);
}

/**
 * The instance switcher speaks the product's two user-facing kinds. The runtime
 * distinguishes a private on-machine server (`local`) from an HTTPS client to an
 * existing cloud instance, which it tags `remote`; both surface to the user as
 * "cloud" vs "local", so the backend `remote` kind is remapped only here at the
 * composition boundary and the contract itself is left unchanged.
 */
function instanceTarget(target: DesktopTopologyTarget): DesktopInstanceTarget {
    return {
        detail: target.detail,
        id: target.id,
        kind: target.kind === "local" ? "local" : "cloud",
        label: target.label,
    };
}

/** Distinct, Rig-free status copy for the active local machine vs cloud endpoint. */
function runtimeStatus(active: DesktopActiveTarget): DesktopInstanceStatus {
    return active.mode === "local"
        ? { label: "Running locally on this Mac", tone: "success" }
        : { label: `Connected to ${active.label} over HTTPS`, tone: "success" };
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

    // Ready local: the App, its process-local state, and its authenticated
    // transport are tied to one activation. Keying by `connectionId`
    // rematerializes them only when the runtime opens a new connection; ordinary
    // same-connection notifications preserve App and DOM identity.
    return (
        <App
            credentialStore={{
                get: () => props.bridge.localCapabilityGet(active.id),
                set: (value) => props.bridge.localCapabilityConfirm(active.id, value),
            }}
            desktopRuntime={{
                activeTargetId: snapshot.activeTargetId,
                onChangeMode: () => desktopAction(props.bridge.runtimeReset()),
                onInstallUpdate: () => desktopAction(props.bridge.updateInstall()),
                onTargetSelect: (id) => desktopAction(props.bridge.topologySelect(id)),
                status: runtimeStatus(active),
                targets: snapshot.targets.map(instanceTarget),
                update: snapshot.update,
            }}
            key={snapshot.connectionId}
            platform="desktop"
            serverUrl={active.serverUrl}
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
