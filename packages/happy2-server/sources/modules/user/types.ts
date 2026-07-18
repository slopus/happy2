export interface User {
    id: string;
    firstName: string;
    lastName?: string;
    username: string;
    email?: string;
    phone?: string;
    photoFileId?: string;
    title?: string;
    role: "member" | "admin";
    kind: "human" | "agent";
    agentImageId?: string;
    createdByUserId?: string;
    agentRole?: "default";
    lastAccessAt?: string;
}

export interface CreateProfile {
    firstName: string;
    lastName?: string;
    username: string;
    email?: string;
    phone?: string;
}
