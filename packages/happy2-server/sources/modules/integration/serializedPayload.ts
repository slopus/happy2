import { IntegrationError } from "../integrations/types.js";
import { MAX_EVENT_PAYLOAD } from "./impl/maxEventPayload.js";
export function serializedPayload(value: Record<string, unknown>): string {
    let serialized: string;
    try {
        serialized = JSON.stringify(value);
    } catch {
        throw new IntegrationError("invalid", "Webhook payload must be JSON serializable");
    }
    if (Buffer.byteLength(serialized, "utf8") > MAX_EVENT_PAYLOAD)
        throw new IntegrationError("invalid", "Webhook payload is too large");
    return serialized;
}
