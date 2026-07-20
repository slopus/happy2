import { type DocumentPresenceSnapshot } from "../realtime/index.js";

/**
 * In-memory, process-local roster of live document participants. Presence is an
 * ephemeral delivery hint with per-entry expiry, never durable state, so a restart
 * simply empties the roster and clients re-announce on their next heartbeat.
 */
export class DocumentPresenceTracker {
    private readonly rosters = new Map<string, Map<string, DocumentPresenceSnapshot>>();

    /**
     * Applies one revision-gated presence announcement. Returns false when a newer
     * revision for the same participant has already been observed.
     */
    update(snapshot: DocumentPresenceSnapshot, now: number): boolean {
        const roster = this.rosters.get(snapshot.documentId) ?? new Map();
        prune(roster, now);
        const key = participantKey(snapshot.userId, snapshot.clientId);
        const existing = roster.get(key);
        if (existing && existing.revision >= snapshot.revision) return false;
        if (snapshot.active) {
            roster.set(key, snapshot);
            this.rosters.set(snapshot.documentId, roster);
        } else {
            roster.delete(key);
            if (roster.size === 0) this.rosters.delete(snapshot.documentId);
            else this.rosters.set(snapshot.documentId, roster);
        }
        return true;
    }

    /** Lists the still-unexpired participants of one document. */
    list(documentId: string, now: number): DocumentPresenceSnapshot[] {
        const roster = this.rosters.get(documentId);
        if (!roster) return [];
        prune(roster, now);
        if (roster.size === 0) this.rosters.delete(documentId);
        return [...roster.values()];
    }

    /** Drops every participant of a deleted document. */
    remove(documentId: string): void {
        this.rosters.delete(documentId);
    }
}

function participantKey(userId: string, clientId: string): string {
    return `${userId}:${clientId}`;
}

function prune(roster: Map<string, DocumentPresenceSnapshot>, now: number): void {
    for (const [key, entry] of roster) {
        if (entry.expiresAt !== undefined && entry.expiresAt <= now) roster.delete(key);
    }
}
