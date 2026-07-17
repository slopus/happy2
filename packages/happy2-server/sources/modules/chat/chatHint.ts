import { type MutationHint } from "./types.js";
export function chatHint(sequence: number, chatId: string, pts: number): MutationHint {
    return {
        sequence: String(sequence),
        chats: [
            {
                chatId,
                pts: String(pts),
            },
        ],
        areas: [],
    };
}
