import { createId } from "@paralleldrive/cuid2";
import { eq, sql } from "drizzle-orm";
import { channelCreate } from "../chat/channelCreate.js";
import type { ChatSummary, MutationHint } from "../chat/types.js";
import { userRequireActive } from "../chat/userRequireActive.js";
import { userServerAdminList } from "../chat/userServerAdminList.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { projects } from "../schema.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { projectRequire } from "./projectRequire.js";
import type { ProjectSummary } from "./types.js";

/**
 * Creates one non-default project and its required first public or private channel as one durable transaction.
 * The project becomes discoverable only with a usable owned channel, and both records share one sync sequence and projects-area reconciliation hint.
 */
export async function projectCreateWithChannel(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        name: string;
        description?: string;
        initialChannel: {
            kind: "public_channel" | "private_channel";
            name: string;
            slug: string;
            topic?: string;
            autoJoin?: boolean;
        };
    },
): Promise<{
    project: ProjectSummary;
    chat: ChatSummary;
    hint: MutationHint;
    privateProjectViewerUserIds: string[];
}> {
    return withTransaction(executor, async (tx) => {
        await userRequireActive(tx, input.actorUserId);
        const projectId = createId();
        await tx.insert(projects).values({
            id: projectId,
            name: input.name,
            description: input.description,
            createdByUserId: input.actorUserId,
        });
        const created = await channelCreate(tx, {
            actorUserId: input.actorUserId,
            projectId,
            ...input.initialChannel,
        });
        const sequence = Number(created.hint.sequence);
        if (!Number.isSafeInteger(sequence)) throw new Error("Channel sync sequence is invalid");
        await tx
            .update(projects)
            .set({ syncSequence: sequence, updatedAt: sql`CURRENT_TIMESTAMP` })
            .where(eq(projects.id, projectId));
        await syncEventInsert(tx, {
            sequence,
            kind: "project.created",
            entityId: projectId,
            actorUserId: input.actorUserId,
            targetUserId:
                input.initialChannel.kind === "private_channel" ? input.actorUserId : undefined,
        });
        const privateProjectViewerUserIds =
            input.initialChannel.kind === "private_channel"
                ? [...new Set([input.actorUserId, ...(await userServerAdminList(tx))])]
                : [];
        return {
            project: await projectRequire(tx, projectId),
            chat: created.chat,
            hint: {
                ...created.hint,
                areas: [...new Set([...created.hint.areas, "projects"])],
            },
            privateProjectViewerUserIds,
        };
    });
}
