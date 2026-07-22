import { randomBytes } from "node:crypto";
import { chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
    DesktopRuntimeSnapshot,
    DesktopStartRequest,
    DesktopTopology,
    DesktopTopologyTarget,
    DesktopUpdateSnapshot,
} from "../shared/desktopContract";
import { CredentialVault } from "./credentialVault";
import {
    desktopSettingsActivate,
    desktopSettingsRead,
    desktopSettingsWrite,
    desktopTopologyIdCreate,
    type DesktopSettings,
} from "./desktopSettings";
import {
    desktopActiveTarget,
    desktopStartRequestValidate,
    desktopTargetCredentialKey,
    desktopTopologyFromRequest,
    desktopTopologyRequest,
    desktopTopologyTarget,
} from "./runtimeValidation";
import { serverChildStart, type ServerChildHandle } from "./serverChild";

const idleUpdate: DesktopUpdateSnapshot = { status: "idle" };

export interface DesktopRuntimePaths {
    executablePath: string;
    root: string;
    serverWorkerPath: string;
    webRoot: string;
}

/** Owns the active topology lifetime and publishes one immutable renderer snapshot. */
export class DesktopRuntime {
    private activationGeneration = 0;
    private activeTopology?: DesktopTopology;
    private closed = false;
    private closeTask?: Promise<void>;
    private localAccessToken?: string;
    private readonly listeners = new Set<(snapshot: DesktopRuntimeSnapshot) => void>();
    private operation = Promise.resolve();
    private persistOnSuccess = false;
    private restartAttempt = 0;
    private restartTimer?: ReturnType<typeof setTimeout>;
    private rigEndpointRoot?: string;
    private server?: ServerChildHandle;
    private settings?: DesktopSettings;
    private snapshotValue: DesktopRuntimeSnapshot;

    private constructor(
        private readonly paths: DesktopRuntimePaths,
        private readonly vault: CredentialVault,
        settings?: DesktopSettings,
    ) {
        this.settings = settings;
        const active = settings?.topologies.find(({ id }) => id === settings.activeTopologyId);
        if (active) {
            this.activeTopology = active;
            this.snapshotValue = {
                phase: "starting",
                message:
                    active.mode === "local"
                        ? "Starting your local Happy workspace…"
                        : "Connecting to your cloud Happy workspace…",
                request: desktopTopologyRequest(active),
                targets: this.targets(),
                update: idleUpdate,
            };
        } else
            this.snapshotValue = {
                phase: "choosing",
                targets: [],
                update: idleUpdate,
            };
    }

    static async create(
        paths: DesktopRuntimePaths,
        vault: CredentialVault,
    ): Promise<DesktopRuntime> {
        const settings = await desktopSettingsRead(join(paths.root, "desktop-settings.json"));
        await vault.legacyTunnelCredentialsRemove();
        const runtime = new DesktopRuntime(paths, vault, settings);
        if (runtime.activeTopology)
            void runtime
                .serial(() => runtime.startValidated(runtime.activeTopology!, false))
                .catch(() => undefined);
        return runtime;
    }

    get(): DesktopRuntimeSnapshot {
        return this.snapshotValue;
    }

