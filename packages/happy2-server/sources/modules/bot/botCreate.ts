import { type BotSummary, type IntegrationMutation } from "../integrations/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { botIdentities } from "../schema.js";
import { constraintConflict } from "../integration/constraintConflict.js";
import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import { normalizedUsername } from "./impl/normalizedUsername.js";
import { optionalTrimmed } from "../integration/optionalTrimmed.js";
import { requiredTrimmed } from "../integration/requiredTrimmed.js";
import { integrationAppendAudit } from "../integration/integrationAppendAudit.js";
import { botGet } from "./botGet.js";
import { integrationRecordChange } from "../integration/integrationRecordChange.js";
import { userRequireIntegrationActive } from "../integration/userRequireIntegrationActive.js";
import { userRequireIntegrationAdmin } from "../integration/userRequireIntegrationAdmin.js";
import { requireFileDb } from "./impl/requireFileDb.js";

/**
 * Creates a botIdentities principal for an active integration, validating its display fields, administrator, and optional avatar file.
 * The transaction binds identity, file authorization, and audit evidence so credentials are never issued for a partially configured bot.
 */
export async function botCreate(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        name: string;
        username: string;
        description?: string;
        photoFileId?: string;
        ownerUserId?: string;
    },
): Promise<IntegrationMutation<BotSummary>> {
    const name = requiredTrimmed(input.name, "Bot name", 200);
    const username = normalizedUsername(input.username);
    const description = optionalTrimmed(input.description, "Bot description", 2_000);
    return withTransaction(executor, async (tx) => {
        await userRequireIntegrationAdmin(tx, input.actorUserId);
        if (input.ownerUserId) await userRequireIntegrationActive(tx, input.ownerUserId);
        if (input.photoFileId) await requireFileDb(tx, input.photoFileId);
        const id = createId();
        try {
            await tx.insert(botIdentities).values({
                id,
                name,
                username,
                description: description ?? null,
                photoFileId: input.photoFileId ?? null,
                ownerUserId: input.ownerUserId ?? null,
                createdByUserId: input.actorUserId,
            });
        } catch (error: unknown) {
            throw constraintConflict(error, "Bot username is already in use");
        }
        const change = await integrationRecordChange(tx, input.actorUserId, "bot.created", id);
        await integrationAppendAudit(tx, input.actorUserId, "bot.created", "bot", id);
        await tx
            .update(botIdentities)
            .set({
                syncSequence: Number(change.sequence),
            })
            .where(eq(botIdentities.id, id));
        return {
            value: await botGet(tx, id),
            change,
        };
    });
}
