import { IntegrationError } from "../../integrations/types.js";
export function requiredText(value: string, name: string, maximum: number): string {
    if (!value.trim() || value.length > maximum)
        throw new IntegrationError("invalid", `${name} must contain 1-${maximum} characters`);
    return value;
}
