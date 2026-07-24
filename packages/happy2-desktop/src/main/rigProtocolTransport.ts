import { realpath } from "node:fs/promises";
import { isAbsolute, normalize, resolve } from "node:path";
import {
    ProtocolHttpClient,
    RemoteTerminalClientReplica,
    type RemoteTerminalAttachment,
} from "@slopus/rig-client-runtime/dist/client/index.js";
import type {
    GlobalEventQueueEntry,
    SessionEvent,
    SessionSummary,
} from "@slopus/rig-client-runtime/dist/protocol/index.js";
import type { Message } from "@slopus/rig-client-runtime/dist/agent/types.js";
import type { AssistantMessage } from "@slopus/rig-client-runtime/dist/providers/types.js";
import type {
    HealthResponse,
    ModelCatalog,
    ProtocolSession,
    SubagentSummary,
} from "@slopus/rig/types";
import type {
    RemoteTerminalGridState,
    RemoteTerminalReconnectState,
    RemoteTerminalScrollbackPage,
} from "@slopus/ghostty-web";
import type {
    RigCatalogProjection,
    RigDaemonHealth,
    RigEventId,
    RigJsonValue,
    RigMessageBlock,
    RigMessageProjection,
    RigModelProjection,
    RigSessionId,
    RigSessionProjection,
    RigSessionSummaryProjection,
    RigStreamingMessageProjection,
    RigSubagentProjection,
    RigTerminalGridProjection,
    RigTerminalId,
    RigTerminalScrollbackProjection,
    RigTerminalSummaryProjection,
    RigTransport,
} from "happy2-state";
import type { RigDirectTerminalConnection, RigTerminalObserver } from "happy2-state";

/** Projects Rig's authenticated local protocol into the serialization-safe state contract. */
export class RigProtocolTransport implements RigTransport, Disposable {
    private readonly aborters = new Set<AbortController>();
    private readonly reconnect = new Map<string, RemoteTerminalReconnectState>();
    private readonly terminalClosers = new Set<() => void>();
    private disposed = false;

    constructor(private readonly client: ProtocolHttpClient) {}

    async healthRead(): Promise<RigDaemonHealth> {
        return healthProject(await this.client.health());
    }

    async catalogRead(): Promise<RigCatalogProjection> {
        return catalogProject((await this.client.models()).catalog);
    }

    async sessionsRead(): Promise<readonly RigSessionSummaryProjection[]> {
        return Promise.all((await this.client.listSessions()).sessions.map(sessionSummaryProject));
    }

    async sessionRead(sessionId: RigSessionId): Promise<RigSessionProjection> {
        return sessionProject((await this.client.getSession(sessionId)).session);
    }

    async subagentsRead(sessionId: RigSessionId): Promise<readonly RigSubagentProjection[]> {
        return (await this.client.listSubagents(sessionId)).subagents.map(subagentProject);
    }

    async terminalsRead(sessionId: RigSessionId): Promise<readonly RigTerminalSummaryProjection[]> {
        return (await this.client.listRemoteTerminals(sessionId)).terminals.map(terminalProject);
    }

    async sessionCreate(input: Parameters<RigTransport["sessionCreate"]>[0]) {
        return sessionProject(
            (
                await this.client.createSession({
                    cwd: input.cwd,
                    ...(input.providerId ? { providerId: input.providerId } : {}),
                    ...(input.modelId ? { modelId: input.modelId } : {}),
                    ...(input.effort ? { effort: input.effort } : {}),
                    ...(input.serviceTier ? { serviceTier: input.serviceTier } : {}),
                    ...(input.permissionMode ? { permissionMode: input.permissionMode } : {}),
                })
            ).session,
        );
    }

    async sessionFork(sessionId: RigSessionId) {
        return sessionProject((await this.client.forkSession(sessionId)).session);
    }

    async sessionReset(sessionId: RigSessionId) {
        return sessionProject((await this.client.reset(sessionId)).session);
    }

    async messageSubmit(sessionId: RigSessionId, text: string, clientSubmissionId: string) {
        await this.client.submitMessage(sessionId, { text, clientSubmissionId });
    }

