import { IntegrationError } from "../../integrations/types.js";
export function positiveLimit(value: number, maximum: number): number {
    if (!Number.isSafeInteger(value) || value <= 0 || value > maximum)
        throw new IntegrationError("invalid", `Value must be between 1 and ${maximum}`);
    return value;
}
