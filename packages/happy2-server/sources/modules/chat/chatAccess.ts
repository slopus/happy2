import { type ChatRole, type ChatSummary } from "./types.js";
export type ChatAccess = ChatSummary & {
    isServerAdmin: boolean;
    isRecoverableMember: boolean;
    recoverableMembershipRole?: ChatRole;
};
