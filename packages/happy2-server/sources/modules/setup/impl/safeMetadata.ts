import { type SafeSetupMetadata, type SafeSetupMetadataValue } from "../types.js";

export function safeMetadata(encoded: string | null | undefined): SafeSetupMetadata | undefined {
    if (!encoded) return undefined;
    try {
        const parsed = JSON.parse(encoded) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
        const result: Record<string, SafeSetupMetadataValue> = {};
        for (const [key, value] of Object.entries(parsed)) {
            if (!/^[a-z][a-zA-Z0-9]{0,63}$/.test(key)) continue;
            if (
                value === null ||
                typeof value === "string" ||
                typeof value === "number" ||
                typeof value === "boolean"
            )
                result[key] = value;
        }
        return Object.keys(result).length > 0 ? result : undefined;
    } catch {
        return undefined;
    }
}
