import { type RequestMetadata } from "../auth/types.js";
export interface AuditContext {
    request?: RequestMetadata;
    metadata?: Record<string, unknown>;
}
