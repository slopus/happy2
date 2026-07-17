import {
    IntegrationError,
    type IntegrationScope,
    integrationScopes,
} from "../../integrations/types.js";

export function normalizeScopes(values: readonly IntegrationScope[]): IntegrationScope[] {
    const unique = [...new Set(values)];
    if (unique.some((scope) => !integrationScopes.includes(scope)))
        throw new IntegrationError("invalid", "Integration scope is invalid");
    return unique.sort();
}
