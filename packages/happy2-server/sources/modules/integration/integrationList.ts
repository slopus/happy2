import { type DrizzleExecutor } from "../drizzle.js";
import { type IntegrationSummary } from "../integrations/types.js";
import { asIntegration } from "./impl/asIntegration.js";
import { desc } from "drizzle-orm";
import { integrationSelection } from "./impl/integrationSelection.js";
import { integrations } from "../schema.js";
import { userRequireIntegrationAdmin } from "./userRequireIntegrationAdmin.js";
/**
 * Lists all integration definitions newest first after requiring an active server integration administrator.
 * Retaining inactive and deleted records in this management view preserves operational history without making them runtime-eligible.
 */
export async function integrationList(
    executor: DrizzleExecutor,
    actorUserId: string,
): Promise<IntegrationSummary[]> {
    await userRequireIntegrationAdmin(executor, actorUserId);
    const rows = await executor
        .select(integrationSelection)
        .from(integrations)
        .orderBy(desc(integrations.createdAt), desc(integrations.id));
    return rows.map(asIntegration);
}
