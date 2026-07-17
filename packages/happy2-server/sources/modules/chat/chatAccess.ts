import { type ChatSummary } from "./types.js";
export type ChatAccess = ChatSummary & {
    isServerAdmin: boolean;
};
