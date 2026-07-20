import { randomInt } from "node:crypto";
import { createId } from "@paralleldrive/cuid2";
import { and, eq, isNull } from "drizzle-orm";
import { chatAdvanceWithSequence } from "../chat/chatAdvanceWithSequence.js";
import { chatGetAccess } from "../chat/chatGetAccess.js";
import { chatHint } from "../chat/chatHint.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { agentRigBindings, portShares, users } from "../schema.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { asPortShare } from "./impl/asPortShare.js";
import { portShareSelection } from "./impl/portShareSelection.js";
import { PortShareError, type PortShareContainerPort, type PortShareMutation } from "./types.js";

const RANDOM_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/**
 * Creates the chat's one active portShares row for the exact current agent container binding and announces it through the chat sync stream.
 * Binding the durable hostname before publication prevents a plugin call from selecting another chat or an obsolete container.
 */
export async function portShareCreate(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        agentUserId: string;
        chatId: string;
        containerPort: PortShareContainerPort;
        name: string;
    },
): Promise<PortShareMutation> {
    return withTransaction(executor, async (tx) => {
        if (!(await chatGetAccess(tx, input.actorUserId, input.chatId, true)))
            throw new PortShareError("not_found", "Chat was not found");
        const [binding] = await tx
            .select({ containerName: agentRigBindings.containerName })
            .from(agentRigBindings)
            .innerJoin(users, eq(users.id, agentRigBindings.userId))
            .where(
                and(
                    eq(agentRigBindings.userId, input.agentUserId),
                    eq(agentRigBindings.chatId, input.chatId),
                    eq(users.kind, "agent"),
                    isNull(users.deletedAt),
                ),
            )
            .limit(1);
        if (!binding)
            throw new PortShareError("not_ready", "The chat agent container is not ready");
        const [existing] = await tx
            .select({ id: portShares.id, containerName: portShares.containerName })
            .from(portShares)
            .where(and(eq(portShares.chatId, input.chatId), isNull(portShares.disabledAt)))
            .limit(1);
        if (existing?.containerName === binding.containerName)
            throw new PortShareError("conflict", "The chat already has an active port share");
        if (existing)
            await tx
                .update(portShares)
                .set({ disabledAt: new Date().toISOString(), disabledByUserId: input.actorUserId })
                .where(eq(portShares.id, existing.id));

        const id = createId();
        const createdAt = new Date().toISOString();
        let inserted = false;
        let subdomain = "";
        for (let attempt = 0; attempt < 8 && !inserted; attempt += 1) {
            subdomain = `${friendlySlug(input.name)}-${randomSuffix()}`;
            const rows = await tx
                .insert(portShares)
                .values({
                    id,
                    chatId: input.chatId,
                    agentUserId: input.agentUserId,
                    containerName: binding.containerName,
                    containerPort: input.containerPort,
                    name: input.name,
                    subdomain,
                    createdByUserId: input.actorUserId,
                    createdAt,
                })
                .onConflictDoNothing()
                .returning({ id: portShares.id });
            inserted = rows.length === 1;
            if (!inserted) {
                const [raced] = await tx
                    .select({ id: portShares.id })
                    .from(portShares)
                    .where(and(eq(portShares.chatId, input.chatId), isNull(portShares.disabledAt)))
                    .limit(1);
                if (raced)
                    throw new PortShareError(
                        "conflict",
                        "The chat already has an active port share",
                    );
            }
        }
        if (!inserted)
            throw new PortShareError("conflict", "Could not allocate a unique port-share hostname");

        const sequence = await syncSequenceNext(tx);
        const mutation = await chatAdvanceWithSequence(
            tx,
            sequence,
            input.actorUserId,
            input.chatId,
            "portShare.created",
            id,
        );
        const [row] = await tx
            .select(portShareSelection)
            .from(portShares)
            .where(eq(portShares.id, id))
            .limit(1);
        if (!row) throw new Error("Created port share could not be loaded");
        return {
            portShare: asPortShare(row),
            hint: chatHint(sequence, input.chatId, mutation.pts),
        };
    });
}

function friendlySlug(name: string): string {
    const slug = name
        .normalize("NFKD")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 56)
        .replace(/-+$/g, "");
    return slug || "preview";
}

function randomSuffix(): string {
    let result = "";
    for (let index = 0; index < 6; index += 1)
        result += RANDOM_ALPHABET[randomInt(RANDOM_ALPHABET.length)];
    return result;
}
