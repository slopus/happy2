import { type StateRuntime, userError } from "../runtime/runtimeState.js";
import type { ChatStore, PortShareAccessTarget, PortShareLeaseStart } from "../chat/chatState.js";

/** Malformed refreshAfter falls back to the documented 15-minute cadence. */
const REFRESH_FALLBACK_MS = 15 * 60_000;
/** A past or near-immediate refreshAfter is clamped up so a lease never hot-loops. */
const REFRESH_MINIMUM_MS = 1_000;

interface Lease {
    readonly chatId: string;
    readonly portShareId: string;
    url: string;
    refreshAfter: string;
    readonly target: PortShareAccessTarget;
    timer?: ReturnType<typeof setTimeout>;
    generation: number;
}

export interface PortShareLeaseContext {
    readonly runtime: StateRuntime;
    chatGet(chatId: string): ChatStore | undefined;
}

/**
 * Owns the client-maintained browser access leases for opened port shares. A
 * lease begins only after the first token issuance, cookie exchange, and
 * navigation succeed (never in the constructor). It reissues a scoped token and
 * re-exchanges it into the originating window's cookie jar at each
 * server-provided `refreshAfter`, keeping the already-open external tab
 * authenticated without navigating it again. Tokens are consumed here and never
 * persisted, displayed, or placed in a snapshot.
 *
 * A lease stops when its external tab is closed, the share leaves the durable
 * active list (disabled/removed/replaced), its chat surface is released,
 * `HappyState` is disposed, or a reissue fails — the last case surfaces a
 * displayable error on the chat surface if it still exists. Membership is only
 * ever checked by the server at token issuance; this coordinator adds none.
 */
export class PortShareLeaseCoordinator {
    private readonly leases = new Map<string, Lease>();

    constructor(private readonly context: PortShareLeaseContext) {}

    /** Begins (or replaces) the refresh lease for one opened share. */
    start(input: PortShareLeaseStart): void {
        const key = leaseKey(input.chatId, input.portShareId);
        this.cancel(key);
        const lease: Lease = {
            chatId: input.chatId,
            portShareId: input.portShareId,
            url: input.url,
            refreshAfter: input.refreshAfter,
            target: input.target,
            generation: 0,
        };
        this.leases.set(key, lease);
        this.schedule(lease);
    }

    /** Stops the exact lease for one share the moment its disable is confirmed by the server. */
    stopForShare(chatId: string, portShareId: string): void {
        this.cancel(leaseKey(chatId, portShareId));
    }

    /** Stops leases for shares of `chatId` no longer present in the durable active id set. */
    reconcile(chatId: string, activeIds: ReadonlySet<string>): void {
        this.cancelWhere((lease) => lease.chatId === chatId && !activeIds.has(lease.portShareId));
    }

    /** Stops every lease belonging to a chat whose surface lifetime has ended. */
    stopForChat(chatId: string): void {
        this.cancelWhere((lease) => lease.chatId === chatId);
    }

    /** Stops every lease and clears every timer when the owning state is disposed. */
    dispose(): void {
        this.cancelWhere(() => true);
    }

    private schedule(lease: Lease): void {
        const generation = (lease.generation += 1);
        lease.timer = setTimeout(() => void this.refresh(lease, generation), this.delayMs(lease));
    }

    private async refresh(lease: Lease, generation: number): Promise<void> {
        const key = leaseKey(lease.chatId, lease.portShareId);
        if (this.leases.get(key) !== lease || lease.generation !== generation) return;
        if (lease.target.closed || !this.context.runtime.active) {
            this.cancel(key);
            return;
        }
        try {
            const access = await this.context.runtime.operation("createPortShareAccessToken", {
                portShareId: lease.portShareId,
            });
            if (this.leases.get(key) !== lease || lease.generation !== generation) return;
            if (lease.target.closed) {
                this.cancel(key);
                return;
            }
            await lease.target.exchange(access.portShare.url, access.token);
            if (this.leases.get(key) !== lease || lease.generation !== generation) return;
            lease.url = access.portShare.url;
            lease.refreshAfter = access.refreshAfter;
            this.schedule(lease);
        } catch (error) {
            if (this.leases.get(key) !== lease) return;
            this.cancel(key);
            this.context
                .chatGet(lease.chatId)
                ?.getState()
                .chatInput({
                    type: "portShareLeaseFailed",
                    portShareId: lease.portShareId,
                    error: userError(error),
                });
        }
    }

    /** Cancels every lease matching the predicate, collecting keys first so the map is not mutated mid-iteration. */
    private cancelWhere(match: (lease: Lease) => boolean): void {
        const keys: string[] = [];
        for (const [key, lease] of this.leases) if (match(lease)) keys.push(key);
        for (const key of keys) this.cancel(key);
    }

    private cancel(key: string): void {
        const lease = this.leases.get(key);
        if (!lease) return;
        if (lease.timer) clearTimeout(lease.timer);
        // Invalidate any in-flight async continuation of the cancelled lease.
        lease.generation += 1;
        this.leases.delete(key);
    }

    private delayMs(lease: Lease): number {
        const at = Date.parse(lease.refreshAfter);
        if (!Number.isFinite(at)) return REFRESH_FALLBACK_MS;
        return Math.max(REFRESH_MINIMUM_MS, at - this.context.runtime.now());
    }
}

function leaseKey(chatId: string, portShareId: string): string {
    // NUL cannot appear in either identifier, so the composite key is collision-free.
    return `${chatId}\u0000${portShareId}`;
}
