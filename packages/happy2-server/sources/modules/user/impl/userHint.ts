import { type SetupSyncHint } from "../../setup/types.js";
export function userHint(sequence: number): SetupSyncHint {
    return {
        sequence: String(sequence),
        chats: [],
        areas: ["user-onboarding"],
    };
}
