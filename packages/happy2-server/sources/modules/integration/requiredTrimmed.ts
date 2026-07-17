import { IntegrationError } from "../integrations/types.js";
export function requiredTrimmed(value: string, name: string, maximum: number): string {
    const normalized = value.trim();
    if (!normalized || normalized.length > maximum)
        throw new IntegrationError("invalid", `${name} must contain 1-${maximum} characters`);
    return normalized;
}
