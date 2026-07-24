export type DesktopMode = "local" | "cloud";

export type DesktopStartRequest =
    | { mode: "local" }
    | {
          mode: "cloud";
          serverUrl: string;
      };

export type DesktopTopology =
    | {
          id: string;
          mode: "local";
      }
    | {
          id: string;
          mode: "cloud";
          serverUrl: string;
      };

export interface DesktopTopologyTarget {
    detail: string;
    id: string;
    kind: "local" | "remote";
    label: string;
    mode: DesktopMode;
}

export type DesktopActiveTarget =
    | (DesktopTopologyTarget & {
          authentication: "rig";
          mode: "local";
          rigVersion: string;
      })
    | (DesktopTopologyTarget & {
          authentication: "account";
          mode: "cloud";
          serverUrl: string;
      });

export interface DesktopUpdateSnapshot {
    availableVersion?: string;
    message?: string;
    status: "idle" | "checking" | "available" | "downloading" | "downloaded" | "error";
}

export type DesktopRuntimeSnapshot =
    | {
          phase: "choosing";
          targets: readonly DesktopTopologyTarget[];
          update: DesktopUpdateSnapshot;
      }
    | {
          phase: "starting";
          message: string;
          request: DesktopStartRequest;
          targets: readonly DesktopTopologyTarget[];
          update: DesktopUpdateSnapshot;
      }
    | {
          phase: "installRequired";
          command: "npm install --global @slopus/rig";
          message: string;
          request: Extract<DesktopStartRequest, { readonly mode: "local" }>;
          targets: readonly DesktopTopologyTarget[];
          update: DesktopUpdateSnapshot;
      }
    | {
          phase: "ready";
          activeTarget: DesktopActiveTarget;
          activeTargetId: string;
          connectionId: number;
          mode: DesktopMode;
          targets: readonly DesktopTopologyTarget[];
          update: DesktopUpdateSnapshot;
      }
    | {
          phase: "error";
          message: string;
          request: DesktopStartRequest;
          retryable: boolean;
          targets: readonly DesktopTopologyTarget[];
          update: DesktopUpdateSnapshot;
      };

export type RigClientRequest =
    | { readonly type: "healthRead" }
    | { readonly type: "catalogRead" }
    | { readonly type: "sessionsRead" }
    | { readonly type: "sessionRead"; readonly sessionId: RigSessionId }
    | { readonly type: "subagentsRead"; readonly sessionId: RigSessionId }
    | { readonly type: "terminalsRead"; readonly sessionId: RigSessionId }
    | { readonly type: "sessionCreate"; readonly input: RigSessionCreateInput }
    | { readonly type: "sessionFork"; readonly sessionId: RigSessionId }
    | { readonly type: "sessionReset"; readonly sessionId: RigSessionId }
    | {
          readonly type: "messageSubmit";
          readonly sessionId: RigSessionId;
          readonly text: string;
          readonly clientSubmissionId: string;
      }
    | {
          readonly type: "messageSteer";
          readonly sessionId: RigSessionId;
          readonly text: string;
          readonly clientSubmissionId: string;
          readonly expectedRunId?: string;
      }
    | {
          readonly type: "runAbort";
          readonly sessionId: RigSessionId;
          readonly expectedRunId?: string;
      }
    | {
          readonly type: "userInputAnswer";
          readonly sessionId: RigSessionId;
          readonly input: RigUserInputAnswers;
      }
    | {
          readonly type: "modelChange";
          readonly sessionId: RigSessionId;
          readonly input: RigModelSelection;
      }
    | {
          readonly type: "effortChange";
          readonly sessionId: RigSessionId;
          readonly effort?: string;
      }
    | {
          readonly type: "serviceTierChange";
          readonly sessionId: RigSessionId;
          readonly serviceTier?: RigServiceTier;
      }
    | {
          readonly type: "permissionModeChange";
          readonly sessionId: RigSessionId;
          readonly permissionMode: RigPermissionMode;
      }
    | {
          readonly type: "terminalCreate";
          readonly sessionId: RigSessionId;
          readonly input: RigTerminalCreateInput;
      }
    | {
          readonly type: "terminalStop";
          readonly sessionId: RigSessionId;
          readonly terminalId: RigTerminalId;
      };

export type RigClientResponse<Request extends RigClientRequest> =
    Request["type"] extends "healthRead"
        ? RigDaemonHealth
        : Request["type"] extends "catalogRead"
          ? RigCatalogProjection
          : Request["type"] extends "sessionsRead"
            ? readonly RigSessionSummaryProjection[]
            : Request["type"] extends "subagentsRead"
              ? readonly RigSubagentProjection[]
              : Request["type"] extends "terminalsRead"
                ? readonly RigTerminalSummaryProjection[]
                : Request["type"] extends "terminalCreate" | "terminalStop"
                  ? RigTerminalSummaryProjection
                  : Request["type"] extends "messageSubmit" | "messageSteer" | "runAbort"
                    ? void
                    : RigSessionProjection;

