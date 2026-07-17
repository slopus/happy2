import { type AutomationRow } from "./automationRow.js";
import { type AutomationSummary } from "./automationSummary.js";
import { jsonObject } from "./jsonObject.js";
export function asAutomation(row: AutomationRow): AutomationSummary {
    const triggerConfig = jsonObject(row.triggerConfigJson);
    delete triggerConfig.tokenHash;
    return {
        id: row.id,
        name: row.name,
        chatId: row.chatId ?? undefined,
        botId: row.botId ?? undefined,
        triggerType: row.triggerType as AutomationSummary["triggerType"],
        triggerConfig,
        actionType: row.actionType as AutomationSummary["actionType"],
        actionConfig: jsonObject(row.actionConfigJson),
        timezone: row.timezone ?? undefined,
        nextRunAt: row.nextRunAt ?? undefined,
        active: row.active === 1,
        lastRunAt: row.lastRunAt ?? undefined,
        lastError: row.lastError ?? undefined,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}
