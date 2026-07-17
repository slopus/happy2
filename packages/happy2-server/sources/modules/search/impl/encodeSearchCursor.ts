export function encodeSearchCursor(query: string, offset: number): string {
    return Buffer.from(
        JSON.stringify({
            query,
            offset,
        }),
        "utf8",
    ).toString("base64url");
}
