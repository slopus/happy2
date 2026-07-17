import type { MutationHint } from "../chat/types.js";

export interface AutomationRuntime {
    moderate?: (input: {
        actorUserId: string;
        reportId: string;
        action:
            | "warn"
            | "restrict"
            | "remove_message"
            | "remove_file"
            | "ban"
            | "unban"
            | "delete_user";
        reason?: string;
        expiresAt?: string;
        metadata?: Record<string, unknown>;
        automationRunId: string;
    }) => Promise<{ sync?: MutationHint }>;
}
