import { eq } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { projects } from "../schema.js";
import { projectRequire } from "./projectRequire.js";
import type { ProjectSummary } from "./types.js";

/**
 * Returns the sole durable default project required by the server's main-channel substrate.
 * Treating absence as an invariant failure keeps product actions from silently inventing a second default boundary.
 */
export async function projectDefaultRequire(executor: DrizzleExecutor): Promise<ProjectSummary> {
    const [project] = await executor
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.isDefault, 1))
        .limit(1);
    if (!project) throw new Error("Default project is missing");
    return projectRequire(executor, project.id);
}
