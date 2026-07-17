import { type DrizzleExecutor } from "../drizzle.js";
import { eq } from "drizzle-orm";
import { number } from "../chat/number.js";
import { optionalText } from "../chat/optionalText.js";
import { serverSettings } from "../schema.js";
import { text } from "../chat/text.js";
/**
 * Reads the singleton server identity and its default retention policy.
 * This action is the canonical projection from persisted server settings to the public profile shape.
 */
export async function serverProfileGet(executor: DrizzleExecutor): Promise<{
    name: string;
    title?: string;
    photoFileId?: string;
    defaultRetentionMode: "forever" | "duration";
    defaultRetentionSeconds?: number;
    updatedAt: string;
}> {
    const [row] = await executor
        .select({
            name: serverSettings.name,
            title: serverSettings.title,
            photo_file_id: serverSettings.photoFileId,
            default_retention_mode: serverSettings.defaultRetentionMode,
            default_retention_seconds: serverSettings.defaultRetentionSeconds,
            updated_at: serverSettings.updatedAt,
        })
        .from(serverSettings)
        .where(eq(serverSettings.id, 1));
    if (!row) throw new Error("Server settings are missing");
    return {
        name: text(row.name),
        title: optionalText(row.title),
        photoFileId: optionalText(row.photo_file_id),
        defaultRetentionMode: text(row.default_retention_mode) as "forever" | "duration",
        defaultRetentionSeconds:
            row.default_retention_seconds === null
                ? undefined
                : number(row.default_retention_seconds),
        updatedAt: text(row.updated_at),
    };
}
