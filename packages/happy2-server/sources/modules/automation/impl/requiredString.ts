import { CollaborationError } from "../../chat/types.js";
export function requiredString(value: unknown, name: string): string {
    if (typeof value !== "string" || value.length === 0)
        throw new CollaborationError("invalid", `${name} is required`);
    return value;
}
