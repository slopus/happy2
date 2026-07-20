import * as Y from "yjs";
import { CollaborationError } from "../../chat/types.js";

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

/** Decodes and structurally validates one client-supplied base64 Yjs update. */
export function documentUpdateDecode(value: unknown, name: string, maxBytes: number): Uint8Array {
    if (
        typeof value !== "string" ||
        value.length === 0 ||
        value.length % 4 !== 0 ||
        !BASE64_PATTERN.test(value)
    )
        throw new CollaborationError("invalid", `${name} must be a base64 encoded Yjs update`);
    const bytes = new Uint8Array(Buffer.from(value, "base64"));
    if (bytes.byteLength === 0 || bytes.byteLength > maxBytes)
        throw new CollaborationError("invalid", `${name} must decode to at most ${maxBytes} bytes`);
    try {
        Y.mergeUpdates([bytes]);
    } catch {
        throw new CollaborationError("invalid", `${name} is not a valid Yjs update`);
    }
    return bytes;
}

/** Merges already validated Yjs updates into one base64 blob without reading their content. */
export function documentUpdatesMerge(updates: readonly Uint8Array[]): string {
    return Buffer.from(Y.mergeUpdates([...updates])).toString("base64");
}

/** Decodes a server-stored base64 update that was validated when it was written. */
export function documentStoredUpdateDecode(value: string): Uint8Array {
    return new Uint8Array(Buffer.from(value, "base64"));
}

/** The canonical empty-document update used to seed a new snapshot. */
export function documentEmptyUpdate(): string {
    return Buffer.from(Y.encodeStateAsUpdate(new Y.Doc())).toString("base64");
}
