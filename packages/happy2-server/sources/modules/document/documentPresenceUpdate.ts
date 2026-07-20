import { CollaborationError } from "../chat/types.js";
import { type DrizzleExecutor } from "../drizzle.js";
import { DEFAULT_REALTIME_LIMITS, type DocumentPresenceSnapshot } from "../realtime/index.js";
import { documentAudienceGet } from "./impl/documentAudienceGet.js";
import { documentRowGet } from "./impl/documentRowGet.js";
import { type DocumentPresenceTracker } from "./presenceTracker.js";
import { DOCUMENT_PRESENCE_DEFAULT_TTL_MS, type DocumentRealtimeAudience } from "./types.js";

/**
 * Applies one revision-gated, TTL-bounded presence announcement for the owner or a member
 * of any attached channel, with `not_found` denial so attachment is not probeable. Only
 * the in-memory roster changes; the returned durable audience lets the route fan out the
 * ephemeral hint to every attached channel and to an unattached owner without persisting presence.
 */
export async function documentPresenceUpdate(
    executor: DrizzleExecutor,
    tracker: DocumentPresenceTracker,
    input: {
        actorUserId: string;
        documentId: string;
        clientId: string;
        revision: number;
        active: boolean;
        state?: unknown;
        ttlMs?: number;
    },
): Promise<{
    audience: DocumentRealtimeAudience;
    accepted: boolean;
    snapshot: DocumentPresenceSnapshot;
    presence: DocumentPresenceSnapshot[];
}> {
    const maxTtl = DEFAULT_REALTIME_LIMITS.maxDocumentPresenceTtlMs;
    const ttlMs = input.ttlMs ?? DOCUMENT_PRESENCE_DEFAULT_TTL_MS;
    if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0 || ttlMs > maxTtl)
        throw new CollaborationError("invalid", `ttlMs must be between 1 and ${maxTtl}`);
    if (input.state !== undefined) {
        const maxStateBytes = DEFAULT_REALTIME_LIMITS.maxDocumentPresenceStateBytes;
        let encoded: string | undefined;
        try {
            encoded = JSON.stringify(input.state);
        } catch {
            throw new CollaborationError("invalid", "state must be JSON serializable");
        }
        if (encoded === undefined || Buffer.byteLength(encoded) > maxStateBytes)
            throw new CollaborationError(
                "invalid",
                `state must serialize to at most ${maxStateBytes} bytes`,
            );
    }
    const row = await documentRowGet(executor, input.actorUserId, input.documentId, "read");
    const now = Date.now();
    const snapshot: DocumentPresenceSnapshot = {
        documentId: input.documentId,
        userId: input.actorUserId,
        clientId: input.clientId,
        revision: input.revision,
        active: input.active,
        ...(input.state === undefined ? {} : { state: input.state }),
        ...(input.active ? { expiresAt: now + ttlMs } : {}),
    };
    const accepted = tracker.update(snapshot, now);
    return {
        audience: await documentAudienceGet(executor, row),
        accepted,
        snapshot,
        presence: tracker.list(input.documentId, now),
    };
}