    async messageSteer(
        sessionId: RigSessionId,
        text: string,
        clientSubmissionId: string,
        expectedRunId?: string,
    ) {
        await this.client.steerMessage(sessionId, {
            text,
            clientSubmissionId,
            ...(expectedRunId ? { expectedRunId } : {}),
        });
    }

    async runAbort(sessionId: RigSessionId, expectedRunId?: string) {
        await this.client.abort(sessionId, expectedRunId ? { expectedRunId } : {});
    }

    async userInputAnswer(
        sessionId: RigSessionId,
        input: Parameters<RigTransport["userInputAnswer"]>[1],
    ) {
        return sessionProject(
            (
                await this.client.answerUserInput(sessionId, input.requestId, {
                    answers: input.answers,
                })
            ).session,
        );
    }

    async modelChange(sessionId: RigSessionId, input: Parameters<RigTransport["modelChange"]>[1]) {
        return sessionProject(
            (
                await this.client.changeModel(sessionId, {
                    modelId: input.modelId,
                    ...(input.providerId ? { providerId: input.providerId } : {}),
                    ...(input.effort ? { effort: input.effort } : {}),
                })
            ).session,
        );
    }

    async effortChange(sessionId: RigSessionId, effort?: string) {
        return sessionProject(
            (await this.client.changeEffort(sessionId, effort ? { effort } : {})).session,
        );
    }

    async serviceTierChange(
        sessionId: RigSessionId,
        serviceTier?: Parameters<RigTransport["serviceTierChange"]>[1],
    ) {
        return sessionProject(
            (await this.client.changeServiceTier(sessionId, serviceTier ? { serviceTier } : {}))
                .session,
        );
    }

    async permissionModeChange(
        sessionId: RigSessionId,
        permissionMode: Parameters<RigTransport["permissionModeChange"]>[1],
    ) {
        return sessionProject(
            (await this.client.changePermissionMode(sessionId, { permissionMode })).session,
        );
    }

    async terminalCreate(
        sessionId: RigSessionId,
        input: Parameters<RigTransport["terminalCreate"]>[1],
    ) {
        return terminalProject((await this.client.createRemoteTerminal(sessionId, input)).terminal);
    }

    async terminalStop(sessionId: RigSessionId, terminalId: RigTerminalId) {
        return terminalProject(
            (await this.client.stopRemoteTerminal(sessionId, terminalId)).terminal,
        );
    }

    async terminalConnect(
        sessionId: RigSessionId,
        terminalId: RigTerminalId,
        observer: RigTerminalObserver,
    ): Promise<RigDirectTerminalConnection> {
        this.assertActive();
        const key = `${sessionId}\0${terminalId}`;
        const replica = await RemoteTerminalClientReplica.create();
        if (this.disposed) {
            replica.close();
            throw new Error("The Rig protocol transport is closed.");
        }
        const applyGrid = replica.applyGrid.bind(replica);
        const applyVt = replica.applyVt.bind(replica);
        replica.applyGrid = async (grid) => {
            await applyGrid(grid);
            observer.grid(terminalGridProject(grid));
        };
        replica.applyVt = async (data) => {
            await applyVt(data);
            observer.grid(terminalVtGridProject(replica.terminal.snapshot()));
        };
        const reconnectState = this.reconnect.get(key);
        let attachment: RemoteTerminalAttachment;
        try {
            attachment = await this.client.attachRemoteTerminal(sessionId, terminalId, {
                replica,
                ...(reconnectState ? { reconnectState } : {}),
            });
        } catch (error) {
            replica.close();
            throw error;
        }
        if (this.disposed) {
            attachment.close();
            replica.close();
            throw new Error("The Rig protocol transport is closed.");
        }
        let closed = false;
        const close = () => {
            if (closed) return;
            closed = true;
            if (!this.disposed) this.reconnect.set(key, attachment.reconnectState());
            this.terminalClosers.delete(close);
            attachment.close();
            replica.close();
        };
        this.terminalClosers.add(close);
        observer.connected();
        void attachment.exited.then(
            (exitCode) => observer.exit(exitCode),
            (error: unknown) => observer.error(error),
        );
        return {
            write: (data) => {
                if (!closed) attachment.writeInput(data);
            },
            resize: (cols, rows) => {
                if (!closed)
                    void attachment.protocol.resize(cols, rows).catch((error: unknown) => {
                        observer.error(error);
                    });
            },
            scrollback: async (start, count, basis) =>
                terminalScrollbackProject(await attachment.requestScrollback(start, count, basis)),
            close,
        };
    }

