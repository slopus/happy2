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

export interface DesktopActiveTarget extends DesktopTopologyTarget {
    authentication: "account" | "local";
    serverUrl: string;
}

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

export interface HappyDesktopBridge {
    runtimeGet(): Promise<DesktopRuntimeSnapshot>;
    runtimeReset(): Promise<void>;
    runtimeRetry(): Promise<void>;
    runtimeStart(request: DesktopStartRequest): Promise<void>;
    sessionCredentialGet(targetId: string): Promise<string | undefined>;
    sessionCredentialSet(targetId: string, value?: string): Promise<void>;
    topologySelect(topologyId: string): Promise<void>;
    updateInstall(): Promise<void>;
    subscribe(listener: (snapshot: DesktopRuntimeSnapshot) => void): () => void;
}

export const desktopIpc = {
    runtimeChanged: "happy2:runtime:changed",
    runtimeGet: "happy2:runtime:get",
    runtimeReset: "happy2:runtime:reset",
    runtimeRetry: "happy2:runtime:retry",
    runtimeStart: "happy2:runtime:start",
    sessionCredentialGet: "happy2:session-credential:get",
    sessionCredentialSet: "happy2:session-credential:set",
    topologySelect: "happy2:topology:select",
    updateInstall: "happy2:update:install",
} as const;
