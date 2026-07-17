import { type BotSummary } from "../../integrations/types.js";
import { number } from "../../integration/number.js";
import { optionalText } from "../../integration/optionalText.js";
import { text } from "../../integration/text.js";
export function asBot(row: Record<string, unknown>): BotSummary {
    return {
        id: text(row.id),
        name: text(row.name),
        username: text(row.username),
        description: optionalText(row.description),
        photoFileId: optionalText(row.photo_file_id),
        ownerUserId: optionalText(row.owner_user_id),
        active: number(row.active) === 1,
        createdAt: text(row.created_at),
        updatedAt: text(row.updated_at),
    };
}
