import type { MutationHint } from "../../chat/types.js";

export function baseImageSyncHint(sequence: number): MutationHint {
    return {
        sequence: String(sequence),
        chats: [],
        areas: ["setup", "agent-images"],
    };
}
