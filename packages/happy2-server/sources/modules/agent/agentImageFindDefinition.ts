import type { AgentImageSummary } from "../chat/types.js";
import type { DrizzleExecutor } from "../drizzle.js";
import { agentImages } from "../schema.js";
import { and, eq } from "drizzle-orm";
import { asAgentImage } from "./impl/asAgentImage.js";
import { agentImageSelection } from "./impl/agentImageSelection.js";

/**
 * Finds one non-system agentImages record by its built-in key or immutable definition hash without changing durable state.
 * This public projection lets setup orchestration reuse image definitions without reaching into agent module implementation details.
 */
export async function agentImageFindDefinition(
    executor: DrizzleExecutor,
    selector: { builtinKey: "daycare-full" | "daycare-minimal" } | { definitionHash: string },
): Promise<AgentImageSummary | undefined> {
    const [image] = await executor
        .select(agentImageSelection)
        .from(agentImages)
        .where(
            and(
                eq(agentImages.systemOnly, 0),
                "builtinKey" in selector
                    ? eq(agentImages.builtinKey, selector.builtinKey)
                    : eq(agentImages.definitionHash, selector.definitionHash),
            ),
        )
        .limit(1);
    return image ? asAgentImage(image) : undefined;
}
