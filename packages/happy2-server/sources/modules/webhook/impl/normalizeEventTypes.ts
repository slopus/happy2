import { IntegrationError } from "../../integrations/types.js";
import { normalizedEventType } from "./normalizedEventType.js";
export function normalizeEventTypes(values: readonly string[]): string[] {
    if (values.length === 0 || values.length > 50)
        throw new IntegrationError("invalid", "Outgoing webhook requires 1-50 event types");
    return [...new Set(values.map(normalizedEventType))].sort();
}
