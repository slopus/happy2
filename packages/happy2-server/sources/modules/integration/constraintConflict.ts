import { IntegrationError } from "../integrations/types.js";
export function constraintConflict(error: unknown, message: string): unknown {
    const code = (
        error as {
            code?: string;
        }
    ).code;
    return code?.includes("CONSTRAINT") ? new IntegrationError("conflict", message) : error;
}
