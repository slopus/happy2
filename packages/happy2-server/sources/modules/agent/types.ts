/** Durable checkpoint used to resume and periodically trim Rig's global event stream. */
export interface RigEventCheckpoint {
    cursor?: number;
    eventsSinceTrim: number;
    lastTrimmedAt: string;
    trimmedThrough?: number;
}
