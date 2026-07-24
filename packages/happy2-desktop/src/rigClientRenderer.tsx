import { useLayoutEffect, useReducer, useSyncExternalStore } from "react";
import {
    rigStateCreate,
    type RigActivityHandle,
    type RigDirectoryStore,
    type RigJsonValue,
    type RigPermissionMode,
    type RigServiceTier,
    type RigSessionHandle,
    type RigSessionId,
    type RigState,
    type RigStateOutput,
    type RigTerminalGridProjection,
    type RigTerminalId,
    type RigTerminalListHandle,
    type RigTerminalSnapshot,
    type RigTerminalStore,
    type TerminalCellSnapshot,
    type TerminalGridSnapshot,
} from "happy2-state";
import {
    RigClientShell,
    RigInstallScreen,
    type RigClientMessage,
    type RigClientSessionView,
    type RigClientTerminalView,
} from "happy2-ui";
import { RigInstallStore } from "./rigInstallStore";
import { RigRendererTransport } from "./rigRendererTransport";
import type { HappyDesktopBridge } from "./shared/desktopContract";

interface RigUiSnapshot {
    readonly backgroundError?: string;
    readonly drafts: ReadonlyMap<RigSessionId, string>;
    readonly selectedSessionId?: RigSessionId;
    readonly terminalHeight: number;
    readonly terminals: ReadonlyMap<RigSessionId, RigTerminalId>;
}

class RigUiStore {
    private readonly listeners = new Set<() => void>();
    private snapshot: RigUiSnapshot = {
        drafts: new Map(),
        terminalHeight: 260,
        terminals: new Map(),
    };

    get = (): RigUiSnapshot => this.snapshot;

    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    sessionSelect(sessionId: RigSessionId): void {
        this.set({ ...this.snapshot, selectedSessionId: sessionId });
    }

    draftUpdate(sessionId: RigSessionId, value: string): void {
        const drafts = new Map(this.snapshot.drafts);
        drafts.set(sessionId, value);
        this.set({ ...this.snapshot, drafts });
    }

    terminalSelect(sessionId: RigSessionId, terminalId?: RigTerminalId): void {
        const terminals = new Map(this.snapshot.terminals);
        if (terminalId) terminals.set(sessionId, terminalId);
        else terminals.delete(sessionId);
        this.set({ ...this.snapshot, terminals });
    }

    terminalHeightUpdate(value: number): void {
        this.set({
            ...this.snapshot,
            terminalHeight: Math.max(120, Math.min(560, Math.round(value))),
        });
    }

    backgroundErrorSet(message: string): void {
        this.set({ ...this.snapshot, backgroundError: message });
    }

    output(event: RigStateOutput): void {
        if (event.type === "sessionCreated" || event.type === "sessionForked")
            this.sessionSelect(event.sessionId);
        else if (event.type === "terminalCreated" && this.snapshot.selectedSessionId)
            this.terminalSelect(this.snapshot.selectedSessionId, event.terminalId);
    }

    private set(snapshot: RigUiSnapshot): void {
        this.snapshot = snapshot;
        for (const listener of this.listeners) listener();
    }
}

class RigRendererRuntime implements Disposable {
    readonly bridge: HappyDesktopBridge;
    readonly directory: RigDirectoryStore;
    readonly state: RigState;
    readonly transport: RigRendererTransport;
    readonly ui = new RigUiStore();

    constructor(bridge: HappyDesktopBridge) {
        this.bridge = bridge;
        this.transport = new RigRendererTransport(bridge);
        this.state = rigStateCreate({
            transport: this.transport,
            event: (event) => this.ui.output(event),
            backgroundError: (error) => this.ui.backgroundErrorSet(error.message),
        });
        this.directory = this.state.directory();
    }

    [Symbol.dispose](): void {
        this.state[Symbol.dispose]();
        this.transport[Symbol.dispose]();
    }
}

