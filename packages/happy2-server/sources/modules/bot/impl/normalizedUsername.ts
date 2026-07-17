import { IntegrationError } from "../../integrations/types.js";
export function normalizedUsername(value: string): string {
    const normalized = value.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_.-]{1,31}$/.test(normalized))
        throw new IntegrationError("invalid", "Bot username must contain 2-32 safe characters");
    return normalized;
}
