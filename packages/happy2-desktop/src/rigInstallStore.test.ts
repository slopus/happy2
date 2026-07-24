import { describe, expect, it, vi } from "vitest";
import { RigInstallStore } from "./rigInstallStore";
import type { HappyDesktopBridge, RigInstallTerminalEvent } from "./shared/desktopContract";

function bridgeCreate() {
    let receive: ((event: RigInstallTerminalEvent) => void) | undefined;
    let resolveOpen!: (value: {
        terminalId: string;
        command: "npm install --global @slopus/rig";
        status: "awaitingConfirmation";
    }) => void;
    const rigInstallClose = vi.fn(async () => undefined);
    const rigInstallConfirm = vi.fn(async () => undefined);
    const rigInstallInput = vi.fn(async () => undefined);
    const rigInstallResize = vi.fn(async () => undefined);
    const unsubscribe = vi.fn();
    const bridge = {
        rigInstallOpen: vi.fn(
            () =>
                new Promise((resolve) => {
                    resolveOpen = resolve;
                }),
        ),
        rigInstallClose,
        rigInstallConfirm,
        rigInstallInput,
        rigInstallResize,
        rigInstallSubscribe: vi.fn((listener: (event: RigInstallTerminalEvent) => void) => {
            receive = listener;
            return unsubscribe;
        }),
    } as unknown as HappyDesktopBridge;
    return {
        bridge,
        emit(event: RigInstallTerminalEvent) {
            receive?.(event);
        },
        resolveOpen(value: {
            terminalId: string;
            command: "npm install --global @slopus/rig";
            status: "awaitingConfirmation";
        }) {
            resolveOpen(value);
        },
        rigInstallClose,
        rigInstallConfirm,
        rigInstallInput,
        rigInstallResize,
        unsubscribe,
    };
}

describe("Rig install external store", () => {
    it("closes a terminal returned after the store was disposed", async () => {
        const fixture = bridgeCreate();
        const store = new RigInstallStore(fixture.bridge);
        store[Symbol.dispose]();

        fixture.resolveOpen({
            terminalId: "install-late",
            command: "npm install --global @slopus/rig",
            status: "awaitingConfirmation",
        });
        await Promise.resolve();

        expect(fixture.rigInstallClose).toHaveBeenCalledWith("install-late");
        expect(store.get().terminalId).toBeUndefined();
    });

    it("requires confirmation, forwards PTY interaction, and records verification", async () => {
        const fixture = bridgeCreate();
        const store = new RigInstallStore(fixture.bridge);
        const changed = vi.fn();
        store.subscribe(changed);
        fixture.resolveOpen({
            terminalId: "install-1",
            command: "npm install --global @slopus/rig",
            status: "awaitingConfirmation",
        });
        await Promise.resolve();

        expect(store.get().status).toBe("awaitingConfirmation");
        expect(fixture.rigInstallConfirm).not.toHaveBeenCalled();
        store.confirm();
        expect(store.get().status).toBe("running");
        expect(fixture.rigInstallConfirm).toHaveBeenCalledWith("install-1", 80, 24);

        store.input("y");
        store.resize(100, 30);
        expect(fixture.rigInstallInput).toHaveBeenCalledWith("install-1", "y");
        expect(fixture.rigInstallResize).toHaveBeenCalledWith("install-1", 100, 30);

        fixture.emit({ type: "output", terminalId: "other", data: "ignored" });
        fixture.emit({ type: "output", terminalId: "install-1", data: "installed\n" });
        fixture.emit({
            type: "exited",
            terminalId: "install-1",
            exitCode: 0,
            verified: true,
        });
        expect(store.get()).toMatchObject({
            output: "installed\n",
            status: "exited",
            exitCode: 0,
            verified: true,
        });

        store[Symbol.dispose]();
        expect(fixture.unsubscribe).toHaveBeenCalledOnce();
        expect(fixture.rigInstallClose).toHaveBeenCalledWith("install-1");
        expect(changed).toHaveBeenCalled();
    });
});
