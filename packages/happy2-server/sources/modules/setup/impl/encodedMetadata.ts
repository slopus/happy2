import { type SafeSetupMetadata, SetupError } from "../types.js";

export function encodedMetadata(metadata: SafeSetupMetadata | undefined): string | null {
    if (!metadata) return null;
    const entries = Object.entries(metadata);
    if (entries.length > 32) throw new SetupError("invalid", "Setup metadata has too many fields");
    for (const [key, value] of entries) {
        if (!/^[a-z][a-zA-Z0-9]{0,63}$/.test(key))
            throw new SetupError("invalid", "Setup metadata contains an invalid field name");
        if (
            value !== null &&
            typeof value !== "string" &&
            typeof value !== "number" &&
            typeof value !== "boolean"
        )
            throw new SetupError("invalid", "Setup metadata contains an invalid value");
    }
    const encoded = JSON.stringify(metadata);
    if (Buffer.byteLength(encoded) > 4_096)
        throw new SetupError("invalid", "Setup metadata exceeds 4096 bytes");
    return encoded;
}
