export interface AccountTarget {
    accountId: string;
    userId: string;
    username: string;
    bannedAt?: string;
    banExpiresAt?: string;
    banReason?: string;
    bannedByUserId?: string;
}
