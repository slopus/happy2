import type { DesktopRuntimeSnapshot, HappyDesktopBridge } from "./shared/desktopContract";

export interface DesktopRuntimeStore {
    get(): DesktopRuntimeSnapshot | undefined;
    subscribe(listener: () => void): () => void;
}

/** One coarse bridge subscription owns the complete immutable runtime snapshot. */
export function desktopRuntimeStoreCreate(bridge: HappyDesktopBridge): DesktopRuntimeStore {
    let snapshot: DesktopRuntimeSnapshot | undefined;
    let bridgeUnsubscribe: (() => void) | undefined;
    let eventReceived = false;
    const listeners = new Set<() => void>();
    const publish = (next: DesktopRuntimeSnapshot) => {
        if (Object.is(snapshot, next)) return;
        snapshot = next;
        for (const listener of listeners) listener();
    };
    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            if (listeners.size === 1) {
                eventReceived = false;
                bridgeUnsubscribe = bridge.subscribe((next) => {
                    eventReceived = true;
                    publish(next);
                });
                void bridge.runtimeGet().then((initial) => {
                    if (!eventReceived) publish(initial);
                });
            }
            return () => {
                listeners.delete(listener);
                if (listeners.size === 0) {
                    bridgeUnsubscribe?.();
                    bridgeUnsubscribe = undefined;
                }
            };
        },
    };
}
