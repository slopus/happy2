import { type Account } from "../types.js";
import { type AccountRow } from "./accountRow.js";
export function asAccount(row: AccountRow): Account {
    return {
        id: row.id,
        email: row.email,
        passwordHash: row.passwordHash,
        active: row.active === 1,
        bannedAt: row.bannedAt ?? undefined,
        deletedAt: row.deletedAt ?? undefined,
    };
}
