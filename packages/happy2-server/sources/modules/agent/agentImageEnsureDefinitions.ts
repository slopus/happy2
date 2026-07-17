import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { agentImages } from "../schema.js";
import { createId } from "@paralleldrive/cuid2";

/**
 * Reconciles configured image definitions into agentImages without replacing records that already represent the same image.
 * Centralizing this idempotent bootstrap keeps repeated server starts from producing duplicate build definitions.
 */
export async function agentImageEnsureDefinitions(
    executor: DrizzleExecutor,
    definitions: ReadonlyArray<{
        buildContext: string;
        builtinKey: "daycare-full" | "daycare-minimal";
        definitionHash: string;
        dockerTag: string;
        dockerfile: string;
        name: string;
    }>,
): Promise<void> {
    await withTransaction(executor, async (tx) => {
        for (const definition of definitions)
            await tx
                .insert(agentImages)
                .values({
                    id: createId(),
                    name: definition.name,
                    dockerfile: definition.dockerfile,
                    definitionHash: definition.definitionHash,
                    dockerTag: definition.dockerTag,
                    buildContext: definition.buildContext,
                    builtinKey: definition.builtinKey,
                })
                .onConflictDoNothing();
    });
}