export function RigInstallBoundary(props: { bridge: HappyDesktopBridge; onChangeMode(): void }) {
    const [instance, instanceSet] = useReducer(
        (
            _current: { bridge: HappyDesktopBridge; store: RigInstallStore } | undefined,
            next: { bridge: HappyDesktopBridge; store: RigInstallStore } | undefined,
        ) => next,
        undefined,
    );
    // The IPC-backed store must only exist for a committed React lifetime.
    useLayoutEffect(() => {
        const store = new RigInstallStore(props.bridge);
        instanceSet({ bridge: props.bridge, store });
        return () => store[Symbol.dispose]();
    }, [props.bridge]);
    if (!instance || instance.bridge !== props.bridge) return null;
    return <RigInstallStoreView onChangeMode={props.onChangeMode} store={instance.store} />;
}

function RigInstallStoreView(props: { onChangeMode(): void; store: RigInstallStore }) {
    const store = props.store;
    const snapshot = useSyncExternalStore(store.subscribe, store.get, store.get);
    return (
        <RigInstallScreen
            command={snapshot.command}
            error={snapshot.error}
            exitCode={snapshot.exitCode}
            onChangeMode={props.onChangeMode}
            onConfirm={() => store.confirm()}
            onInput={(data) => store.input(data)}
            onResize={(cols, rows) => store.resize(cols, rows)}
            onRetry={() => store.retry()}
            output={snapshot.output}
            status={snapshot.status}
            verified={snapshot.verified}
        />
    );
}

export function RigClientBoundary(props: {
    bridge: HappyDesktopBridge;
    connectionId: number;
    onChangeMode(): void;
    rigVersion: string;
}) {
    const [instance, instanceSet] = useReducer(
        (
            _current:
                | {
                      bridge: HappyDesktopBridge;
                      connectionId: number;
                      runtime: RigRendererRuntime;
                  }
                | undefined,
            next:
                | {
                      bridge: HappyDesktopBridge;
                      connectionId: number;
                      runtime: RigRendererRuntime;
                  }
                | undefined,
        ) => next,
        undefined,
    );
    // `connectionId` is the explicit committed process-connection lifetime boundary.
    useLayoutEffect(() => {
        const runtime = new RigRendererRuntime(props.bridge);
        instanceSet({ bridge: props.bridge, connectionId: props.connectionId, runtime });
        return () => runtime[Symbol.dispose]();
    }, [props.bridge, props.connectionId]);
    if (
        !instance ||
        instance.bridge !== props.bridge ||
        instance.connectionId !== props.connectionId
    )
        return null;
    return (
        <RigClientView
            onChangeMode={props.onChangeMode}
            rigVersion={props.rigVersion}
            runtime={instance.runtime}
        />
    );
}

function RigClientView(props: {
    onChangeMode(): void;
    rigVersion: string;
    runtime: RigRendererRuntime;
}) {
    const directory = useSyncExternalStore(
        props.runtime.directory.subscribe,
        props.runtime.directory.get,
        props.runtime.directory.get,
    );
    const ui = useSyncExternalStore(
        props.runtime.ui.subscribe,
        props.runtime.ui.get,
        props.runtime.ui.get,
    );
    const selected =
        ui.selectedSessionId &&
        directory.groups.some((group) =>
            group.sessions.some((session) => session.id === ui.selectedSessionId),
        )
            ? ui.selectedSessionId
            : directory.groups[0]?.sessions[0]?.id;
    const sidebarSections = directory.groups.map((group) => ({
        id: group.id,
        label: group.displayPath,
        items: group.sessions.map((session) => ({
            id: session.id,
            kind: "channel" as const,
            label: session.title || session.recap || session.id.slice(0, 12),
            meta: session.status,
            icon: session.status === "running" ? ("play" as const) : ("hash" as const),
        })),
    }));
    const shared = {
        activeSessionId: selected,
        composerValue: selected ? (ui.drafts.get(selected) ?? "") : "",
        directoryError:
            directory.status.type === "error" ? directory.status.error.message : ui.backgroundError,
        directoryLoading: directory.status.type === "loading",
        onChangeConnection: props.onChangeMode,
        onComposerValueChange: (value: string) => {
            if (selected) props.runtime.ui.draftUpdate(selected, value);
        },
        onDirectoryPick: () => props.runtime.bridge.directoryPick(),
        onSessionCreate: (cwd: string) => props.runtime.directory.sessionCreate({ cwd }),
        onSessionSelect: (id: string) => props.runtime.ui.sessionSelect(id as RigSessionId),
        rigVersion: props.rigVersion,
        sidebarSections,
        terminalHeight: ui.terminalHeight,
        onTerminalHeightChange: (height: number) => props.runtime.ui.terminalHeightUpdate(height),
    };
    if (!selected)
        return (
            <RigClientShell
                {...shared}
                activity={{ now: Date.now(), subagents: [], terminals: [] }}
                onAbort={() => undefined}
                onAnswerInput={() => undefined}
                onEffortChange={() => undefined}
                onFork={() => undefined}
                onModelChange={() => undefined}
                onPermissionModeChange={() => undefined}
                onReset={() => undefined}
                onSend={() => undefined}
                onServiceTierChange={() => undefined}
                onTerminalClose={() => undefined}
                onTerminalCreate={() => undefined}
                onTerminalInput={() => undefined}
                onTerminalOpen={() => undefined}
                onTerminalReconnect={() => undefined}
                onTerminalResize={() => undefined}
                onTerminalStop={() => undefined}
                terminalIds={[]}
            />
        );
    return (
        <RigSessionView
            {...shared}
            key={selected}
            runtime={props.runtime}
            sessionId={selected}
            terminalId={ui.terminals.get(selected)}
        />
    );
}