    globalEventsSubscribe(
        observer: Parameters<RigTransport["globalEventsSubscribe"]>[0],
        after?: number,
    ): () => void {
        const controller = this.controllerCreate();
        void this.client
            .watchGlobalEvents({
                ...(after === undefined ? {} : { after }),
                signal: controller.signal,
                onEvent: (entry) => observer.event(globalEventProject(entry)),
            })
            .then(
                () => observer.end(),
                (error: unknown) => {
                    if (!controller.signal.aborted) observer.error(error);
                },
            )
            .finally(() => this.aborters.delete(controller));
        return () => controller.abort();
    }

    sessionEventsSubscribe(
        sessionId: RigSessionId,
        observer: Parameters<RigTransport["sessionEventsSubscribe"]>[1],
        after?: RigEventId,
    ): () => void {
        const controller = this.controllerCreate();
        void this.client
            .watchSessionEvents({
                sessionId,
                ...(after ? { after } : {}),
                signal: controller.signal,
                onEvent: (event) => observer.event(sessionEventProject(event)),
            })
            .then(
                () => observer.end(),
                (error: unknown) => {
                    if (!controller.signal.aborted) observer.error(error);
                },
            )
            .finally(() => this.aborters.delete(controller));
        return () => controller.abort();
    }

    [Symbol.dispose](): void {
        if (this.disposed) return;
        this.disposed = true;
        for (const controller of this.aborters) controller.abort();
        this.aborters.clear();
        for (const close of this.terminalClosers) close();
        this.terminalClosers.clear();
        this.reconnect.clear();
    }

    private controllerCreate(): AbortController {
        this.assertActive();
        const controller = new AbortController();
        this.aborters.add(controller);
        return controller;
    }

    private assertActive(): void {
        if (this.disposed) throw new Error("The Rig protocol transport is closed.");
    }
}

export function healthProject(value: HealthResponse): RigDaemonHealth {
    if (value.status === "ready")
        return {
            status: "ready",
            version: value.identity.version,
            catalog: catalogProject(value.catalog),
        };
    if (value.status === "error")
        return { status: "error", version: value.identity.version, message: value.error };
    return { status: "starting", version: value.identity.version };
}

export function catalogProject(value: ModelCatalog): RigCatalogProjection {
    return {
        defaultModelId: value.defaultModelId,
        defaultProviderId: value.defaultProviderId,
        providers: value.providers.map((provider) => ({
            id: provider.providerId,
            ...(provider.disabledReason ? { disabledReason: provider.disabledReason } : {}),
            models: provider.models.map(modelProject),
            serviceTiers: provider.serviceTiers ?? [],
        })),
    };
}

async function sessionSummaryProject(value: SessionSummary): Promise<RigSessionSummaryProjection> {
    return {
        id: value.id as RigSessionId,
        cwd: await cwdCanonicalize(value.cwd),
        displayCwd: value.cwd,
        providerId: value.providerId,
        modelId: value.modelId,
        permissionMode: value.permissionMode,
        ...(value.effort ? { effort: value.effort } : {}),
        ...(value.serviceTier ? { serviceTier: value.serviceTier } : {}),
        status: value.status,
        ...(value.title ? { title: value.title } : {}),
        ...(value.recap ? { recap: value.recap } : {}),
        createdAt: value.createdAt,
        updatedAt: value.updatedAt,
        ...(value.lastMessageAt ? { lastMessageAt: value.lastMessageAt } : {}),
    };
}

