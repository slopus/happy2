import { type AutomationSummary } from "./automationSummary.js";
import { CollaborationError } from "../../chat/types.js";
import { eventKinds } from "./eventKinds.js";
export function validateTrigger(
    type: AutomationSummary["triggerType"],
    config: Record<string, unknown>,
    nextRunAt: string | undefined,
): void {
    if (type === "schedule") {
        if (!nextRunAt || !Number.isFinite(Date.parse(nextRunAt)))
            throw new CollaborationError("invalid", "Scheduled automation requires nextRunAt");
        const interval = config.intervalSeconds;
        if (
            interval !== undefined &&
            (!Number.isSafeInteger(interval) ||
                (interval as number) < 60 ||
                (interval as number) > 31_536_000)
        )
            throw new CollaborationError(
                "invalid",
                "intervalSeconds must be between 60 and 31536000",
            );
    }
    if (type === "event") eventKinds(config);
}
