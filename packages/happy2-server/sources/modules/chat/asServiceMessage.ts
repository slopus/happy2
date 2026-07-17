import { type MessageSummary } from "./types.js";
export function asServiceMessage(value: unknown): MessageSummary["service"] {
    if (typeof value !== "string") return undefined;
    try {
        const parsed = JSON.parse(value) as {
            service?: {
                type?: unknown;
                userId?: unknown;
            };
        };
        return (parsed.service?.type === "user_added" || parsed.service?.type === "user_joined") &&
            typeof parsed.service.userId === "string"
            ? {
                  type: parsed.service.type,
                  userId: parsed.service.userId,
              }
            : undefined;
    } catch {
        return undefined;
    }
}
