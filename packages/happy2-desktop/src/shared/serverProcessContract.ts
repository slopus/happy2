export const DESKTOP_LOCAL_ACCESS_TOKEN_ENV = "HAPPY2_DESKTOP_LOCAL_ACCESS_TOKEN";

export interface ServerProcessStart {
    configPath: string;
    errorLogPath: string;
    rigEndpointRoot: string;
    runtimeRoot: string;
    webRoot: string;
}

export type ServerProcessInput =
    | { type: "start"; input: ServerProcessStart }
    | { type: "shutdown" };

export type ServerProcessOutput =
    | { type: "ready"; url: string }
    | { type: "fatal"; message: string }
    | { type: "stopped" };
