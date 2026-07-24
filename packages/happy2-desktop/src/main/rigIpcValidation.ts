import type { RigClientRequest, RigStreamOpenRequest } from "../shared/desktopContract";

export function rigClientRequestValidate(value: unknown): RigClientRequest {
    const request = record(value, "Rig request");
    const type = boundedString(request.type, "Rig request type", 64);
    switch (type) {
        case "healthRead":
        case "catalogRead":
        case "sessionsRead":
            keys(request, ["type"]);
            return { type };
        case "sessionRead":
        case "subagentsRead":
        case "terminalsRead":
        case "sessionFork":
        case "sessionReset":
            keys(request, ["type", "sessionId"]);
            return { type, sessionId: entityId(request.sessionId, "session") };
        case "sessionCreate": {
            keys(request, ["type", "input"]);
            const input = record(request.input, "Session create input");
            keys(input, [
                "cwd",
                "providerId",
                "modelId",
                "effort",
                "serviceTier",
                "permissionMode",
            ]);
            const cwd = boundedString(input.cwd, "Working directory", 4096);
            if (!cwd.startsWith("/")) throw new Error("The working directory must be absolute.");
            return {
                type,
                input: {
                    cwd,
                    ...optionalString(input, "providerId", 256),
                    ...optionalString(input, "modelId", 256),
                    ...optionalString(input, "effort", 128),
                    ...optionalServiceTier(input),
                    ...optionalPermission(input),
                },
            };
        }
        case "messageSubmit": {
            keys(request, ["type", "sessionId", "text", "clientSubmissionId"]);
            return {
                type,
                sessionId: entityId(request.sessionId, "session"),
                text: boundedString(request.text, "Message text", 4 * 1024 * 1024),
                clientSubmissionId: boundedString(
                    request.clientSubmissionId,
                    "Client submission identity",
                    256,
                ),
            };
        }
        case "messageSteer": {
            keys(request, ["type", "sessionId", "text", "clientSubmissionId", "expectedRunId"]);
            return {
                type,
                sessionId: entityId(request.sessionId, "session"),
                text: boundedString(request.text, "Message text", 4 * 1024 * 1024),
                clientSubmissionId: boundedString(
                    request.clientSubmissionId,
                    "Client submission identity",
                    256,
                ),
                ...optionalString(request, "expectedRunId", 256),
            };
        }
        case "runAbort":
            keys(request, ["type", "sessionId", "expectedRunId"]);
            return {
                type,
                sessionId: entityId(request.sessionId, "session"),
                ...optionalString(request, "expectedRunId", 256),
            };
        case "userInputAnswer": {
            keys(request, ["type", "sessionId", "input"]);
            const input = record(request.input, "User input answer");
            keys(input, ["requestId", "answers"]);
            const answers = record(input.answers, "User input answers");
            const projected: Record<string, readonly string[]> = {};
            if (Object.keys(answers).length > 100)
                throw new Error("Too many user input answers were provided.");
            for (const [id, answer] of Object.entries(answers)) {
                if (!id || id.length > 256 || !Array.isArray(answer) || answer.length > 100)
                    throw new Error("A user input answer is invalid.");
                projected[id] = answer.map((entry) =>
                    boundedString(entry, "User input answer value", 65_536),
                );
            }
            return {
                type,
                sessionId: entityId(request.sessionId, "session"),
                input: {
                    requestId: boundedString(input.requestId, "User input request identity", 256),
                    answers: projected,
                },
            };
        }
        case "modelChange": {
            keys(request, ["type", "sessionId", "input"]);
            const input = record(request.input, "Model selection");
            keys(input, ["providerId", "modelId", "effort"]);
            return {
                type,
                sessionId: entityId(request.sessionId, "session"),
                input: {
                    modelId: boundedString(input.modelId, "Model identity", 256),
                    ...optionalString(input, "providerId", 256),
                    ...optionalString(input, "effort", 128),
                },
            };
        }
        case "effortChange":
            keys(request, ["type", "sessionId", "effort"]);
            return {
                type,
                sessionId: entityId(request.sessionId, "session"),
                ...optionalString(request, "effort", 128),
            };
        case "serviceTierChange":
            keys(request, ["type", "sessionId", "serviceTier"]);
            return {
                type,
                sessionId: entityId(request.sessionId, "session"),
                ...optionalServiceTier(request),
            };
        case "permissionModeChange":
            keys(request, ["type", "sessionId", "permissionMode"]);
            return {
                type,
                sessionId: entityId(request.sessionId, "session"),
                permissionMode: permissionMode(request.permissionMode),
            };
        case "terminalCreate": {
            keys(request, ["type", "sessionId", "input"]);
            const input = record(request.input, "Terminal create input");
            keys(input, ["cols", "rows"]);
            return {
                type,
                sessionId: entityId(request.sessionId, "session"),
                input: terminalSize(input.cols, input.rows),
            };
        }
        case "terminalStop":
            keys(request, ["type", "sessionId", "terminalId"]);
            return {
                type,
                sessionId: entityId(request.sessionId, "session"),
                terminalId: entityId(request.terminalId, "terminal"),
            };
        default:
            throw new Error("The Rig request type is unsupported.");
    }
}

