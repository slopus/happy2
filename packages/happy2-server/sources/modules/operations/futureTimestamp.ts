import { OperationsError } from "./types.js";
export function futureTimestamp(value: string | undefined, name: string): string | undefined {
    if (value === undefined) return undefined;
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp) || timestamp <= Date.now())
        throw new OperationsError("invalid", `${name} must be a future ISO timestamp`);
    return new Date(timestamp).toISOString();
}
