import { IntegrationError } from "../../integrations/types.js";
export function optionalTextBody(
    value: string | undefined,
    name: string,
    maximum: number,
): string | undefined {
    if (value === undefined) return undefined;
    if (value.length > maximum)
        throw new IntegrationError("invalid", `${name} must contain at most ${maximum} characters`);
    return value;
}
