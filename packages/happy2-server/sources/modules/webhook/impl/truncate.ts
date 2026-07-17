export function truncate(value: string | undefined, maximum: number): string | undefined {
    return value === undefined ? undefined : value.slice(0, maximum);
}
