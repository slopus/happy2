import { IntegrationError } from "../../integrations/types.js";
export function normalizedEventType(value: string): string {
    const normalized = value.trim();
    if (!/^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/.test(normalized))
        throw new IntegrationError("invalid", "Webhook event type is invalid");
    return normalized;
}
