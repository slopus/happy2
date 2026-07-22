import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import {
    channelOwnershipRepairForUserDeactivationDb,
    type DeactivationOwnershipRepair,
} from "./impl/channelOwnershipRepairForUserDeactivationDb.js";

/**
 * Repairs every live channel with legacy ownership immediately before a human becomes inactive or deleted.
 * Private channels receive deterministic active-human succession or the requested orphan policy; public channels only clear ownership and demote legacy owners to administrators, all within the caller's sequence and transaction.
 */
export async function moderationRepairChannelOwnershipForUserDeactivation(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        orphanPolicy: "clear" | "delete";
        sequence: number;
        userId: string;
    },
): Promise<DeactivationOwnershipRepair[]> {
    return withTransaction(executor, (tx) =>
        channelOwnershipRepairForUserDeactivationDb(tx, input),
    );
}
