import { createHash } from "node:crypto";
export function retryDelay(deliveryId: string, attempts: number): number {
    const base = Math.min(60 * 60_000, 1_000 * 2 ** Math.max(0, attempts - 1));
    const digest = createHash("sha256").update(`${deliveryId}:${attempts}`).digest();
    const jitter = 0.8 + (digest.readUInt16BE(0) / 65_535) * 0.4;
    return Math.round(base * jitter);
}