async function sessionProject(value: ProtocolSession): Promise<RigSessionProjection> {
    return {
        id: value.id as RigSessionId,
        cwd: await cwdCanonicalize(value.cwd),
        displayCwd: value.cwd,
        providerId: value.providerId,
        modelId: value.modelId,
        models: value.models.map(modelProject),
        ...(value.effort ? { effort: value.effort } : {}),
        ...(value.serviceTier ? { serviceTier: value.serviceTier } : {}),
        permissionMode: value.permissionMode,
        status: value.status,
        ...(value.title ? { title: value.title } : {}),
        ...(value.recap ? { recap: value.recap } : {}),
        modelLocked: value.modelLocked,
        messages: value.snapshot.messages.map(messageProject),
        pendingUserInputs: value.pendingUserInputs.map((request) => ({
            requestId: request.requestId,
            questions: request.questions.map((question) => ({
                id: question.id,
                header: question.header,
                question: question.question,
                multiSelect: question.multiSelect,
                required: question.required ?? false,
                options: question.options.map((option) => ({ ...option })),
            })),
        })),
        backgroundProcesses: (value.backgroundProcesses ?? []).map((process) => ({
            id: process.sessionId,
            command: process.command,
            cwd: process.cwd,
            status: process.status,
        })),
        ...(value.lastEventId ? { lastEventId: value.lastEventId as RigEventId } : {}),
    };
}

function modelProject(value: ModelCatalog["models"][number]): RigModelProjection {
    return {
        id: value.id,
        name: value.name,
        thinkingLevels: value.thinkingLevels,
        defaultThinkingLevel: value.defaultThinkingLevel,
        ...(value.contextWindow ? { contextWindow: value.contextWindow } : {}),
    };
}

function messageProject(value: Message): RigMessageProjection {
    return {
        id: value.id,
        role: value.role,
        blocks: value.blocks.map(blockProject),
        internal: value.internal ?? false,
    };
}

function blockProject(value: Message["blocks"][number]): RigMessageBlock {
    switch (value.type) {
        case "text":
            return { type: "text", text: value.text };
        case "image":
            return {
                type: "image",
                mediaType: value.mediaType,
                data: value.data,
                ...(value.detail ? { detail: value.detail } : {}),
            };
        case "thinking":
            return {
                type: "thinking",
                thinking: value.thinking,
                redacted: value.redacted ?? false,
            };
        case "tool_call":
            return {
                type: "toolCall",
                id: value.id,
                name: value.name,
                arguments: jsonProject(value.arguments),
            };
        case "tool_result":
            return {
                type: "toolResult",
                toolCallId: value.toolCallId,
                toolName: value.toolName,
                display: value.display,
                failed: value.isError ?? false,
            };
    }
}

function subagentProject(value: SubagentSummary): RigSubagentProjection {
    return {
        id: value.id as RigSessionId,
        parentSessionId: value.parentSessionId as RigSessionId,
        description: value.description,
        ...(value.taskName ? { taskName: value.taskName } : {}),
        modelId: value.modelId,
        status: value.status,
        createdAt: value.createdAt,
        updatedAt: value.updatedAt,
        ...(value.activeSince ? { activeSince: value.activeSince } : {}),
        ...(value.elapsedMs ? { elapsedMs: value.elapsedMs } : {}),
        ...(value.latestText ? { latestText: value.latestText } : {}),
        ...(value.totalTokens ? { totalTokens: value.totalTokens } : {}),
    };
}

function terminalProject(
    value: Awaited<ReturnType<ProtocolHttpClient["listRemoteTerminals"]>>["terminals"][number],
): RigTerminalSummaryProjection {
    return {
        id: value.id as RigTerminalId,
        cols: value.cols,
        rows: value.rows,
        epoch: value.epoch,
        status: value.status,
        exitCode: value.exitCode,
    };
}

function globalEventProject(entry: GlobalEventQueueEntry) {
    return {
        cursor: entry.cursor,
        sessionId: entry.event.sessionId as RigSessionId,
        kind: "sessionChanged" as const,
    };
}

