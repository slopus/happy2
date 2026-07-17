import { optionalText } from "./optionalText.js";
export function parseJson(value: unknown): unknown {
    const raw = optionalText(value);
    if (raw === undefined) return undefined;
    try {
        return JSON.parse(raw) as unknown;
    } catch {
        return undefined;
    }
}
