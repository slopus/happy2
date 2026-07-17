export function normalizeSearch(value: string): string {
    return value.normalize("NFKC").trim().toLocaleLowerCase();
}
