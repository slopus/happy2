import { CollaborationError } from "../chat/types.js";
import { type DrizzleExecutor } from "../drizzle.js";
import { documentRowGet } from "./impl/documentRowGet.js";

/**
 * Reports whether the actor may read a document as its owner or as a member of any
 * attached channel, without mutating durable state or exposing which attachment granted
 * access. This boolean boundary lets realtime delivery preserve the same non-probeable
 * authorization rule as document HTTP actions.
 */
export async function documentCanAccess(
    executor: DrizzleExecutor,
    actorUserId: string,
    documentId: string,
): Promise<boolean> {
    try {
        await documentRowGet(executor, actorUserId, documentId, "read");
        return true;
    } catch (error) {
        if (error instanceof CollaborationError && error.code === "not_found") return false;
        throw error;
    }
}
