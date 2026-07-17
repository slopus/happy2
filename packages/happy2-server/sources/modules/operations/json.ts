export function json(value: unknown): string | null {
    return value === undefined ? null : JSON.stringify(value);
}
