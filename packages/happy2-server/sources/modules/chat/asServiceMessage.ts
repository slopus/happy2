import { type MessageSummary } from "./types.js";
export function asServiceMessage(value: unknown): MessageSummary["service"] {
    if (typeof value !== "string") return undefined;
    try {
        const parsed = JSON.parse(value) as {
            service?: {
                type?: unknown;
                userId?: unknown;
                agentUserId?: unknown;
                effort?: unknown;
            };
        };
        if (
            (parsed.service?.type === "user_added" ||
                parsed.service?.type === "user_joined" ||
                parsed.service?.type === "user_left" ||
                parsed.service?.type === "user_kicked" ||
                parsed.service?.type === "channel_archived") &&
            typeof parsed.service.userId === "string"
        )
            return {
                type: parsed.service.type,
                userId: parsed.service.userId,
            };
        if (
            parsed.service?.type === "agent_effort_changed" &&
            typeof parsed.service.agentUserId === "string" &&
            typeof parsed.service.effort === "string"
        )
            return {
                type: parsed.service.type,
                agentUserId: parsed.service.agentUserId,
                effort: parsed.service.effort,
            };
        return undefined;
    } catch {
        return undefined;
    }
}
