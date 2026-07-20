import { CollaborationError } from "../../chat/types.js";
import {
    MAX_DOCUMENT_BATCH_BYTES,
    MAX_DOCUMENT_UPDATE_BATCH,
    MAX_DOCUMENT_UPDATE_BYTES,
} from "../types.js";
import { documentUpdateDecode } from "./updateCodec.js";

export function documentUpdatesValidate(updates: readonly unknown[]): readonly string[] {
    if (
        !Array.isArray(updates) ||
        updates.length === 0 ||
        updates.length > MAX_DOCUMENT_UPDATE_BATCH
    )
        throw new CollaborationError(
            "invalid",
            `updates must contain between 1 and ${MAX_DOCUMENT_UPDATE_BATCH} entries`,
        );
    const normalized = updates.map((update, index) => {
        documentUpdateDecode(update, `updates[${index}]`, MAX_DOCUMENT_UPDATE_BYTES);
        return update as string;
    });
    const totalBytes = normalized.reduce(
        (total, update) => total + Buffer.from(update, "base64").byteLength,
        0,
    );
    if (totalBytes > MAX_DOCUMENT_BATCH_BYTES)
        throw new CollaborationError(
            "invalid",
            `updates must decode to at most ${MAX_DOCUMENT_BATCH_BYTES} bytes in total`,
        );
    return normalized;
}
