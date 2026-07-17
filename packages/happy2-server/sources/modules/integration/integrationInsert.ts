import { type DrizzleTransaction } from "../drizzle.js";
import {
    IntegrationError,
    type IntegrationKind,
    integrationKinds,
    type IntegrationScope,
} from "../integrations/types.js";

import { createId } from "@paralleldrive/cuid2";

import { integrations } from "../schema.js";
import { normalizeScopes } from "./impl/normalizeScopes.js";
import { optionalTrimmed } from "./optionalTrimmed.js";
import { requiredTrimmed } from "./requiredTrimmed.js";
/**
 * Inserts a normalized integrations definition with its owner, provider type, capabilities, and initial active state.
 * Keeping construction in the caller's transaction lets related bot or webhook records roll back when the integration cannot be fully provisioned.
 */
export async function integrationInsert(
    tx: DrizzleTransaction,
    input: {
        actorUserId: string;
        kind: IntegrationKind;
        name: string;
        description?: string;
        botId?: string;
        scopes: readonly IntegrationScope[];
    },
): Promise<{
    id: string;
}> {
    if (!integrationKinds.includes(input.kind))
        throw new IntegrationError("invalid", "Integration kind is invalid");
    const id = createId();
    await tx.insert(integrations).values({
        id,
        kind: input.kind,
        name: requiredTrimmed(input.name, "Integration name", 200),
        description: optionalTrimmed(input.description, "Integration description", 2_000) ?? null,
        botId: input.botId ?? null,
        createdByUserId: input.actorUserId,
        scopesJson: JSON.stringify(normalizeScopes(input.scopes)),
    });
    return {
        id,
    };
}
