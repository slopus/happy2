import { eventKinds } from "./eventKinds.js";
export function matchesEvent(
    config: Record<string, unknown>,
    event: {
        kind: string;
        chatId?: string;
        automated: boolean;
    },
): boolean {
    const kinds = eventKinds(config);
    if (!kinds.includes("*") && !kinds.includes(event.kind)) return false;
    if (typeof config.chatId === "string" && config.chatId !== event.chatId) return false;
    return config.includeAutomated === true || !event.automated;
}
