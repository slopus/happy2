import { CollaborationError } from "../../chat/types.js";
export function eventKinds(config: Record<string, unknown>): string[] {
    if (typeof config.event === "string" && config.event.trim()) return [config.event];
    if (
        Array.isArray(config.eventTypes) &&
        config.eventTypes.length > 0 &&
        config.eventTypes.length <= 100 &&
        config.eventTypes.every(
            (value) => typeof value === "string" && value.length > 0 && value.length <= 128,
        )
    )
        return [...new Set(config.eventTypes as string[])];
    throw new CollaborationError(
        "invalid",
        "Event automation requires triggerConfig.event or triggerConfig.eventTypes",
    );
}
