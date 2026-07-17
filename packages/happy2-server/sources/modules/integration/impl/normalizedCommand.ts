import { IntegrationError } from "../../integrations/types.js";
export function normalizedCommand(value: string): string {
    const normalized = value.trim().toLowerCase();
    if (!/^\/[a-z0-9][a-z0-9_-]{0,63}$/.test(normalized))
        throw new IntegrationError("invalid", "Slash command is invalid");
    return normalized;
}
