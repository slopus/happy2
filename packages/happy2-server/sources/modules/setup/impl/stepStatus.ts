import { safeMetadata } from "./safeMetadata.js";
import { type SetupStepStatus } from "../types.js";
export function stepStatus(row: {
    state: string;
    metadataJson: string | null;
    lastError?: string | null;
    startedAt?: string | null;
    completedAt: string | null;
    updatedAt: string;
}): SetupStepStatus<string> {
    const metadata = safeMetadata(row.metadataJson);
    return {
        state: row.state,
        ...(metadata
            ? {
                  metadata,
              }
            : {}),
        ...(row.lastError
            ? {
                  lastError: row.lastError,
              }
            : {}),
        ...(row.startedAt
            ? {
                  startedAt: row.startedAt,
              }
            : {}),
        ...(row.completedAt
            ? {
                  completedAt: row.completedAt,
              }
            : {}),
        updatedAt: row.updatedAt,
    };
}
