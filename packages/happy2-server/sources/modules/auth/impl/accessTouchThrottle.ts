/**
 * Builds an advisory per-process throttle for best-effort access telemetry.
 * Durable minute guards remain authoritative; this cache only avoids redundant SQLite write locks.
 */
export function accessTouchThrottle(
    intervalMs = 60_000,
    maximumEntries = 10_000,
): (sessionId: string | undefined, userId: string, now?: number) => boolean {
    const touches = new Map<string, number>();
    return (sessionId, userId, now = Date.now()) => {
        const key = sessionId ?? `external:${userId}`;
        if (now - (touches.get(key) ?? 0) < intervalMs) return false;
        touches.set(key, now);
        if (touches.size > maximumEntries) touches.delete(touches.keys().next().value!);
        return true;
    };
}
