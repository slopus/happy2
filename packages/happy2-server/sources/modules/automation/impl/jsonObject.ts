export function jsonObject(value: string): Record<string, unknown> {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw new Error("Expected JSON object");
    return parsed as Record<string, unknown>;
}