type RigSessionViewProps = {
    runtime: RigRendererRuntime;
    sessionId: RigSessionId;
    terminalId?: RigTerminalId;
} & Omit<
    Parameters<typeof RigClientShell>[0],
    | "activity"
    | "onAbort"
    | "onAnswerInput"
    | "onEffortChange"
    | "onFork"
    | "onModelChange"
    | "onPermissionModeChange"
    | "onReset"
    | "onSend"
    | "onServiceTierChange"
    | "onTerminalClose"
    | "onTerminalCreate"
    | "onTerminalInput"
    | "onTerminalOpen"
    | "onTerminalReconnect"
    | "onTerminalResize"
    | "onTerminalStop"
    | "session"
    | "sessionLoading"
    | "terminalIds"
    | "activeTerminal"
>;

interface RigSessionSurfaces {
    readonly activity: RigActivityHandle;
    readonly runtime: RigRendererRuntime;
    readonly session: RigSessionHandle;
    readonly sessionId: RigSessionId;
    readonly terminals: RigTerminalListHandle;
}

function RigSessionView(props: RigSessionViewProps) {
    const [surfaces, surfacesSet] = useReducer(
        (_current: RigSessionSurfaces | undefined, next: RigSessionSurfaces | undefined) => next,
        undefined,
    );
    useLayoutEffect(() => {
        const session = props.runtime.state.sessionOpen(props.sessionId);
        const activity = props.runtime.state.activityOpen(props.sessionId);
        const terminals = props.runtime.state.terminalListOpen(props.sessionId);
        surfacesSet({
            activity,
            runtime: props.runtime,
            session,
            sessionId: props.sessionId,
            terminals,
        });
        return () => {
            session[Symbol.dispose]();
            activity[Symbol.dispose]();
            terminals[Symbol.dispose]();
        };
    }, [props.runtime, props.sessionId]);
    if (!surfaces || surfaces.runtime !== props.runtime || surfaces.sessionId !== props.sessionId)
        return null;
    return <RigSessionSurfaceView {...props} surfaces={surfaces} />;
}

