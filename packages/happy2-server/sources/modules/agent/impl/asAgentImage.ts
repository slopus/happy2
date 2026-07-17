import { type AgentImageSummary } from "../../chat/types.js";
import { number } from "../../chat/number.js";
import { optionalText } from "../../chat/optionalText.js";
import { text } from "../../chat/text.js";
export function asAgentImage(row: Record<string, unknown>): AgentImageSummary {
    const builtinKey = optionalText(row.builtin_key);
    return {
        id: text(row.id),
        name: text(row.name),
        definitionHash: text(row.definition_hash),
        dockerTag: text(row.docker_tag),
        ...(builtinKey === "daycare-full" || builtinKey === "daycare-minimal"
            ? {
                  builtinKey,
              }
            : {}),
        status: text(row.status) as AgentImageSummary["status"],
        buildAttempt: number(row.build_attempt),
        buildProgress: number(row.build_progress),
        lastBuildLogLine: optionalText(row.last_build_log_line),
        buildLogUpdatedAt: optionalText(row.build_log_updated_at),
        dockerImageId: optionalText(row.docker_image_id),
        lastError: optionalText(row.last_error),
        buildRequestedAt: optionalText(row.build_requested_at),
        buildStartedAt: optionalText(row.build_started_at),
        readyAt: optionalText(row.ready_at),
        createdByUserId: optionalText(row.created_by_user_id),
        createdAt: text(row.created_at),
        updatedAt: text(row.updated_at),
    };
}
