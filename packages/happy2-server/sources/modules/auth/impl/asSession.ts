import { type ActiveSession } from "../types.js";
export function asSession(row: {
    id: string;
    accountId: string;
    expiresAt: string;
}): ActiveSession {
    return {
        id: row.id,
        accountId: row.accountId,
        expiresAt: new Date(row.expiresAt),
    };
}
