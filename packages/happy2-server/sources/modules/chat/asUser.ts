import { optionalText } from "./optionalText.js";
import { text } from "./text.js";
import { type UserSummary } from "./types.js";
export function asUser(row: Record<string, unknown>): UserSummary {
    return {
        id: text(row.id),
        username: text(row.username),
        firstName: text(row.first_name),
        lastName: optionalText(row.last_name),
        title: optionalText(row.title),
        photoFileId: optionalText(row.photo_file_id),
        role: text(row.role) as "member" | "admin",
        kind: text(row.user_kind, "human") as "human" | "agent",
        agentImageId: optionalText(row.agent_image_id),
        agentEffort: optionalText(row.agent_effort),
        createdByUserId: optionalText(row.created_by_user_id),
        systemRole: row.system_role === "service" ? "service" : undefined,
        agentRole: row.agent_role === "default" ? "default" : undefined,
    };
}
