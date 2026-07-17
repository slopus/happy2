import { type DrizzleExecutor } from "../../drizzle.js";
import { type SlashCommandSummary } from "../../integrations/types.js";
import { asSlashCommand } from "./asSlashCommand.js";
import { eq } from "drizzle-orm";
import { slashCommandSelection } from "./slashCommandSelection.js";
import { slashCommands } from "../../schema.js";
/**
 * Loads one slashCommands row through the shared command selection and rejects a missing post-write record.
 * Centralizing the asSlashCommand mapping keeps create and update responses identical to later command projections.
 */
export async function getSlashCommandDb(
    executor: DrizzleExecutor,
    commandId: string,
): Promise<SlashCommandSummary> {
    const [row] = await executor
        .select(slashCommandSelection)
        .from(slashCommands)
        .where(eq(slashCommands.id, commandId));
    if (!row) throw new Error("Slash command was not created");
    return asSlashCommand(row);
}
