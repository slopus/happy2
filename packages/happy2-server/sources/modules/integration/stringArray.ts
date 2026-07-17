import { text } from "./text.js";
export function stringArray(value: unknown): string[] {
    const parsed = JSON.parse(text(value)) as unknown;
    if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== "string"))
        throw new Error("Expected JSON string array");
    return parsed;
}
