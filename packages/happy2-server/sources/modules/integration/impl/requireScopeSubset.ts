import { IntegrationError, type IntegrationScope } from "../../integrations/types.js";

export function requireScopeSubset(
    requested: IntegrationScope[],
    allowed: IntegrationScope[],
): void {
    if (requested.some((scope) => !allowed.includes(scope)))
        throw new IntegrationError("forbidden", "Credential scope exceeds its integration");
}
