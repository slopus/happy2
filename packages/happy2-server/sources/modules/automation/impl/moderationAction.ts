import { CollaborationError } from "../../chat/types.js";
import { type ModerationAction } from "./moderationActionType.js";
export function moderationAction(value: unknown): ModerationAction {
    const values: readonly ModerationAction[] = [
        "warn",
        "restrict",
        "remove_message",
        "remove_file",
        "ban",
        "unban",
        "delete_user",
    ];
    if (typeof value !== "string" || !values.includes(value as ModerationAction))
        throw new CollaborationError("invalid", "actionConfig.action is invalid");
    return value as ModerationAction;
}
