declare const rigSessionIdBrand: unique symbol;
declare const rigTerminalIdBrand: unique symbol;
declare const rigEventIdBrand: unique symbol;

export type RigSessionId = string & { readonly [rigSessionIdBrand]: true };
export type RigTerminalId = string & { readonly [rigTerminalIdBrand]: true };
export type RigEventId = string & { readonly [rigEventIdBrand]: true };

export type RigPermissionMode = "auto" | "workspace_write" | "read_only" | "full_access";
export type RigServiceTier = "fast";
export type RigSessionStatus =
    | "idle"
    | "queued"
    | "running"
    | "completed"
    | "aborted"
    | "suspended"
    | "error";

export type RigJsonValue =
    | null
    | boolean
    | number
    | string
    | readonly RigJsonValue[]
    | { readonly [key: string]: RigJsonValue };

export interface RigModelProjection {
    readonly id: string;
    readonly name: string;
    readonly thinkingLevels: readonly string[];
    readonly defaultThinkingLevel: string;
    readonly contextWindow?: number;
}

export interface RigProviderProjection {
    readonly id: string;
    readonly disabledReason?: "not_authenticated" | "not_enabled" | "no_models";
    readonly models: readonly RigModelProjection[];
    readonly serviceTiers: readonly RigServiceTier[];
}

export interface RigCatalogProjection {
    readonly defaultModelId: string;
    readonly defaultProviderId: string;
    readonly providers: readonly RigProviderProjection[];
}

export type RigDaemonHealth =
    | {
          readonly status: "starting";
          readonly version: string;
      }
    | {
          readonly status: "ready";
          readonly version: string;
          readonly catalog: RigCatalogProjection;
      }
    | {
          readonly status: "error";
          readonly version: string;
          readonly message: string;
      };

export interface RigSessionSummaryProjection {
    readonly id: RigSessionId;
    /** Canonical absolute directory used for grouping and identity. */
    readonly cwd: string;
    /** Original Rig path retained for presentation when it differs from `cwd`. */
    readonly displayCwd: string;
    readonly providerId: string;
    readonly modelId: string;
    readonly permissionMode: RigPermissionMode;
    readonly effort?: string;
    readonly serviceTier?: RigServiceTier;
    readonly status: RigSessionStatus;
    readonly title?: string;
    readonly recap?: string;
    readonly createdAt: number;
    readonly updatedAt: number;
    readonly lastMessageAt?: number;
}

export type RigMessageBlock =
    | { readonly type: "text"; readonly text: string }
    | {
          readonly type: "image";
          readonly mediaType: string;
          readonly data: string;
          readonly detail?: "high" | "original";
      }
    | {
          readonly type: "thinking";
          readonly thinking: string;
          readonly redacted: boolean;
      }
    | {
          readonly type: "toolCall";
          readonly id: string;
          readonly name: string;
          readonly arguments: RigJsonValue;
      }
    | {
          readonly type: "toolResult";
          readonly toolCallId: string;
          readonly toolName: string;
          readonly display: string;
          readonly failed: boolean;
      };

export interface RigMessageProjection {
    readonly id: string;
    readonly role: "system" | "user" | "agent";
    readonly blocks: readonly RigMessageBlock[];
    readonly internal: boolean;
}

export interface RigUserInputOption {
    readonly label: string;
    readonly description: string;
}

export interface RigUserInputQuestion {
    readonly id: string;
    readonly header: string;
    readonly question: string;
    readonly multiSelect: boolean;
    readonly required: boolean;
    readonly options: readonly RigUserInputOption[];
}

export interface RigUserInputRequest {
    readonly requestId: string;
    readonly questions: readonly RigUserInputQuestion[];
}

export interface RigBackgroundProcessProjection {
    readonly id: number;
    readonly command: string;
    readonly cwd: string;
    readonly status: "running";
}

export interface RigSubagentProjection {
    readonly id: RigSessionId;
    readonly parentSessionId: RigSessionId;
    readonly description: string;
    readonly taskName?: string;
    readonly modelId: string;
    readonly status: RigSessionStatus;
    readonly createdAt: number;
    readonly updatedAt: number;
    readonly activeSince?: number;
    readonly elapsedMs?: number;
    readonly latestText?: string;
    readonly totalTokens?: number;
}

export interface RigSessionProjection {
    readonly id: RigSessionId;
    readonly cwd: string;
    readonly displayCwd: string;
    readonly providerId: string;
    readonly modelId: string;
    readonly models: readonly RigModelProjection[];
    readonly effort?: string;
    readonly serviceTier?: RigServiceTier;
    readonly permissionMode: RigPermissionMode;
    readonly status: RigSessionStatus;
    readonly title?: string;
    readonly recap?: string;
    readonly modelLocked: boolean;
    readonly messages: readonly RigMessageProjection[];
    readonly pendingUserInputs: readonly RigUserInputRequest[];
    readonly backgroundProcesses: readonly RigBackgroundProcessProjection[];
    readonly lastEventId?: RigEventId;
}

export interface RigStreamingMessageProjection {
    readonly runId: string;
    readonly blocks: readonly RigMessageBlock[];
}

export interface RigTerminalSummaryProjection {
    readonly id: RigTerminalId;
    readonly cols: number;
    readonly rows: number;
    readonly epoch: string;
    readonly status: "running" | "exited";
    readonly exitCode: number | null;
}

export interface RigTerminalGridCell {
    readonly x: number;
    readonly text: string;
    readonly width: 1 | 2;
    readonly styleId: number;
}

