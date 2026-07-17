import { type IntegrationScope, integrationScopes } from "../integrations/types.js";

import { stringArray } from "./stringArray.js";
export function parseScopes(value: unknown): IntegrationScope[] {
    const parsed = stringArray(value);
    if (parsed.some((scope) => !integrationScopes.includes(scope as IntegrationScope)))
        throw new Error("Database contains an invalid integration scope");
    return parsed as IntegrationScope[];
}
