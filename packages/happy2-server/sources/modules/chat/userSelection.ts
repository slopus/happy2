import { users } from "../schema.js";
export const userSelection = {
    id: users.id,
    username: users.username,
    first_name: users.firstName,
    last_name: users.lastName,
    title: users.title,
    photo_file_id: users.photoFileId,
    role: users.role,
    user_kind: users.kind,
    agent_image_id: users.agentImageId,
    agent_effort: users.agentEffort,
    created_by_user_id: users.createdByUserId,
    agent_role: users.agentRole,
};
