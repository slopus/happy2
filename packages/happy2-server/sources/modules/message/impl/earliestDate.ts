export function earliestDate(left: string | null, right: string | null): string | null {
    if (!left) return right;
    if (!right) return left;
    return Date.parse(left) <= Date.parse(right) ? left : right;
}
