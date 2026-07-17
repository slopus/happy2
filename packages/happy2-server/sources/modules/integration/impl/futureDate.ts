import { IntegrationError } from "../../integrations/types.js";
export function futureDate(value: string, now: Date): string {
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp) || timestamp <= now.getTime())
        throw new IntegrationError("invalid", "Credential expiry must be in the future");
    return new Date(timestamp).toISOString();
}
