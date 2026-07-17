import { IntegrationError } from "../integrations/types.js";
export function optionalTrimmed(
    value: string | undefined,
    name: string,
    maximum: number,
): string | undefined {
    if (value === undefined) return undefined;
    const normalized = value.trim();
    if (!normalized || normalized.length > maximum)
        throw new IntegrationError("invalid", `${name} must contain 1-${maximum} characters`);
    return normalized;
}
