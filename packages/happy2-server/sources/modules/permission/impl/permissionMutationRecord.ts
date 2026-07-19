import type { DrizzleTransaction } from "../../drizzle.js";
import { areaHint } from "../../chat/areaHint.js";
import { syncEventInsert } from "../../sync/syncEventInsert.js";
import { syncSequenceNext } from "../../sync/syncSequenceNext.js";
import type { PermissionMutation } from "../types.js";

export async function permissionMutationRecord(
    tx: DrizzleTransaction,
    input: {
        actorUserId: string;
        affectedUserIds: readonly string[];
        broadcast: boolean;
        entityId: string;
        kind: string;
    },
): Promise<PermissionMutation> {
    const sequence = await syncSequenceNext(tx);
    const affectedUserIds = [...new Set(input.affectedUserIds)];
    if (input.broadcast)
        await syncEventInsert(tx, {
            sequence,
            kind: input.kind,
            entityId: input.entityId,
            actorUserId: input.actorUserId,
        });
    if (!input.broadcast && affectedUserIds.length === 0) affectedUserIds.push(input.actorUserId);
    if (!input.broadcast)
        for (const targetUserId of affectedUserIds)
            await syncEventInsert(tx, {
                sequence,
                kind: input.kind,
                entityId: input.entityId,
                actorUserId: input.actorUserId,
                targetUserId,
            });
    return {
        affectedUserIds,
        broadcast: input.broadcast,
        sync: areaHint(sequence, "permissions") as PermissionMutation["sync"],
    };
}
