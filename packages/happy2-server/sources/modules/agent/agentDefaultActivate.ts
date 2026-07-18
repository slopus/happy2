import { type MutationHint } from "../chat/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { agentImages, agentImageSettings, syncEvents, users } from "../schema.js";
import { and, eq, isNull, sql } from "drizzle-orm";
import { areaHint } from "../chat/areaHint.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";

/**
 * Promotes the server-managed Happy identity by updating users from its non-executable bootstrap image to the first ready default image.
 * Later default-image changes do not overwrite Happy, leaving explicit administrator image changes authoritative.
 */
export async function agentDefaultActivate(
    executor: DrizzleExecutor,
    actorUserId?: string,
): Promise<MutationHint | undefined> {
    return withTransaction(executor, async (tx) => {
        const [happy] = await tx
            .select({
                id: users.id,
                imageId: users.agentImageId,
                imageSystemOnly: agentImages.systemOnly,
            })
            .from(users)
            .innerJoin(agentImages, eq(agentImages.id, users.agentImageId))
            .where(
                and(
                    eq(users.agentRole, "default"),
                    isNull(users.systemRole),
                    isNull(users.deletedAt),
                ),
            )
            .limit(1);
        if (!happy?.imageId || happy.imageSystemOnly !== 1) return undefined;
        const [configured] = await tx
            .select({ id: agentImages.id })
            .from(agentImageSettings)
            .innerJoin(agentImages, eq(agentImages.id, agentImageSettings.defaultImageId))
            .where(
                and(
                    eq(agentImageSettings.id, 1),
                    eq(agentImages.systemOnly, 0),
                    eq(agentImages.status, "ready"),
                    sql`${agentImages.dockerImageId} IS NOT NULL`,
                ),
            )
            .limit(1);
        if (!configured) return undefined;
        const sequence = await syncSequenceNext(tx);
        const [activated] = await tx
            .update(users)
            .set({ agentImageId: configured.id, syncSequence: sequence })
            .where(and(eq(users.id, happy.id), eq(users.agentImageId, happy.imageId)))
            .returning({ id: users.id });
        if (!activated) return undefined;
        await tx.insert(syncEvents).values({
            sequence,
            kind: "user.updated",
            entityId: happy.id,
            actorUserId: actorUserId ?? happy.id,
        });
        return areaHint(sequence, "users");
    });
}
