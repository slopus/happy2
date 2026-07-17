import { type AutomationSummary } from "./automationSummary.js";
import { CollaborationError } from "../../chat/types.js";
import { moderationAction } from "./moderationAction.js";
import { requiredString } from "./requiredString.js";
import { stringArray } from "./stringArray.js";
export function validateAction(
    type: AutomationSummary["actionType"],
    config: Record<string, unknown>,
    chatId: string | undefined,
): void {
    if (type === "send_message") {
        if (!chatId && typeof config.chatId !== "string")
            throw new CollaborationError("invalid", "Send-message automation requires a chat");
        requiredString(config.text, "actionConfig.text");
        stringArray(config.attachmentFileIds);
    }
    if (type === "call_webhook") requiredString(config.subscriptionId, "subscriptionId");
    if (type === "moderate") {
        requiredString(config.reportId, "reportId");
        moderationAction(config.action);
    }
}