function sessionEventProject(event: SessionEvent) {
    const streaming = streamingMessageProject(event);
    return streaming
        ? {
              eventId: event.id as RigEventId,
              sessionId: event.sessionId as RigSessionId,
              kind: "streamingMessageChanged" as const,
              message: streaming,
          }
        : {
              eventId: event.id as RigEventId,
              sessionId: event.sessionId as RigSessionId,
              kind: "sessionChanged" as const,
          };
}

function streamingMessageProject(event: SessionEvent): RigStreamingMessageProjection | undefined {
    if (event.type !== "agent_event" || !("partial" in event.data.event)) return undefined;
    const partial = event.data.event.partial as AssistantMessage;
    return {
        runId: event.data.runId,
        blocks: partial.content.flatMap((content): RigMessageBlock[] => {
            if (content.type === "text") return [{ type: "text", text: content.text }];
            if (content.type === "thinking")
                return [
                    {
                        type: "thinking",
                        thinking: content.thinking,
                        redacted: content.redacted ?? false,
                    },
                ];
            if (content.type === "toolCall")
                return [
                    {
                        type: "toolCall",
                        id: content.id,
                        name: content.name,
                        arguments: jsonProject(content.arguments),
                    },
                ];
            return [];
        }),
    };
}

function terminalGridProject(value: RemoteTerminalGridState): RigTerminalGridProjection {
    return {
        cols: value.cols,
        cursor: value.cursor ? { ...value.cursor } : null,
        palette: [...value.palette],
        revision: value.revision,
        rows: value.rows.map((row) => ({
            cells: row.cells.map((cell) => ({ ...cell })),
            wrapped: row.wrapped,
        })),
        startRow: value.startRow,
        styles: value.styles.map(jsonProject),
        title: value.title,
        totalRows: value.totalRows,
    };
}

function terminalVtGridProject(
    value: ReturnType<RemoteTerminalClientReplica["terminal"]["snapshot"]>,
): RigTerminalGridProjection {
    const styles: RigJsonValue[] = [];
    const styleIds = new Map<string, number>();
    const styleId = (style: (typeof value.rows)[number]["cells"][number]["style"]): number => {
        const projected = jsonProject(style);
        const key = JSON.stringify(projected);
        const existing = styleIds.get(key);
        if (existing !== undefined) return existing;
        const id = styles.length;
        styles.push(projected);
        styleIds.set(key, id);
        return id;
    };
    return {
        cols: value.cols,
        cursor: value.cursor
            ? {
                  x: value.cursor.x,
                  y: value.cursor.y,
                  visible: value.cursor.visible,
              }
            : null,
        palette: value.palette.map((color) =>
            color.kind === "rgb"
                ? `rgb(${color.red} ${color.green} ${color.blue})`
                : `palette(${color.index})`,
        ),
        revision: value.outputRevision,
        rows: value.rows.map((row) => ({
            cells: row.cells.map((cell) => ({
                x: cell.x,
                text: cell.text,
                width: cell.width,
                styleId: styleId(cell.style),
            })),
            wrapped: row.wrapped,
        })),
        startRow: value.startRow,
        styles,
        title: value.title,
        totalRows: value.totalRows,
    };
}

function terminalScrollbackProject(
    value: RemoteTerminalScrollbackPage,
): RigTerminalScrollbackProjection {
    return {
        baseRow: value.baseRow,
        count: value.count,
        historyEpoch: value.historyEpoch,
        historyRevision: value.historyRevision,
        rows: value.rows.map((row) => ({
            cells: row.cells.map((cell) => ({ ...cell })),
            wrapped: row.wrapped,
        })),
        start: value.start,
        totalRows: value.totalRows,
    };
}

function jsonProject(value: unknown): RigJsonValue {
    if (value === null || typeof value === "string" || typeof value === "boolean") return value;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (Array.isArray(value)) return value.map(jsonProject);
    if (value && typeof value === "object")
        return Object.fromEntries(
            Object.entries(value).map(([key, entry]) => [key, jsonProject(entry)]),
        );
    return null;
}

async function cwdCanonicalize(value: string): Promise<string> {
    const absolute = normalize(isAbsolute(value) ? value : resolve(value));
    try {
        return await realpath(absolute);
    } catch {
        return absolute;
    }
}
