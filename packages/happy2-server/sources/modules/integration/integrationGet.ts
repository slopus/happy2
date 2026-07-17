import { type DrizzleExecutor } from "../drizzle.js";
import { IntegrationError, type IntegrationSummary } from "../integrations/types.js";

import { asIntegration } from "./impl/asIntegration.js";
import { eq } from "drizzle-orm";
import { integrationSelection } from "./impl/integrationSelection.js";
import { integrations } from "../schema.js";
/**
 * Loads the canonical integration projection by identifier, including inactive or soft-deleted management history.
 * Mapping absence to the integration not-found error gives callers one typed boundary while lifecycle eligibility remains an explicit separate check.
 */
export async function integrationGet(
    executor: DrizzleExecutor,
    integrationId: string,
): Promise<IntegrationSummary> {
    const [row] = await executor
        .select(integrationSelection)
        .from(integrations)
        .where(eq(integrations.id, integrationId));
    if (!row) throw new IntegrationError("not_found", "Integration was not found");
    return asIntegration(row);
}
