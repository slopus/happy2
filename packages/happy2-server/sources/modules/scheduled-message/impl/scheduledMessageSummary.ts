export interface ScheduledMessageSummary {
    id: string;
    chatId: string;
    text: string;
    attachmentFileIds: string[];
    scheduledFor: string;
    timezone?: string;
    status: "scheduled" | "publishing" | "published" | "cancelled" | "failed";
    publishedMessageId?: string;
    lastError?: string;
    createdAt: string;
    updatedAt: string;
}
