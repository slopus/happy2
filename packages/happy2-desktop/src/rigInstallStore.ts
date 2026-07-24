import type {
    HappyDesktopBridge,
    RigInstallTerminalEvent,
    RigInstallTerminalOpenResponse,
} from "./shared/desktopContract";

export interface RigInstallSnapshot {
    readonly command: string;
    readonly error?: string;
    readonly exitCode?: number;
    readonly output: string;
    readonly status: "loading" | "awaitingConfirmation" | "running" | "exited";
    readonly terminalId?: string;
    readonly verified?: boolean;
}

export class RigInstallStore implements Disposable {
    private readonly listeners = new Set<() => void>();
    private readonly unsubscribe: () => void;
    private disposed = false;
    private snapshot: RigInstallSnapshot = {
        command: "npm install --global @slopus/rig",
        output: "",
        status: "loading",
    };

    constructor(private readonly bridge: HappyDesktopBridge) {
        this.unsubscribe = bridge.rigInstallSubscribe((event) => this.event(event));
        this.open();
    }

    get = (): RigInstallSnapshot => this.snapshot;

    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    confirm(): void {
        const terminalId = this.snapshot.terminalId;
        if (!terminalId || this.snapshot.status !== "awaitingConfirmation") return;
        this.set({ ...this.snapshot, status: "running", error: undefined });
        void this.bridge.rigInstallConfirm(terminalId, 80, 24).catch((error: unknown) => {
            this.set({ ...this.snapshot, status: "exited", error: displayError(error) });
        });
    }

    input(data: string): void {
        if (this.snapshot.status === "running" && this.snapshot.terminalId && data)
            void this.bridge
                .rigInstallInput(this.snapshot.terminalId, data)
                .catch((error: unknown) =>
                    this.set({ ...this.snapshot, error: displayError(error) }),
                );
    }

    resize(cols: number, rows: number): void {
        if (this.snapshot.status === "running" && this.snapshot.terminalId)
            void this.bridge
                .rigInstallResize(this.snapshot.terminalId, cols, rows)
                .catch(() => undefined);
    }

    retry(): void {
        const terminalId = this.snapshot.terminalId;
        if (terminalId) void this.bridge.rigInstallClose(terminalId).catch(() => undefined);
        this.set({
            command: "npm install --global @slopus/rig",
            output: "",
            status: "loading",
        });
        this.open();
    }

    [Symbol.dispose](): void {
        if (this.disposed) return;
        this.disposed = true;
        this.unsubscribe();
        if (this.snapshot.terminalId)
            void this.bridge.rigInstallClose(this.snapshot.terminalId).catch(() => undefined);
        this.listeners.clear();
    }

    private open(): void {
        void this.bridge.rigInstallOpen().then(
            (opened) => {
                if (this.disposed) {
                    void this.bridge.rigInstallClose(opened.terminalId).catch(() => undefined);
                    return;
                }
                this.opened(opened);
            },
            (error: unknown) => {
                if (!this.disposed)
                    this.set({ ...this.snapshot, status: "exited", error: displayError(error) });
            },
        );
    }

    private opened(opened: RigInstallTerminalOpenResponse): void {
        this.set({
            command: opened.command,
            output: "",
            status: opened.status,
            terminalId: opened.terminalId,
        });
    }

    private event(event: RigInstallTerminalEvent): void {
        if (event.terminalId !== this.snapshot.terminalId) return;
        if (event.type === "output") {
            const output = `${this.snapshot.output}${event.data}`;
            this.set({
                ...this.snapshot,
                output: output.length > 2_000_000 ? output.slice(-2_000_000) : output,
            });
            return;
        }
        this.set({
            ...this.snapshot,
            status: "exited",
            exitCode: event.exitCode,
            verified: event.verified,
            ...(event.message ? { error: event.message } : {}),
        });
    }

    private set(snapshot: RigInstallSnapshot): void {
        this.snapshot = snapshot;
        for (const listener of this.listeners) listener();
    }
}

function displayError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
