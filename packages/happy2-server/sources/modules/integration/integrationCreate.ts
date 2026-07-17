import { type DrizzleExecutor } from "../drizzle.js";
import {
    type IntegrationMutation,
    type IntegrationScope,
    type IntegrationSummary,
} from "../integrations/types.js";

import { createIntegrationRecord } from "./impl/createIntegrationRecord.js";
/**
 * Creates an integration for a server administrator after validating any bot binding, then emits its audit and sync change projection.
 * Delegating the entire transaction preserves one public creation contract for authorization, normalized insertion, and change publication.
 */
export async function integrationCreate(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        kind: "app" | "service_account";
        name: string;
        description?: string;
        botId?: string;
        scopes: readonly IntegrationScope[];
    },
): Promise<IntegrationMutation<IntegrationSummary>> {
    return createIntegrationRecord(executor, input);
}