    subscribe(listener: (snapshot: DesktopRuntimeSnapshot) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    start(request: DesktopStartRequest): Promise<void> {
        return this.serial(async () => {
            const validated = desktopStartRequestValidate(request);
            const topology = desktopTopologyFromRequest(desktopTopologyIdCreate(), validated);
            await this.startValidated(topology, true);
        });
    }

    retry(): Promise<void> {
        return this.serial(async () => {
            if (!this.activeTopology) throw new Error("There is no desktop topology to retry.");
            await this.startValidated(this.activeTopology, this.persistOnSuccess);
        });
    }

    reset(): Promise<void> {
        return this.serial(async () => {
            this.activationGeneration += 1;
            this.activeTopology = undefined;
            this.persistOnSuccess = false;
            this.restartAttempt = 0;
            this.restartCancel();
            await this.processStop();
            this.publish({
                phase: "choosing",
                targets: this.targets(),
                update: this.snapshotValue.update,
            });
        });
    }

    topologySelect(topologyId: string): Promise<void> {
        return this.serial(async () => {
            if (
                this.snapshotValue.phase === "ready" &&
                this.snapshotValue.activeTargetId === topologyId
            )
                return;
            const topology = this.settings?.topologies.find(({ id }) => id === topologyId);
            if (!topology) throw new Error("The selected Happy topology does not exist.");
            await this.startValidated(topology, true);
        });
    }

    async sessionCredentialGet(targetId: string): Promise<string | undefined> {
        const topology = this.activeTarget(targetId);
        if (topology.mode === "local") {
            if (!this.localAccessToken)
                throw new Error("The local Happy capability is unavailable.");
            return this.localAccessToken;
        }
        return this.vault.get(desktopTargetCredentialKey(targetId));
    }

    async sessionCredentialSet(targetId: string, value?: string): Promise<void> {
        const topology = this.activeTarget(targetId);
        if (topology.mode === "local") {
            if (value !== undefined && value !== this.localAccessToken)
                throw new Error("The desktop-owned local capability cannot be replaced.");
            return;
        }
        await this.vault.set(desktopTargetCredentialKey(targetId), value);
    }

    updateSet(update: DesktopUpdateSnapshot): void {
        this.publish({ ...this.snapshotValue, update } as DesktopRuntimeSnapshot);
    }

    close(): Promise<void> {
        this.closeTask ??= this.closeOnce();
        return this.closeTask;
    }

    private async closeOnce(): Promise<void> {
        this.closed = true;
        this.activationGeneration += 1;
        this.restartCancel();
        await this.serial(() => this.processStop());
    }

    private async startValidated(topology: DesktopTopology, persist: boolean): Promise<void> {
        if (this.closed) throw new Error("The desktop runtime is closed.");
        const generation = ++this.activationGeneration;
        this.restartCancel();
        await this.processStop();
        this.activeTopology = topology;
        this.persistOnSuccess = persist;
        const request = desktopTopologyRequest(topology);
        this.publish({
            phase: "starting",
            message:
                topology.mode === "local"
                    ? "Starting the local Happy server…"
                    : "Connecting to the cloud Happy server…",
            request,
            targets: this.targets(),
            update: this.snapshotValue.update,
        });
        try {
            let serverUrl: string | undefined;
            if (topology.mode === "local") {
                const topologyRoot = join(this.paths.root, "topologies", topology.id);
                const runtimeRoot = join(topologyRoot, "runtime");
                this.rigEndpointRoot = await mkdtemp(join(tmpdir(), "happy2-rig-"));
                await chmod(this.rigEndpointRoot, 0o700);
                this.localAccessToken = randomBytes(48).toString("base64url");
                this.server = await serverChildStart({
                    executablePath: this.paths.executablePath,
                    localAccessToken: this.localAccessToken,
                    logPath: join(topologyRoot, "logs", "server.log"),
                    workerPath: this.paths.serverWorkerPath,
                    start: {
                        configPath: join(runtimeRoot, "happy2.toml"),
                        errorLogPath: join(topologyRoot, "logs", "server-errors.log"),
                        rigEndpointRoot: this.rigEndpointRoot,
                        runtimeRoot,
                        webRoot: this.paths.webRoot,
                    },
                    onUnexpectedExit: (error) => this.unexpectedExit(error, generation),
                });
                serverUrl = this.server.url;
            }
            if (this.persistOnSuccess) {
                const settings = desktopSettingsActivate(this.settings, topology);
                await desktopSettingsWrite(
                    join(this.paths.root, "desktop-settings.json"),
                    settings,
                );
                this.settings = settings;
                this.persistOnSuccess = false;
            }
            this.restartAttempt = 0;
            const activeTarget = desktopActiveTarget(topology, serverUrl);
            this.publish({
                phase: "ready",
                activeTarget,
                activeTargetId: activeTarget.id,
                connectionId: generation,
                mode: topology.mode,
                targets: this.targets(),
                update: this.snapshotValue.update,
            });
        } catch (error) {
            await this.processStop();
            this.publish({
                phase: "error",
                message: displayError(error),
                request,
                retryable: true,
                targets: this.targets(),
                update: this.snapshotValue.update,
            });
            throw error;
        }
    }

    private unexpectedExit(error: Error, generation: number): void {
        if (
            this.closed ||
            generation !== this.activationGeneration ||
            !this.activeTopology ||
            this.restartTimer
        )
            return;
        const topology = this.activeTopology;
        const delay = Math.min(30_000, 1_000 * 2 ** this.restartAttempt++);
        this.publish({
            phase: "error",
            message: `${error.message} Restarting automatically…`,
            request: desktopTopologyRequest(topology),
            retryable: true,
            targets: this.targets(),
            update: this.snapshotValue.update,
        });
        this.restartTimer = setTimeout(() => {
            this.restartTimer = undefined;
            if (generation !== this.activationGeneration) return;
            void this.serial(() => this.startValidated(topology, false)).catch(() => undefined);
        }, delay);
    }

    private restartCancel(): void {
        if (this.restartTimer) clearTimeout(this.restartTimer);
        this.restartTimer = undefined;
    }

    private async processStop(): Promise<void> {
        const server = this.server;
        const rigEndpointRoot = this.rigEndpointRoot;
        this.server = undefined;
        this.rigEndpointRoot = undefined;
        this.localAccessToken = undefined;
        try {
            await server?.close().catch(() => undefined);
        } finally {
            if (rigEndpointRoot)
                await rm(rigEndpointRoot, { force: true, recursive: true }).catch(() => undefined);
        }
    }

    private publish(snapshot: DesktopRuntimeSnapshot): void {
        this.snapshotValue = snapshot;
        for (const listener of this.listeners) listener(snapshot);
    }

    private serial<T>(work: () => Promise<T>): Promise<T> {
        const next = this.operation.then(work, work);
        this.operation = next.then(
            () => undefined,
            () => undefined,
        );
        return next;
    }

    private activeTarget(targetId: string): DesktopTopology {
        if (
            this.snapshotValue.phase !== "ready" ||
            this.snapshotValue.activeTargetId !== targetId ||
            this.activeTopology?.id !== targetId
        )
            throw new Error("The Happy target is not active in this desktop runtime.");
        return this.activeTopology;
    }

    private targets(): readonly DesktopTopologyTarget[] {
        return (this.settings?.topologies ?? []).map(desktopTopologyTarget);
    }
}

function displayError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
