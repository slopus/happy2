export interface DesktopWindowBounds {
    height: number;
    width: number;
    x: number;
    y: number;
}

export interface DesktopManagedWindow {
    readonly webContents: {
        once(event: "did-fail-load", listener: () => void): void;
    };
    destroy(): void;
    getBounds(): DesktopWindowBounds;
    isDestroyed(): boolean;
    on(event: "closed", listener: () => void): void;
    once(event: "ready-to-show", listener: () => void): void;
    show(): void;
}

export interface DesktopWindowCandidate<Window extends DesktopManagedWindow> {
    load(): Promise<void>;
    window: Window;
}

/** Replaces desktop windows without revealing or retaining superseded candidates. */
export class DesktopWindowLifecycle<Window extends DesktopManagedWindow> {
    private active?: { key: string; window: Window };
    private presented?: Window;

    get(): Window | undefined {
        return live(this.active?.window);
    }

    synchronize(
        key: string,
        create: (bounds?: DesktopWindowBounds) => DesktopWindowCandidate<Window>,
    ): Window {
        const current = live(this.active?.window);
        if (current && this.active?.key === key) return current;

        const presented = live(this.presented);
        const bounds = (presented ?? current)?.getBounds();
        if (current && current !== presented) current.destroy();

        const candidate = create(bounds);
        const window = candidate.window;
        this.active = { key, window };
        let revealed = false;
        const reveal = () => {
            if (revealed || window.isDestroyed() || this.active?.window !== window) return;
            revealed = true;
            window.show();
            const previous = live(this.presented);
            this.presented = window;
            if (previous && previous !== window) previous.destroy();
        };
        window.once("ready-to-show", reveal);
        window.webContents.once("did-fail-load", reveal);
        window.on("closed", () => {
            if (this.active?.window === window) this.active = undefined;
            if (this.presented === window) this.presented = undefined;
        });
        void candidate.load().catch(reveal);
        return window;
    }
}

function live<Window extends DesktopManagedWindow>(window: Window | undefined): Window | undefined {
    return window && !window.isDestroyed() ? window : undefined;
}
