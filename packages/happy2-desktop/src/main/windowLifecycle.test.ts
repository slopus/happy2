import { describe, expect, it, vi } from "vitest";
import {
    DesktopWindowLifecycle,
    type DesktopManagedWindow,
    type DesktopWindowBounds,
} from "./windowLifecycle";

class FakeWindow implements DesktopManagedWindow {
    readonly listeners = new Map<string, Array<() => void>>();
    readonly webContents = {
        once: (event: "did-fail-load", listener: () => void) => this.listen(event, listener),
    };
    destroyed = false;
    shown = false;

    constructor(readonly bounds: DesktopWindowBounds) {}

    destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        this.emit("closed");
    }

    getBounds(): DesktopWindowBounds {
        return this.bounds;
    }

    isDestroyed(): boolean {
        return this.destroyed;
    }

    on(event: "closed", listener: () => void): void {
        this.listen(event, listener);
    }

    once(event: "ready-to-show", listener: () => void): void {
        this.listen(event, listener);
    }

    show(): void {
        this.shown = true;
    }

    emit(event: string): void {
        for (const listener of this.listeners.get(event)?.splice(0) ?? []) listener();
    }

    private listen(event: string, listener: () => void): void {
        const listeners = this.listeners.get(event) ?? [];
        listeners.push(listener);
        this.listeners.set(event, listeners);
    }
}

const defaultBounds = { height: 760, width: 1100, x: 20, y: 30 };

function candidate(window: FakeWindow, load = Promise.resolve()) {
    return { load: vi.fn(() => load), window };
}

describe("desktop window lifecycle", () => {
    it("keeps the presented window through cloud-to-cloud transitions and drops intermediaries", () => {
        const lifecycle = new DesktopWindowLifecycle<FakeWindow>();
        const cloudOne = new FakeWindow(defaultBounds);
        lifecycle.synchronize("cloud:1", () => candidate(cloudOne));
        cloudOne.emit("ready-to-show");

        const transition = new FakeWindow(defaultBounds);
        lifecycle.synchronize("local", () => candidate(transition));
        const cloudTwo = new FakeWindow(defaultBounds);
        const bounds = vi.fn(() => candidate(cloudTwo));
        lifecycle.synchronize("cloud:2", bounds);

        expect(transition.destroyed).toBe(true);
        expect(cloudOne.destroyed).toBe(false);
        transition.emit("ready-to-show");
        expect(transition.shown).toBe(false);
        cloudTwo.emit("ready-to-show");
        expect(cloudTwo.shown).toBe(true);
        expect(cloudOne.destroyed).toBe(true);
        expect(bounds).toHaveBeenCalledWith(defaultBounds);
    });

    it("attaches load-failure handling before navigation and reveals a failed latest load", async () => {
        const lifecycle = new DesktopWindowLifecycle<FakeWindow>();
        const window = new FakeWindow(defaultBounds);
        let rejectLoad!: (error: Error) => void;
        const load = new Promise<void>((_resolve, reject) => {
            rejectLoad = reject;
        });
        const created = candidate(window, load);

        lifecycle.synchronize("cloud:1", () => created);
        expect(window.listeners.has("ready-to-show")).toBe(true);
        expect(window.listeners.has("did-fail-load")).toBe(true);
        expect(created.load).toHaveBeenCalledOnce();

        rejectLoad(new Error("navigation failed"));
        await load.catch(() => undefined);
        await Promise.resolve();
        expect(window.shown).toBe(true);
    });

    it("never reveals a load failure from a superseded candidate", async () => {
        const lifecycle = new DesktopWindowLifecycle<FakeWindow>();
        const stale = new FakeWindow(defaultBounds);
        let rejectLoad!: (error: Error) => void;
        const load = new Promise<void>((_resolve, reject) => {
            rejectLoad = reject;
        });
        lifecycle.synchronize("cloud:1", () => candidate(stale, load));
        const latest = new FakeWindow(defaultBounds);
        lifecycle.synchronize("cloud:2", () => candidate(latest));

        rejectLoad(new Error("late failure"));
        await load.catch(() => undefined);
        await Promise.resolve();
        expect(stale.destroyed).toBe(true);
        expect(stale.shown).toBe(false);
    });
});
