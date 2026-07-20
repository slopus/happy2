import { CollaborationError } from "../chat/types.js";
import { type DrizzleExecutor } from "../drizzle.js";
import {
    DEFAULT_REALTIME_LIMITS,
    type DocumentPresenceSnapshot,
} from "../realtime/index.js";
import { documentRowGet } from "./impl/documentRowGet.js";
import { type DocumentPresenceTracker } from "./presenceTracker.js";
import { DOCUMENT_PRESENCE_DEFAULT_TTL_MS } from "./types.js";

/**
 * Applies one revision-gated, TTL-bounded presence announcement for a document the actor
 * can read, updating only the in-memory roster; presence is an ephemeral delivery hint
 * and never durable state. Returns the owning chat and the resulting roster so the route
 * can broadcast the accepted announcement and the caller can reconcile immediately.
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
    chatId: string;
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
        chatId: row.chatId,
        accepted,
        snapshot,
        presence: tracker.list(input.documentId, now),
    };
}
