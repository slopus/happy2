export function encodeCursor(at: string, id: string): string {
    return Buffer.from(
        JSON.stringify({
            at,
            id,
        }),
        "utf8",
    ).toString("base64url");
}
