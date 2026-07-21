import { PortShareError } from "../modules/port-share/types.js";

/** Validates one origin-relative preview path carried through the main-host authorization bounce. */
export function portShareReturnTo(value: unknown): string {
    if (
        typeof value !== "string" ||
        !value.startsWith("/") ||
        value.startsWith("//") ||
        value.length > 4_096
    )
        throw new PortShareError("invalid", "returnTo must be an origin-relative preview path");
    for (const character of value) {
        const code = character.codePointAt(0)!;
        if (character === "\\" || code < 0x20 || code === 0x7f)
            throw new PortShareError("invalid", "returnTo must be an origin-relative preview path");
    }
    return value;
}
