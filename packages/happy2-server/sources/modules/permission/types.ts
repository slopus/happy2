export const permissions = [
    "manageSecrets",
    "assignSecrets",
    "manageImages",
    "assignImagesToChats",
    "managePlugins",
    "viewAllMembers",
    "manageAdminRoles",
    "resetPasswords",
] as const;

export type Permission = (typeof permissions)[number];

export interface EffectivePermissions {
    allowed: Permission[];
    owner: boolean;
}

export interface RoleSummary {
    id: string;
    name: string;
    description?: string;
    builtin: "admin" | "member" | null;
    permissions: Permission[];
    userIds: string[];
}

export interface PermissionMutation {
    affectedUserIds: string[];
    broadcast: boolean;
    sync: {
        sequence: string;
        chats: [];
        areas: ["permissions"];
    };
}
