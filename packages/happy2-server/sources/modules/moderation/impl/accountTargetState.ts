import { type AccountTarget } from "./accountTarget.js";
export function accountTargetState(target: AccountTarget): Record<string, unknown> {
    return {
        banned: Boolean(target.bannedAt),
        bannedAt: target.bannedAt,
        expiresAt: target.banExpiresAt,
        reason: target.banReason,
        bannedByUserId: target.bannedByUserId,
    };
}
