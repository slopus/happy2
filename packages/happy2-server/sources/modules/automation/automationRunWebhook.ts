import { type AutomationRuntime } from "./types.js";
import { CollaborationError, type MutationHint } from "../chat/types.js";
import { type DrizzleExecutor } from "../drizzle.js";

import { and, asc, eq, isNull } from "drizzle-orm";

import { automations } from "../schema.js";
import { createId } from "@paralleldrive/cuid2";

import { hashesEqual } from "./impl/hashesEqual.js";

import { jsonObject } from "./impl/jsonObject.js";
import { secretHash } from "./impl/secretHash.js";
import { executeAutomation } from "./impl/executeAutomation.js";
/**
 * Finds an active webhook automation by constant-time token-hash comparison and executes it with a validated idempotency key or fresh event identifier.
 * Returning not-found for malformed or unmatched tokens avoids revealing webhook definitions while deterministic keyed events deduplicate caller retries.
 */
export async function automationRunWebhook(
    executor: DrizzleExecutor,
    options: AutomationRuntime,
    token: string,
    idempotencyKey?: string,
): Promise<{
    hint?: MutationHint;
    runId: string;
}> {
    if (!token.startsWith("happy2_auto_") || token.length > 256)
        throw new CollaborationError("not_found", "Automation webhook was not found");
    if (
        idempotencyKey !== undefined &&
        (idempotencyKey.length < 1 ||
            idempotencyKey.length > 200 ||
            !/^[\x21-\x7e]+$/.test(idempotencyKey))
    )
        throw new CollaborationError("invalid", "Idempotency key is invalid");
    const candidates = await executor
        .select()
        .from(automations)
        .where(
            and(
                eq(automations.active, 1),
                isNull(automations.deletedAt),
                eq(automations.triggerType, "webhook"),
            ),
        )
        .orderBy(asc(automations.id));
    const digest = secretHash(token);
    const row = candidates.find((candidate) => {
        const stored = jsonObject(candidate.triggerConfigJson).tokenHash;
        return typeof stored === "string" && hashesEqual(stored, digest);
    });
    if (!row?.createdByUserId)
        throw new CollaborationError("not_found", "Automation webhook was not found");
    const eventId = idempotencyKey
        ? `webhook:${secretHash(`${row.id}:${idempotencyKey}`)}`
        : `webhook:${createId()}`;
    return executeAutomation(executor, options, row.id, eventId, row.createdByUserId);
}
