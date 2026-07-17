export interface AutomationSummary {
    id: string;
    name: string;
    chatId?: string;
    botId?: string;
    triggerType: "schedule" | "event" | "webhook";
    triggerConfig: Record<string, unknown>;
    actionType: "send_message" | "call_webhook" | "moderate";
    actionConfig: Record<string, unknown>;
    timezone?: string;
    nextRunAt?: string;
    active: boolean;
    lastRunAt?: string;
    lastError?: string;
    createdAt: string;
    updatedAt: string;
}
