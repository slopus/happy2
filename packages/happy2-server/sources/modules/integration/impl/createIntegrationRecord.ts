import { type DrizzleExecutor, withTransaction } from "../../drizzle.js";
import {
    type IntegrationKind,
    type IntegrationMutation,
    type IntegrationScope,
    type IntegrationSummary,
} from "../../integrations/types.js";

import { integrationFinishChange } from "../integrationFinishChange.js";
import { integrationGet } from "../integrationGet.js";
import { integrationInsert } from "../integrationInsert.js";
import { userRequireIntegrationAdmin } from "../userRequireIntegrationAdmin.js";
import { botRequire } from "../botRequire.js";

/**
 * Validates server-administrator authority and any active bot binding before inserting an integration and publishing its creation change.
 * The transaction prevents callers from receiving an integration whose audit, sync sequence, or optional bot validation failed to commit.
 */
export async function createIntegrationRecord(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        kind: IntegrationKind;
        name: string;
        description?: string;
        botId?: string;
        scopes: readonly IntegrationScope[];
    },
): Promise<IntegrationMutation<IntegrationSummary>> {
    return withTransaction(executor, async (tx) => {
        await userRequireIntegrationAdmin(tx, input.actorUserId);
        if (input.botId) await botRequire(tx, input.botId);
        const integration = await integrationInsert(tx, input);
        const change = await integrationFinishChange(
            tx,
            input.actorUserId,
            "integration.created",
            integration.id,
        );
        return {
            value: await integrationGet(tx, integration.id),
            change,
        };
    });
}
