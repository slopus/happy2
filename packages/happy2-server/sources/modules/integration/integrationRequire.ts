import { type DrizzleExecutor } from "../drizzle.js";
import { IntegrationError, type IntegrationSummary } from "../integrations/types.js";

import { integrationGet } from "./integrationGet.js";
/**
 * Returns an integration by identifier and optionally requires it to remain active, mapping inactive records to not-found.
 * Keeping the active-state policy explicit lets mutation and invocation callers choose whether historical integrations are valid inputs.
 */
export async function integrationRequire(
    executor: DrizzleExecutor,
    integrationId: string,
    active: boolean,
): Promise<IntegrationSummary> {
    const row = await integrationGet(executor, integrationId);
    if (active && !row.active) throw new IntegrationError("not_found", "Integration was not found");
    return row;
}
