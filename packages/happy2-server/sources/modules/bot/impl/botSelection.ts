import { botIdentities } from "../../schema.js";
export const botSelection = {
    id: botIdentities.id,
    name: botIdentities.name,
    username: botIdentities.username,
    description: botIdentities.description,
    photo_file_id: botIdentities.photoFileId,
    owner_user_id: botIdentities.ownerUserId,
    active: botIdentities.active,
    created_at: botIdentities.createdAt,
    updated_at: botIdentities.updatedAt,
    deleted_at: botIdentities.deletedAt,
};
