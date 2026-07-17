import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { type MutationHint, type PresenceSettingsSummary } from "../chat/types.js";

import { areaHint } from "../chat/areaHint.js";
import { sql } from "drizzle-orm";
import { userPresenceSettings } from "../schema.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { listPresenceSettingsWithDb } from "./impl/listPresenceSettingsWithDb.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { userRequireActive } from "../chat/userRequireActive.js";

/**
 * Upserts the active user's availability policy and optional status text in userPresenceSettings.
 * Publishing the complete presence preference under one user sync sequence prevents devices from combining a new status with an old availability rule.
 */
export async function presenceSettingUpdate(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        availability?: "automatic" | "online" | "away" | "dnd";
        customStatusText?: string | null;
        customStatusEmoji?: string | null;
        statusExpiresAt?: string | null;
        dndUntil?: string | null;
    },
): Promise<{
    presence: PresenceSettingsSummary;
    hint: MutationHint;
}> {
    return withTransaction(executor, async (tx) => {
        await userRequireActive(tx, input.actorUserId);
        const sequence = await syncSequenceNext(tx);
        await tx
            .insert(userPresenceSettings)
            .values({
                userId: input.actorUserId,
                availability: input.availability ?? "automatic",
                customStatusText: input.customStatusText,
                customStatusEmoji: input.customStatusEmoji,
                statusExpiresAt: input.statusExpiresAt,
                dndUntil: input.dndUntil,
                syncSequence: sequence,
            })
            .onConflictDoUpdate({
                target: userPresenceSettings.userId,
                set: {
                    ...(input.availability === undefined
                        ? {}
                        : {
                              availability: input.availability,
                          }),
                    ...(input.customStatusText === undefined
                        ? {}
                        : {
                              customStatusText: input.customStatusText,
                          }),
                    ...(input.customStatusEmoji === undefined
                        ? {}
                        : {
                              customStatusEmoji: input.customStatusEmoji,
                          }),
                    ...(input.statusExpiresAt === undefined
                        ? {}
                        : {
                              statusExpiresAt: input.statusExpiresAt,
                          }),
                    ...(input.dndUntil === undefined
                        ? {}
                        : {
                              dndUntil: input.dndUntil,
                          }),
                    syncSequence: sequence,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                },
            });
        await syncEventInsert(tx, {
            sequence,
            kind: "presence.updated",
            entityId: input.actorUserId,
            actorUserId: input.actorUserId,
        });
        const [presence] = await listPresenceSettingsWithDb(tx, [input.actorUserId]);
        if (!presence) throw new Error("Presence settings were not saved");
        return {
            presence,
            hint: areaHint(sequence, "presence"),
        };
    });
}