function RigSessionSurfaceView(props: RigSessionViewProps & { surfaces: RigSessionSurfaces }) {
    const { activity, session, terminals } = props.surfaces;
    const [terminalInstance, terminalInstanceSet] = useReducer(
        (
            _current:
                | {
                      runtime: RigRendererRuntime;
                      sessionId: RigSessionId;
                      store: RigTerminalStore;
                      terminalId: RigTerminalId;
                  }
                | undefined,
            next:
                | {
                      runtime: RigRendererRuntime;
                      sessionId: RigSessionId;
                      store: RigTerminalStore;
                      terminalId: RigTerminalId;
                  }
                | undefined,
        ) => next,
        undefined,
    );
    useLayoutEffect(() => {
        if (!props.terminalId) {
            terminalInstanceSet(undefined);
            return;
        }
        const store = props.runtime.state.terminalOpen(props.sessionId, props.terminalId);
        terminalInstanceSet({
            runtime: props.runtime,
            sessionId: props.sessionId,
            store,
            terminalId: props.terminalId,
        });
        return () => store[Symbol.dispose]();
    }, [props.runtime, props.sessionId, props.terminalId]);
    const terminal =
        terminalInstance &&
        terminalInstance.runtime === props.runtime &&
        terminalInstance.sessionId === props.sessionId &&
        terminalInstance.terminalId === props.terminalId
            ? terminalInstance.store
            : emptyTerminalStore;
    const sessionSnapshot = useSyncExternalStore(session.subscribe, session.get, session.get);
    const activitySnapshot = useSyncExternalStore(activity.subscribe, activity.get, activity.get);
    const terminalListSnapshot = useSyncExternalStore(
        terminals.subscribe,
        terminals.get,
        terminals.get,
    );
    const terminalSnapshot = useSyncExternalStore(terminal.subscribe, terminal.get, terminal.get);
    const value = sessionSnapshot.session;
    const streaming = sessionSnapshot.streaming;
    const messages: RigClientMessage[] = value
        ? [
              ...value.messages.map((message) => ({
                  id: message.id,
                  role: message.role,
                  body: message.blocks.map(messageBlockText).filter(Boolean).join("\n\n"),
              })),
              ...(streaming
                  ? [
                        {
                            id: `stream-${streaming.runId}`,
                            role: "agent" as const,
                            body: streaming.blocks
                                .map(messageBlockText)
                                .filter(Boolean)
                                .join("\n\n"),
                            streaming: true,
                        },
                    ]
                  : []),
          ]
        : [];
    const model = value?.models.find((candidate) => candidate.id === value.modelId);
    const sessionView: RigClientSessionView | undefined = value
        ? {
              cwd: value.displayCwd,
              effort: value.effort,
              effortOptions: (model?.thinkingLevels ?? []).map((effort) => ({
                  label: effort,
                  value: effort,
              })),
              error:
                  sessionSnapshot.mutationError?.message ??
                  (sessionSnapshot.status.type === "error"
                      ? sessionSnapshot.status.error.message
                      : undefined),
              id: value.id,
              messages,
              modelId: value.modelId,
              modelLocked: value.modelLocked,
              modelOptions: value.models.map((candidate) => ({
                  label: candidate.name,
                  value: candidate.id,
              })),
              pendingInputs: value.pendingUserInputs,
              permissionMode: value.permissionMode,
              serviceTier: value.serviceTier,
              status: value.status,
              title: value.title || value.recap || value.id.slice(0, 12),
          }
        : undefined;
    const activeTerminal: RigClientTerminalView | undefined =
        props.terminalId && terminal !== emptyTerminalStore
            ? {
                  id: props.terminalId,
                  status: terminalSnapshot.status,
                  exitCode: terminalSnapshot.exitCode,
                  error: terminalSnapshot.error?.message,
                  grid: terminalSnapshot.grid
                      ? terminalGridProject(terminalSnapshot.grid)
                      : undefined,
              }
            : undefined;
    return (
        <RigClientShell
            {...props}
            activeTerminal={activeTerminal}
            activity={{
                now: Date.now(),
                subagents: activitySnapshot.subagents.map((subagent) => ({
                    id: subagent.id,
                    description: subagent.description,
                    status: subagent.status,
                    latestText: subagent.latestText,
                    startedAt: subagent.activeSince ?? subagent.createdAt,
                    totalTokens: subagent.totalTokens ?? 0,
                })),
                terminals: activitySnapshot.backgroundProcesses.map((process) => ({
                    id: String(process.id),
                    command: process.command,
                    cwd: process.cwd,
                    startedAt: Date.now(),
                })),
            }}
            onAbort={() => session.runAbort(streaming?.runId)}
            onAnswerInput={(requestId, answers) => session.userInputAnswer({ requestId, answers })}
            onEffortChange={(effort) => session.effortChange(effort)}
            onFork={() => props.runtime.directory.sessionFork(props.sessionId)}
            onModelChange={(modelId) =>
                session.modelChange({
                    modelId,
                    providerId: value?.providerId,
                    effort: value?.effort,
                })
            }
            onPermissionModeChange={(permissionMode) =>
                session.permissionModeChange(permissionMode as RigPermissionMode)
            }
            onReset={() => props.runtime.directory.sessionReset(props.sessionId)}
            onSend={() => {
                const text = props.composerValue.trim();
                if (!text) return;
                props.runtime.ui.draftUpdate(props.sessionId, "");
                if (value?.status === "running")
                    session.messageSteer({ text, expectedRunId: streaming?.runId });
                else session.messageSubmit({ text });
            }}
            onServiceTierChange={(serviceTier) =>
                session.serviceTierChange(serviceTier as RigServiceTier | undefined)
            }
            onTerminalClose={() => props.runtime.ui.terminalSelect(props.sessionId)}
            onTerminalCreate={() => terminals.terminalCreate({ cols: 100, rows: 30 })}
            onTerminalInput={(data) => terminal.terminalWrite(data)}
            onTerminalOpen={(terminalId) => {
                if (terminalId)
                    props.runtime.ui.terminalSelect(props.sessionId, terminalId as RigTerminalId);
            }}
            onTerminalReconnect={() => terminal.terminalReconnect()}
            onTerminalResize={(cols, rows) => terminal.terminalResize(cols, rows)}
            onTerminalStop={(terminalId) => {
                if (terminalId === props.terminalId) terminal.terminalStop();
                else terminals.terminalStop(terminalId as RigTerminalId);
            }}
            session={sessionView}
            sessionLoading={sessionSnapshot.status.type === "loading"}
            terminalIds={terminalListSnapshot.terminals.map((candidate) => ({
                id: candidate.id,
                label: `Terminal ${candidate.id.slice(-6)}`,
                running: candidate.status === "running",
            }))}
        />
    );
}

