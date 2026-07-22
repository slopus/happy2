import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import { type DrizzleTransaction } from "../drizzle.js";
import { projects } from "../schema.js";
import { projectDefaultRequire } from "./projectDefaultRequire.js";
import type { ProjectSummary } from "./types.js";

/**
 * Ensures the one durable default projects row exists for a caller that is assembling the main channel in the same transaction.
 * It creates no channel or sync event itself, so the composing setup action remains responsible for publishing one complete, usable project/channel substrate.
 */
export async function projectDefaultEnsure(
    executor: DrizzleTransaction,
    input: { createdByUserId?: string } = {},
): Promise<ProjectSummary> {
    const [existing] = await executor
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.isDefault, 1))
        .limit(1);
    if (!existing)
        await executor.insert(projects).values({
            id: createId(),
            name: "General",
            isDefault: 1,
            createdByUserId: input.createdByUserId,
        });
    return projectDefaultRequire(executor);
}
