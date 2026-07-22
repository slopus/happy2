import { describe, expect, it, vi } from "vitest";
import { desktopRuntimeStoreCreate } from "./runtimeStore";
import type { DesktopRuntimeSnapshot, HappyDesktopBridge } from "./shared/desktopContract";

const choosing: DesktopRuntimeSnapshot = {
    phase: "choosing",
    targets: [],
    update: { status: "idle" },
};
const starting: DesktopRuntimeSnapshot = {
    phase: "starting",
    message: "Starting…",
    request: { mode: "local" },
    targets: [],
    update: { status: "idle" },
};

function bridgeCreate() {
    let receive: ((snapshot: DesktopRuntimeSnapshot) => void) | undefined;
    let resolveInitial!: (snapshot: DesktopRuntimeSnapshot) => void;
    const unsubscribe = vi.fn();
    const runtimeGet = vi.fn(
        () =>
            new Promise<DesktopRuntimeSnapshot>((resolve) => {
                resolveInitial = resolve;
            }),
    );
    const subscribe = vi.fn((listener: (snapshot: DesktopRuntimeSnapshot) => void) => {
        receive = listener;
        return unsubscribe;
    });
    const bridge = {
        runtimeGet,
        subscribe,
    } as unknown as HappyDesktopBridge;
    return {
        bridge,
        emit(snapshot: DesktopRuntimeSnapshot) {
            receive?.(snapshot);
        },
        resolveInitial(snapshot: DesktopRuntimeSnapshot) {
            resolveInitial(snapshot);
        },
        runtimeGet,
        subscribe,
        unsubscribe,
    };
}

describe("desktop runtime external-store adapter", () => {
    it("fans one bridge subscription out to all React subscribers", async () => {
        const fixture = bridgeCreate();
        const store = desktopRuntimeStoreCreate(fixture.bridge);
        const first = vi.fn();
        const second = vi.fn();

        const firstClose = store.subscribe(first);
        const secondClose = store.subscribe(second);
        expect(fixture.subscribe).toHaveBeenCalledOnce();
        expect(fixture.runtimeGet).toHaveBeenCalledOnce();

        fixture.resolveInitial(choosing);
        await Promise.resolve();
        expect(store.get()).toBe(choosing);
        expect(first).toHaveBeenCalledOnce();
        expect(second).toHaveBeenCalledOnce();

        fixture.emit(starting);
        expect(store.get()).toBe(starting);
        expect(first).toHaveBeenCalledTimes(2);
        expect(second).toHaveBeenCalledTimes(2);

        firstClose();
        expect(fixture.unsubscribe).not.toHaveBeenCalled();
        secondClose();
        expect(fixture.unsubscribe).toHaveBeenCalledOnce();
    });

    it("does not let a stale initial read replace a newer runtime event", async () => {
        const fixture = bridgeCreate();
        const store = desktopRuntimeStoreCreate(fixture.bridge);
        const close = store.subscribe(() => undefined);

        fixture.emit(starting);
        fixture.resolveInitial(choosing);
        await Promise.resolve();

        expect(store.get()).toBe(starting);
        close();
    });
});
