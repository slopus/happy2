import { projects } from "../../schema.js";

export const projectSelection = {
    id: projects.id,
    name: projects.name,
    description: projects.description,
    is_default: projects.isDefault,
    created_by_user_id: projects.createdByUserId,
    sync_sequence: projects.syncSequence,
    created_at: projects.createdAt,
    updated_at: projects.updatedAt,
};
