import {
    type BotSummary,
    IntegrationError,
    type IntegrationMutation,
} from "../integrations/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { and, eq, isNull, sql } from "drizzle-orm";
import { botIdentities } from "../schema.js";
import { constraintConflict } from "../integration/constraintConflict.js";

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
 * Updates an active botIdentities profile after validating integration ownership, text fields, and any replacement avatar file.
 * Coupling profile and audit changes makes externally visible bot identity edits reviewable without affecting its credential identity.
 */
export async function botUpdate(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        botId: string;
        name?: string;
        username?: string;
        description?: string | null;
        photoFileId?: string | null;
        ownerUserId?: string | null;
    },
): Promise<IntegrationMutation<BotSummary>> {
    if (
        input.name === undefined &&
        input.username === undefined &&
        input.description === undefined &&
        input.photoFileId === undefined &&
        input.ownerUserId === undefined
    )
        throw new IntegrationError("invalid", "At least one bot field is required");
    const name =
        input.name === undefined ? undefined : requiredTrimmed(input.name, "Bot name", 200);
    const username = input.username === undefined ? undefined : normalizedUsername(input.username);
    const description =
        input.description === undefined || input.description === null
            ? input.description
            : optionalTrimmed(input.description, "Bot description", 2_000);
    return withTransaction(executor, async (tx) => {
        await userRequireIntegrationAdmin(tx, input.actorUserId);
        await botGet(tx, input.botId, true);
        if (input.ownerUserId) await userRequireIntegrationActive(tx, input.ownerUserId);
        if (input.photoFileId) await requireFileDb(tx, input.photoFileId);
        try {
            await tx
                .update(botIdentities)
                .set({
                    ...(name === undefined
                        ? {}
                        : {
                              name,
                          }),
                    ...(username === undefined
                        ? {}
                        : {
                              username,
                          }),
                    ...(input.description === undefined
                        ? {}
                        : {
                              description: description ?? null,
                          }),
                    ...(input.photoFileId === undefined
                        ? {}
                        : {
                              photoFileId: input.photoFileId,
                          }),
                    ...(input.ownerUserId === undefined
                        ? {}
                        : {
                              ownerUserId: input.ownerUserId,
                          }),
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(and(eq(botIdentities.id, input.botId), isNull(botIdentities.deletedAt)));
        } catch (error: unknown) {
            throw constraintConflict(error, "Bot username is already in use");
        }
        const change = await integrationRecordChange(
            tx,
            input.actorUserId,
            "bot.updated",
            input.botId,
        );
        await integrationAppendAudit(tx, input.actorUserId, "bot.updated", "bot", input.botId);
        await tx
            .update(botIdentities)
            .set({
                syncSequence: Number(change.sequence),
            })
            .where(eq(botIdentities.id, input.botId));
        return {
            value: await botGet(tx, input.botId),
            change,
        };
    });
}
