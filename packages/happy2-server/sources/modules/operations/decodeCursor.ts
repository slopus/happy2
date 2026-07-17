import { type Cursor } from "./impl/cursor.js";
import { OperationsError } from "./types.js";
export function decodeCursor(value: string | undefined): Cursor | undefined {
    if (!value) return undefined;
    if (value.length > 1_024) throw new OperationsError("invalid", "Cursor is invalid");
    try {
        const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<
            string,
            unknown
        >;
        if (
            typeof parsed.at !== "string" ||
            typeof parsed.id !== "string" ||
            parsed.at.length > 64 ||
            parsed.id.length > 128
        )
            throw new Error("bad cursor");
        return {
            at: parsed.at,
            id: parsed.id,
        };
    } catch {
        throw new OperationsError("invalid", "Cursor is invalid");
    }
}
