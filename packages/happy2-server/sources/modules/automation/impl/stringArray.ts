import { CollaborationError } from "../../chat/types.js";
export function stringArray(value: unknown): string[] {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string"))
        throw new CollaborationError("invalid", "attachmentFileIds must be an array of ids");
    return [...new Set(value as string[])];
}
