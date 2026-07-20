import { type DrizzleExecutor } from "../drizzle.js";
import { type DocumentPresenceSnapshot } from "../realtime/index.js";
import { documentRowGet } from "./impl/documentRowGet.js";
import { type DocumentPresenceTracker } from "./presenceTracker.js";

/**
 * Lists the still-unexpired live participants of one document the actor can read.
 * The roster is ephemeral in-memory state used to seed a joining editor before realtime
 * presence events take over; nothing durable is read beyond the access check.
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
