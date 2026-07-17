import { IntegrationError } from "../../integrations/types.js";
export function boundedIdentifier(value: string, name: string): void {
    if (!value || value.length > 256 || value.trim() !== value)
        throw new IntegrationError("invalid", `${name} is invalid`);
}
