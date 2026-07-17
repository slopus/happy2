import { type ServerSetupStepState } from "../types.js";
export function allowedServerTransition(
    from: ServerSetupStepState,
    to: ServerSetupStepState,
): boolean {
    if (from === "pending") return to === "in_progress" || to === "complete" || to === "failed";
    if (from === "in_progress") return to === "complete" || to === "failed";
    if (from === "failed") return to === "in_progress";
    return false;
}
