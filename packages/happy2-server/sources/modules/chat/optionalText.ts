import { text } from "./text.js";
export function optionalText(value: unknown): string | undefined {
    return value === null || value === undefined ? undefined : text(value);
}
