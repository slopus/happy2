import { type SetupSyncHint } from "../types.js";
export function setupHint(sequence: number): SetupSyncHint {
    return {
        sequence: String(sequence),
        chats: [],
        areas: ["setup"],
    };
}
