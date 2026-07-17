import { type MutationHint } from "./types.js";
export function areaHint(sequence: number, area: string): MutationHint {
    return {
        sequence: String(sequence),
        chats: [],
        areas: [area],
    };
}
