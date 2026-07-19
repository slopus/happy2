import { createId } from "@paralleldrive/cuid2";
import { and, eq, isNull, sql } from "drizzle-orm";
import { CollaborationError } from "../chat/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { agentImages, agentImageSettings, syncEvents, users } from "../schema.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { ensureDefaultAgentChannelsDb } from "./impl/ensureDefaultAgentChannelsDb.js";

/**
 * Creates the sole default-agent users identity from one configured ready image and builds its required channel and conversation substrate.
 * The identity, memberships, default-agent conversations, and sync history commit atomically; setup owns when this action may be invoked and records its onboarding step separately.
 */
export async function agentDefaultCreate(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        imageId: string;
        name: string;
        username: string;
    },
): Promise<{ id: string; name: string; username: string; imageId: string }> {
    return withTransaction(executor, async (tx) => {
        const [existingDefault, configuredImage, usernameConflict] = await Promise.all([
            tx
                .select({ id: users.id })
                .from(users)
                .where(
                    and(
                        eq(users.agentRole, "default"),
                        eq(users.kind, "agent"),
                        isNull(users.deletedAt),
                    ),
                )
                .limit(1),
            tx
                .select({ id: agentImages.id })
                .from(agentImageSettings)
                .innerJoin(agentImages, eq(agentImages.id, agentImageSettings.defaultImageId))
                .where(
                    and(
                        eq(agentImageSettings.id, 1),
                        eq(agentImages.id, input.imageId),
                        eq(agentImages.status, "ready"),
                        isNull(agentImages.deletedAt),
                        sql`${agentImages.dockerImageId} IS NOT NULL`,
                    ),
                )
                .limit(1),
            tx
                .select({ id: users.id })
                .from(users)
                .where(sql`lower(${users.username}) = lower(${input.username})`)
                .limit(1),
        ]);
        if (existingDefault[0])
            throw new CollaborationError("conflict", "The default agent already exists");
        if (!configuredImage[0])
            throw new CollaborationError(
                "conflict",
                "A ready default agent image must be configured before creating the default agent",
            );
        if (usernameConflict[0])
            throw new CollaborationError("conflict", "The default agent username is already taken");

        const id = createId();
        const sequence = await syncSequenceNext(tx);
        await tx.insert(users).values({
            id,
            accountId: null,
            createdByUserId: input.actorUserId,
            kind: "agent",
            agentImageId: input.imageId,
            firstName: input.name,
            username: input.username,
            role: "member",
            agentRole: "default",
            syncSequence: sequence,
        });
        await tx.insert(syncEvents).values({
            sequence,
            kind: "user.created",
            entityId: id,
            actorUserId: input.actorUserId,
        });
        await ensureDefaultAgentChannelsDb(tx, id);
        return {
            id,
            name: input.name,
            username: input.username,
            imageId: input.imageId,
        };
    });
}