export type RigStreamOpenRequest =
    | { readonly type: "globalEvents"; readonly after?: number }
    | {
          readonly type: "sessionEvents";
          readonly sessionId: RigSessionId;
          readonly after?: RigEventId;
      }
    | {
          readonly type: "terminal";
          readonly sessionId: RigSessionId;
          readonly terminalId: RigTerminalId;
      };

export type RigStreamEvent =
    | { readonly streamId: string; readonly type: "globalEvent"; readonly event: RigGlobalEvent }
    | { readonly streamId: string; readonly type: "sessionEvent"; readonly event: RigSessionEvent }
    | { readonly streamId: string; readonly type: "terminalConnected" }
    | {
          readonly streamId: string;
          readonly type: "terminalGrid";
          readonly grid: RigTerminalGridProjection;
      }
    | {
          readonly streamId: string;
          readonly type: "terminalExited";
          readonly exitCode: number | null;
      }
    | { readonly streamId: string; readonly type: "ended" }
    | { readonly streamId: string; readonly type: "error"; readonly message: string };

export interface RigInstallTerminalOpenResponse {
    readonly terminalId: string;
    readonly command: "npm install --global @slopus/rig";
    readonly status: "awaitingConfirmation" | "running" | "exited";
}

export type RigInstallTerminalEvent =
    | { readonly type: "output"; readonly terminalId: string; readonly data: string }
    | {
          readonly type: "exited";
          readonly terminalId: string;
          readonly exitCode: number;
          readonly verified: boolean;
          readonly message?: string;
      };

export interface HappyDesktopBridge {
    directoryPick(): Promise<string | undefined>;
    runtimeGet(): Promise<DesktopRuntimeSnapshot>;
    runtimeReset(): Promise<void>;
    runtimeRetry(): Promise<void>;
    runtimeStart(request: DesktopStartRequest): Promise<void>;
    rigRequest<Request extends RigClientRequest>(
        request: Request,
    ): Promise<RigClientResponse<Request>>;
    rigStreamOpen(request: RigStreamOpenRequest): Promise<string>;
    rigStreamClose(streamId: string): Promise<void>;
    rigTerminalWrite(streamId: string, data: string): Promise<void>;
    rigTerminalResize(streamId: string, cols: number, rows: number): Promise<void>;
    rigTerminalScrollback(
        streamId: string,
        start: number,
        count: number,
        basis?: { readonly historyEpoch: string; readonly historyRevision: number },
    ): Promise<RigTerminalScrollbackProjection>;
    rigInstallOpen(): Promise<RigInstallTerminalOpenResponse>;
    rigInstallConfirm(terminalId: string, cols: number, rows: number): Promise<void>;
    rigInstallInput(terminalId: string, data: string): Promise<void>;
    rigInstallResize(terminalId: string, cols: number, rows: number): Promise<void>;
    rigInstallClose(terminalId: string): Promise<void>;
    topologySelect(topologyId: string): Promise<void>;
    updateInstall(): Promise<void>;
    subscribe(listener: (snapshot: DesktopRuntimeSnapshot) => void): () => void;
    rigSubscribe(listener: (event: RigStreamEvent) => void): () => void;
    rigInstallSubscribe(listener: (event: RigInstallTerminalEvent) => void): () => void;
}

export const desktopIpc = {
    directoryPick: "happy2:directory:pick",
    runtimeChanged: "happy2:runtime:changed",
    runtimeGet: "happy2:runtime:get",
    runtimeReset: "happy2:runtime:reset",
    runtimeRetry: "happy2:runtime:retry",
    runtimeStart: "happy2:runtime:start",
    rigRequest: "happy2:rig:request",
    rigStreamOpen: "happy2:rig:stream:open",
    rigStreamClose: "happy2:rig:stream:close",
    rigStreamEvent: "happy2:rig:stream:event",
    rigTerminalWrite: "happy2:rig:terminal:write",
    rigTerminalResize: "happy2:rig:terminal:resize",
    rigTerminalScrollback: "happy2:rig:terminal:scrollback",
    rigInstallOpen: "happy2:rig-install:open",
    rigInstallConfirm: "happy2:rig-install:confirm",
    rigInstallInput: "happy2:rig-install:input",
    rigInstallResize: "happy2:rig-install:resize",
    rigInstallClose: "happy2:rig-install:close",
    rigInstallEvent: "happy2:rig-install:event",
    topologySelect: "happy2:topology:select",
    updateInstall: "happy2:update:install",
} as const;
import type {
    RigCatalogProjection,
    RigDaemonHealth,
    RigEventId,
    RigGlobalEvent,
    RigModelSelection,
    RigPermissionMode,
    RigServiceTier,
    RigSessionCreateInput,
    RigSessionEvent,
    RigSessionId,
    RigSessionProjection,
    RigSessionSummaryProjection,
    RigSubagentProjection,
    RigTerminalCreateInput,
    RigTerminalGridProjection,
    RigTerminalId,
    RigTerminalScrollbackProjection,
    RigTerminalSummaryProjection,
    RigUserInputAnswers,
} from "happy2-state";
