import type { UserSummary } from "../../types.js";

/** Render-ready stable identity shared by every denormalized surface occurrence. */
export interface IdentityProjection {
    readonly agentRole?: UserSummary["agentRole"];
    readonly id: string;
    readonly displayName: string;
    readonly username: string;
    readonly kind: UserSummary["kind"];
    readonly photoFileId?: string;
}
