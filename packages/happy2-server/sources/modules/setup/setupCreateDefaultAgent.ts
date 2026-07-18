import { and, eq, isNull, sql } from "drizzle-orm";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { serverSetupSteps, syncEvents, users } from "../schema.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { agentDefaultCreate } from "../agent/agentDefaultCreate.js";
import { agentImageGetReadyDefault } from "../agent/agentImageGetReadyDefault.js";
import { baseImageSelectedId } from "./impl/baseImageSelectedId.js";
import { encodedMetadata } from "./impl/encodedMetadata.js";
import { requireActiveAdministratorDb } from "./impl/requireActiveAdministratorDb.js";
import { requirePrerequisitesDb } from "./impl/requirePrerequisitesDb.js";
import { serverStepDb } from "./impl/serverStepDb.js";
import { setupHint } from "./impl/setupHint.js";
import { SetupError, type SetupSyncHint } from "./types.js";

/**
 * Creates the one server default agent with the administrator-selected name and username after sandbox validation and a ready default image.
 * The user identity, default channel memberships, per-human default-agent conversations, serverSetupSteps completion, and sync history commit atomically so setup can never expose a partial main agent.
 */
export async function setupCreateDefaultAgent(
    executor: DrizzleExecutor,
    input: { actorUserId: string; name: string; username: string },
): Promise<{
    agent: { id: string; name: string; username: string; imageId: string };
    hint?: SetupSyncHint;
}> {
    const name = input.name.trim();
    const username = input.username.trim().toLowerCase();
    if (!name || name.length > 100)
        throw new SetupError("invalid", "name must contain 1-100 characters");
    if (!/^[a-z0-9][a-z0-9_-]{2,31}$/.test(username))
        throw new SetupError(
            "invalid",
            "username must contain 3-32 lowercase letters, digits, underscores, or hyphens",
        );

    return withTransaction(executor, async (tx) => {
        await requireActiveAdministratorDb(tx, input.actorUserId);
        await requirePrerequisitesDb(tx, "default_agent_created");
        const step = await serverStepDb(tx, "default_agent_created");
        const [existingDefault] = await tx
            .select({
                id: users.id,
                name: users.firstName,
                username: users.username,
                imageId: users.agentImageId,
            })
            .from(users)
            .where(
                and(
                    eq(users.agentRole, "default"),
                    eq(users.kind, "agent"),
                    isNull(users.deletedAt),
                ),
            )
            .limit(1);
        if (step.state === "complete") {
            if (
                existingDefault?.name === name &&
                existingDefault.username === username &&
                existingDefault.imageId
            )
                return {
                    agent: {
                        id: existingDefault.id,
                        name,
                        username,
                        imageId: existingDefault.imageId,
                    },
                };
            throw new SetupError("conflict", "The default agent was already created");
        }
        if (existingDefault)
            throw new SetupError(
                "conflict",
                "A default agent exists without a completed onboarding step",
            );

        const [selectedImage, readyImage, readyDefault] = await Promise.all([
            serverStepDb(tx, "base_image_selected"),
            serverStepDb(tx, "base_image_ready"),
            agentImageGetReadyDefault(tx),
        ]);
        const selectedImageId = baseImageSelectedId(selectedImage.metadataJson);
        const readyImageId = baseImageSelectedId(readyImage.metadataJson);
        if (
            !selectedImageId ||
            readyImageId !== selectedImageId ||
            readyDefault?.id !== selectedImageId
        )
            throw new SetupError(
                "conflict",
                "The selected base image must be ready and promoted as the default before creating the default agent",
            );
        const agent = await agentDefaultCreate(tx, {
            actorUserId: input.actorUserId,
            imageId: selectedImageId,
            name,
            username,
        });

        const now = new Date().toISOString();
        await tx
            .update(serverSetupSteps)
            .set({
                state: "complete",
                metadataJson: encodedMetadata({ agentUserId: agent.id }),
                lastError: null,
                startedAt: sql`coalesce(${serverSetupSteps.startedAt}, ${now})`,
                completedAt: now,
                updatedAt: now,
            })
            .where(eq(serverSetupSteps.step, "default_agent_created"));
        const setupSequence = await syncSequenceNext(tx);
        await tx.insert(syncEvents).values({
            sequence: setupSequence,
            kind: "setup.default_agent_created.complete",
            entityId: "default_agent_created",
            actorUserId: input.actorUserId,
        });
        return {
            agent,
            hint: setupHint(setupSequence),
        };
    });
}
