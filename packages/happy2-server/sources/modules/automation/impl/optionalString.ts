import { CollaborationError } from "../../chat/types.js";
export function optionalString(value: unknown): string | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== "string")
        throw new CollaborationError("invalid", "Automation action value must be a string");
    return value;
}
