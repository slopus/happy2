import { areaHint } from "../../chat/areaHint.js";
import type { MutationHint } from "../../chat/types.js";
import type { DrizzleTransaction } from "../../drizzle.js";
import { syncEventInsert } from "../../sync/syncEventInsert.js";
import { syncSequenceNext } from "../../sync/syncSequenceNext.js";

export async function pluginSurfaceMutationRecord(
    tx: DrizzleTransaction,
    input: {
        area: "apps" | "contributions";
        kind: string;
        entityId: string;
        actorUserId?: string;
        targetUserId?: string;
        chatId?: string;
    },
): Promise<{ hint: MutationHint; sequence: number }> {
    const sequence = await syncSequenceNext(tx);
    await syncEventInsert(tx, {
        sequence,
        kind: input.kind,
        entityId: input.entityId,
        actorUserId: input.actorUserId,
        targetUserId: input.targetUserId,
        chatId: input.chatId,
    });
    return { sequence, hint: areaHint(sequence, input.area) };
}
