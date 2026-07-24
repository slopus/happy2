import type {
    RigCatalogProjection,
    RigDaemonHealth,
    RigEventId,
    RigModelSelection,
    RigPermissionMode,
    RigServiceTier,
    RigSessionCreateInput,
    RigSessionId,
    RigSessionProjection,
    RigSessionSummaryProjection,
    RigStreamingMessageProjection,
    RigSubagentProjection,
    RigTerminalCreateInput,
    RigTerminalGridProjection,
    RigTerminalId,
    RigTerminalScrollbackProjection,
    RigTerminalSummaryProjection,
    RigUserInputAnswers,
} from "./rigTypes.js";

export type RigGlobalEvent = {
    readonly cursor: number;
    readonly sessionId: RigSessionId;
    readonly kind: "sessionChanged";
};

export type RigSessionEvent =
    | {
          readonly eventId: RigEventId;
          readonly sessionId: RigSessionId;
          readonly kind: "sessionChanged";
      }
    | {
          readonly eventId: RigEventId;
          readonly sessionId: RigSessionId;
          readonly kind: "streamingMessageChanged";
          readonly message: RigStreamingMessageProjection;
      };

export interface RigEventObserver<Event> {
    event(value: Event): void;
    error(error: unknown): void;
    end(): void;
}

export interface RigTerminalObserver {
    connected(): void;
    grid(value: RigTerminalGridProjection): void;
    exit(exitCode: number | null): void;
    error(error: unknown): void;
}

export interface RigTerminalConnection {
    write(data: string): void;
    resize(cols: number, rows: number): void;
    scrollback(
        start: number,
        count: number,
        basis?: { readonly historyEpoch: string; readonly historyRevision: number },
    ): Promise<RigTerminalScrollbackProjection>;
    close(): void;
}

/**
 * Authenticated direct-Rig boundary. Implementations own credentials, sockets,
 * retries, and serialization; RigState sees only closed product projections.
 */
export interface RigTransport {
    healthRead(): Promise<RigDaemonHealth>;
    catalogRead(): Promise<RigCatalogProjection>;
    sessionsRead(): Promise<readonly RigSessionSummaryProjection[]>;
    sessionRead(sessionId: RigSessionId): Promise<RigSessionProjection>;
    subagentsRead(sessionId: RigSessionId): Promise<readonly RigSubagentProjection[]>;
    terminalsRead(sessionId: RigSessionId): Promise<readonly RigTerminalSummaryProjection[]>;
    sessionCreate(input: RigSessionCreateInput): Promise<RigSessionProjection>;
    sessionFork(sessionId: RigSessionId): Promise<RigSessionProjection>;
    sessionReset(sessionId: RigSessionId): Promise<RigSessionProjection>;
    messageSubmit(sessionId: RigSessionId, text: string, clientSubmissionId: string): Promise<void>;
    messageSteer(
        sessionId: RigSessionId,
        text: string,
        clientSubmissionId: string,
        expectedRunId?: string,
    ): Promise<void>;
    runAbort(sessionId: RigSessionId, expectedRunId?: string): Promise<void>;
    userInputAnswer(
        sessionId: RigSessionId,
        input: RigUserInputAnswers,
    ): Promise<RigSessionProjection>;
    modelChange(sessionId: RigSessionId, input: RigModelSelection): Promise<RigSessionProjection>;
    effortChange(sessionId: RigSessionId, effort?: string): Promise<RigSessionProjection>;
    serviceTierChange(
        sessionId: RigSessionId,
        serviceTier?: RigServiceTier,
    ): Promise<RigSessionProjection>;
    permissionModeChange(
        sessionId: RigSessionId,
        permissionMode: RigPermissionMode,
    ): Promise<RigSessionProjection>;
    terminalCreate(
        sessionId: RigSessionId,
        input: RigTerminalCreateInput,
    ): Promise<RigTerminalSummaryProjection>;
    terminalStop(
        sessionId: RigSessionId,
        terminalId: RigTerminalId,
    ): Promise<RigTerminalSummaryProjection>;
    terminalConnect(
        sessionId: RigSessionId,
        terminalId: RigTerminalId,
        observer: RigTerminalObserver,
    ): Promise<RigTerminalConnection>;
    globalEventsSubscribe(observer: RigEventObserver<RigGlobalEvent>, after?: number): () => void;
    sessionEventsSubscribe(
        sessionId: RigSessionId,
        observer: RigEventObserver<RigSessionEvent>,
        after?: RigEventId,
    ): () => void;
}
