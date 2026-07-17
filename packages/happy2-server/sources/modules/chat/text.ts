export function text(value: unknown, fallback?: string): string {
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "bigint") return String(value);
    if (fallback !== undefined) return fallback;
    throw new Error("Expected database text value");
}