const emptyTerminalSnapshot: RigTerminalSnapshot = {
    status: "exited",
    exitCode: null,
};
const emptyTerminalStore: RigTerminalStore = {
    get: () => emptyTerminalSnapshot,
    subscribe: () => () => undefined,
    terminalWrite: () => undefined,
    terminalResize: () => undefined,
    terminalScrollback: () => Promise.reject(new Error("No terminal is open.")),
    terminalReconnect: () => undefined,
    terminalStop: () => undefined,
    [Symbol.dispose]: () => undefined,
};

function messageBlockText(block: {
    readonly type: string;
    readonly [key: string]: RigJsonValue | undefined;
}): string {
    if (block.type === "text") return String(block.text ?? "");
    if (block.type === "thinking") return `Thinking\n${String(block.thinking ?? "")}`;
    if (block.type === "image") return `[Image · ${String(block.mediaType ?? "attachment")}]`;
    if (block.type === "toolCall")
        return `Tool · ${String(block.name ?? "")}\n${JSON.stringify(block.arguments, null, 2)}`;
    if (block.type === "toolResult")
        return `${block.failed ? "Tool failed" : "Tool result"} · ${String(block.toolName ?? "")}\n${String(block.display ?? "")}`;
    return "";
}

function terminalGridProject(grid: RigTerminalGridProjection): TerminalGridSnapshot {
    return {
        cols: grid.cols,
        rows: grid.rows.length,
        title: grid.title,
        cursor: grid.cursor,
        lines: grid.rows.map((row) => ({
            cells: row.cells.map((cell): TerminalCellSnapshot => {
                const style = record(grid.styles[cell.styleId]);
                return {
                    x: cell.x,
                    text: cell.text,
                    width: cell.width,
                    bold: style.bold === true,
                    dim: style.dim === true,
                    italic: style.italic === true,
                    underline: Boolean(style.underline),
                    inverse: style.inverse === true,
                    strikethrough: style.strikethrough === true,
                    foreground: terminalColor(style.foreground, grid.palette),
                    background: terminalColor(style.background, grid.palette),
                };
            }),
        })),
    };
}

function record(value: RigJsonValue | undefined): Readonly<Record<string, RigJsonValue>> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return value as Readonly<Record<string, RigJsonValue>>;
}

function terminalColor(value: RigJsonValue | undefined, palette: readonly string[]): string | null {
    if (typeof value === "string") return value;
    const color = record(value);
    if (
        color.kind === "rgb" &&
        typeof color.red === "number" &&
        typeof color.green === "number" &&
        typeof color.blue === "number"
    )
        return `rgb(${color.red} ${color.green} ${color.blue})`;
    if (color.kind === "palette" && typeof color.index === "number")
        return palette[color.index] ?? null;
    return null;
}
