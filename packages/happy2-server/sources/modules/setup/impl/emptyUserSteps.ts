import { type UserStepRecord } from "./userStepRecord.js";
export function emptyUserSteps(): UserStepRecord {
    const updatedAt = new Date(0).toISOString();
    return {
        avatar: {
            state: "pending",
            updatedAt,
        },
        desktop_notifications: {
            state: "pending",
            updatedAt,
        },
    };
}
