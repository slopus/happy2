import { CollaborationError } from "../../chat/types.js";
export function optionalObject(value: unknown): Record<string, unknown> | undefined {
    if (value === undefined) return undefined;
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new CollaborationError("invalid", "Automation metadata must be an object");
    return value as Record<string, unknown>;
}
