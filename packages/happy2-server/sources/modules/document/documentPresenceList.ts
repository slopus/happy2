import { type DrizzleExecutor } from "../drizzle.js";
import { type DocumentPresenceSnapshot } from "../realtime/index.js";
import { documentRowGet } from "./impl/documentRowGet.js";
import { type DocumentPresenceTracker } from "./presenceTracker.js";

/**
 * Lists still-unexpired participants for the owner or a member of any attached channel;
 * denied callers receive `not_found` so attachment is not probeable. The roster is
 * ephemeral state used to seed an editor before realtime takes over, with no durable write.
 */
export async function documentPresenceList(
    executor: DrizzleExecutor,
    tracker: DocumentPresenceTracker,
    actorUserId: string,
    documentId: string,
): Promise<DocumentPresenceSnapshot[]> {
    await documentRowGet(executor, actorUserId, documentId, "read");
    return tracker.list(documentId, Date.now());
}
