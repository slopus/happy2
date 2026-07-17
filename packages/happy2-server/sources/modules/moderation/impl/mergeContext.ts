import { type AuditContext } from "../../operations/auditContext.js";
export function mergeContext(
    context: AuditContext | undefined,
    metadata: Record<string, unknown> | undefined,
): AuditContext {
    return {
        request: context?.request,
        metadata: {
            ...context?.metadata,
            ...metadata,
        },
    };
}
