export function messageIsPast(value: string | undefined): boolean {
    return value ? Date.parse(value) <= Date.now() : false;
}
