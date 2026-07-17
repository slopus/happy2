import type { UserSummary } from "../../types.js";
import type { IdentityProjection } from "./identityTypes.js";

/** Canonicalizes rare identity presentation changes for structural sharing across surface rows. */
export class IdentityCatalog {
    private readonly identities = new Map<string, IdentityProjection>();

    project(user: UserSummary): IdentityProjection {
        const existing = this.identities.get(user.id);
        const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ");
        if (
            existing &&
            existing.displayName === displayName &&
            existing.username === user.username &&
            existing.kind === user.kind &&
            existing.photoFileId === user.photoFileId
        ) {
            return existing;
        }
        const next: IdentityProjection = {
            id: user.id,
            displayName,
            username: user.username,
            kind: user.kind,
            ...(user.photoFileId ? { photoFileId: user.photoFileId } : {}),
        };
        this.identities.set(user.id, next);
        return next;
    }

    get(userId: string): IdentityProjection | undefined {
        return this.identities.get(userId);
    }

    clear(): void {
        this.identities.clear();
    }
}
