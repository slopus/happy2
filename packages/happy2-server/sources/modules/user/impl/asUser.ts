import { type User } from "../types.js";
import { type UserRow } from "./userRow.js";
export function asUser(row: UserRow): User {
    return {
        id: row.id,
        firstName: row.firstName,
        lastName: row.lastName ?? undefined,
        username: row.username,
        email: row.email ?? undefined,
        phone: row.phone ?? undefined,
        photoFileId: row.photoFileId ?? undefined,
        title: row.title ?? undefined,
        role: row.role as User["role"],
        kind: row.kind as User["kind"],
        agentImageId: row.agentImageId ?? undefined,
        createdByUserId: row.createdByUserId ?? undefined,
        systemRole: row.systemRole === "service" ? "service" : undefined,
        lastAccessAt: row.lastAccessAt ?? undefined,
    };
}
