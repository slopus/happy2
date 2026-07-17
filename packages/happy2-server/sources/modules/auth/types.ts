export interface RequestMetadata {
    ip?: string;
    forwardedFor?: string[];
    location?: Record<string, string>;
    device?: string;
    appVersion?: string;
    userAgent?: string;
}

export interface ActiveSession {
    id: string;
    accountId: string;
    expiresAt: Date;
}

export interface Account {
    id: string;
    email: string;
    passwordHash: string | null;
    active: boolean;
    bannedAt?: string;
    deletedAt?: string;
}
