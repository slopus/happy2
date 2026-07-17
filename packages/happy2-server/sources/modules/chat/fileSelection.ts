import { files } from "../schema.js";
export const fileSelection = {
    id: files.id,
    kind: files.kind,
    original_name: files.originalName,
    content_type: files.contentType,
    size: files.size,
    width: files.width,
    height: files.height,
    duration_ms: files.durationMs,
    thumbhash: files.thumbhash,
    uploaded_by_user_id: files.uploadedByUserId,
    created_at: files.createdAt,
};