export interface RigTerminalGridRow {
    readonly cells: readonly RigTerminalGridCell[];
    readonly wrapped: boolean;
}

export interface RigTerminalGridProjection {
    readonly cols: number;
    readonly cursor: { readonly x: number; readonly y: number; readonly visible: boolean } | null;
    readonly palette: readonly string[];
    readonly revision: number;
    readonly rows: readonly RigTerminalGridRow[];
    readonly startRow: number;
    readonly styles: readonly RigJsonValue[];
    readonly title: string;
    readonly totalRows: number;
}

export interface RigTerminalScrollbackProjection {
    readonly baseRow: number;
    readonly count: number;
    readonly historyEpoch: string;
    readonly historyRevision: number;
    readonly rows: readonly RigTerminalGridRow[];
    readonly start: number;
    readonly totalRows: number;
}

export interface RigStateError {
    readonly message: string;
}

export type RigLoadStatus =
    | { readonly type: "loading" }
    | { readonly type: "ready" }
    | { readonly type: "error"; readonly error: RigStateError };

export interface RigDirectoryGroupProjection {
    readonly id: string;
    readonly displayPath: string;
    readonly sessions: readonly RigSessionSummaryProjection[];
    readonly latestActivityAt: number;
}

export interface RigDirectorySnapshot {
    readonly status: RigLoadStatus;
    readonly groups: readonly RigDirectoryGroupProjection[];
    readonly mutationError?: RigStateError;
}

export interface RigSessionSnapshot {
    readonly status: RigLoadStatus;
    readonly session?: RigSessionProjection;
    readonly streaming?: RigStreamingMessageProjection;
    readonly mutationError?: RigStateError;
}

export interface RigActivitySnapshot {
    readonly status: RigLoadStatus;
    readonly subagents: readonly RigSubagentProjection[];
    readonly backgroundProcesses: readonly RigBackgroundProcessProjection[];
}

export interface RigTerminalListSnapshot {
    readonly status: RigLoadStatus;
    readonly terminals: readonly RigTerminalSummaryProjection[];
    readonly mutationError?: RigStateError;
}

export interface RigTerminalSnapshot {
    readonly status: "connecting" | "connected" | "disconnected" | "exited" | "error";
    readonly grid?: RigTerminalGridProjection;
    readonly exitCode: number | null;
    readonly error?: RigStateError;
}

export interface RigSessionCreateInput {
    readonly cwd: string;
    readonly providerId?: string;
    readonly modelId?: string;
    readonly effort?: string;
    readonly serviceTier?: RigServiceTier;
    readonly permissionMode?: RigPermissionMode;
}

export interface RigSessionSubmitInput {
    readonly text: string;
}

export interface RigSessionSteerInput {
    readonly text: string;
    readonly expectedRunId?: string;
}

export interface RigUserInputAnswers {
    readonly requestId: string;
    readonly answers: Readonly<Record<string, readonly string[]>>;
}

export interface RigModelSelection {
    readonly providerId?: string;
    readonly modelId: string;
    readonly effort?: string;
}

export interface RigTerminalCreateInput {
    readonly cols: number;
    readonly rows: number;
}

export type RigStateOutput =
    | { readonly type: "sessionCreated"; readonly sessionId: RigSessionId }
    | { readonly type: "sessionForked"; readonly sessionId: RigSessionId }
    | { readonly type: "sessionSubmitted"; readonly sessionId: RigSessionId }
    | { readonly type: "sessionSteered"; readonly sessionId: RigSessionId }
    | { readonly type: "terminalCreated"; readonly terminalId: RigTerminalId };

export interface RigSurfaceStore<Snapshot> {
    get(): Snapshot;
    subscribe(listener: () => void): () => void;
}

export interface RigDirectoryStore extends RigSurfaceStore<RigDirectorySnapshot> {
    sessionCreate(input: RigSessionCreateInput): void;
    sessionFork(sessionId: RigSessionId): void;
    sessionReset(sessionId: RigSessionId): void;
}

export interface RigSessionStore extends RigSurfaceStore<RigSessionSnapshot> {
    messageSubmit(input: RigSessionSubmitInput): void;
    messageSteer(input: RigSessionSteerInput): void;
    runAbort(expectedRunId?: string): void;
    userInputAnswer(input: RigUserInputAnswers): void;
    modelChange(input: RigModelSelection): void;
    effortChange(effort?: string): void;
    serviceTierChange(serviceTier?: RigServiceTier): void;
    permissionModeChange(permissionMode: RigPermissionMode): void;
}

export interface RigSessionHandle extends RigSessionStore, Disposable {}

export interface RigActivityStore extends RigSurfaceStore<RigActivitySnapshot> {}
export interface RigActivityHandle extends RigActivityStore, Disposable {}

export interface RigTerminalListStore extends RigSurfaceStore<RigTerminalListSnapshot> {
    terminalCreate(input: RigTerminalCreateInput): void;
    terminalStop(terminalId: RigTerminalId): void;
}
export interface RigTerminalListHandle extends RigTerminalListStore, Disposable {}

export interface RigTerminalStore extends RigSurfaceStore<RigTerminalSnapshot>, Disposable {
    terminalWrite(data: string): void;
    terminalResize(cols: number, rows: number): void;
    terminalScrollback(
        start: number,
        count: number,
        basis?: { readonly historyEpoch: string; readonly historyRevision: number },
    ): Promise<RigTerminalScrollbackProjection>;
    terminalReconnect(): void;
    terminalStop(): void;
}