export function rigStreamOpenRequestValidate(value: unknown): RigStreamOpenRequest {
    const request = record(value, "Rig stream request");
    if (request.type === "globalEvents") {
        keys(request, ["type", "after"]);
        return {
            type: "globalEvents",
            ...(request.after === undefined ? {} : { after: cursor(request.after) }),
        };
    }
    if (request.type === "sessionEvents") {
        keys(request, ["type", "sessionId", "after"]);
        return {
            type: "sessionEvents",
            sessionId: entityId(request.sessionId, "session"),
            ...optionalString(request, "after", 256),
        };
    }
    if (request.type === "terminal") {
        keys(request, ["type", "sessionId", "terminalId"]);
        return {
            type: "terminal",
            sessionId: entityId(request.sessionId, "session"),
            terminalId: entityId(request.terminalId, "terminal"),
        };
    }
    throw new Error("The Rig stream request type is unsupported.");
}

export function rigStreamIdValidate(value: unknown): string {
    if (typeof value === "string" && /^rig_stream_[a-f0-9]{32}$/u.test(value)) return value;
    throw new Error("The Rig stream identity is invalid.");
}

export function rigTerminalInputValidate(value: unknown): string {
    return boundedString(value, "Terminal input", 65_536, true);
}

export function rigTerminalSizeValidate(cols: unknown, rows: unknown) {
    return terminalSize(cols, rows);
}

export function rigScrollbackValidate(start: unknown, count: unknown) {
    if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(count) ||
        (start as number) < 0 ||
        (count as number) < 1 ||
        (count as number) > 10_000
    )
        throw new Error("The terminal scrollback range is invalid.");
    return { start: start as number, count: count as number };
}

export function rigScrollbackBasisValidate(
    value: unknown,
): { readonly historyEpoch: string; readonly historyRevision: number } | undefined {
    if (value === undefined) return undefined;
    const basis = record(value, "Terminal scrollback basis");
    keys(basis, ["historyEpoch", "historyRevision"]);
    if (!Number.isSafeInteger(basis.historyRevision) || (basis.historyRevision as number) < 0)
        throw new Error("The terminal scrollback revision is invalid.");
    return {
        historyEpoch: boundedString(basis.historyEpoch, "Terminal history epoch", 256),
        historyRevision: basis.historyRevision as number,
    };
}

function record(value: unknown, label: string): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error(`${label} is invalid.`);
    return value as Record<string, unknown>;
}

function keys(value: Record<string, unknown>, allowed: readonly string[]): void {
    if (Object.keys(value).some((key) => !allowed.includes(key)))
        throw new Error("The Rig request contains unsupported fields.");
}

function boundedString(value: unknown, label: string, maximum: number, empty = false): string {
    if (
        typeof value !== "string" ||
        (!empty && value.length === 0) ||
        value.length > maximum ||
        value.includes("\0")
    )
        throw new Error(`${label} is invalid.`);
    return value;
}

function entityId(value: unknown, label: string) {
    return boundedString(value, `${label} identity`, 256) as never;
}

function optionalString(
    value: Record<string, unknown>,
    key: string,
    maximum: number,
): Record<string, string> {
    return value[key] === undefined ? {} : { [key]: boundedString(value[key], key, maximum) };
}

function optionalServiceTier(value: Record<string, unknown>): { readonly serviceTier?: "fast" } {
    if (value.serviceTier === undefined) return {};
    if (value.serviceTier !== "fast") throw new Error("The Rig service tier is invalid.");
    return { serviceTier: "fast" };
}

function optionalPermission(value: Record<string, unknown>) {
    return value.permissionMode === undefined
        ? {}
        : { permissionMode: permissionMode(value.permissionMode) };
}

function permissionMode(value: unknown): "auto" | "workspace_write" | "read_only" | "full_access" {
    if (
        value === "auto" ||
        value === "workspace_write" ||
        value === "read_only" ||
        value === "full_access"
    )
        return value;
    throw new Error("The Rig permission mode is invalid.");
}

function cursor(value: unknown): number {
    if (!Number.isSafeInteger(value) || (value as number) < 0)
        throw new Error("The Rig event cursor is invalid.");
    return value as number;
}

function terminalSize(cols: unknown, rows: unknown) {
    if (
        !Number.isSafeInteger(cols) ||
        !Number.isSafeInteger(rows) ||
        (cols as number) < 2 ||
        (cols as number) > 1000 ||
        (rows as number) < 1 ||
        (rows as number) > 1000
    )
        throw new Error("The Rig terminal size is invalid.");
    return { cols: cols as number, rows: rows as number };
}
