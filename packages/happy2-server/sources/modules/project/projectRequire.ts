import { eq } from "drizzle-orm";
import { CollaborationError } from "../chat/types.js";
import type { DrizzleExecutor } from "../drizzle.js";
import { projects } from "../schema.js";
import { asProject } from "./impl/asProject.js";
import { projectSelection } from "./impl/projectSelection.js";
import type { ProjectSummary } from "./types.js";

/**
 * Requires one durable projects row by public identifier without disclosing any alternate project state.
 * This read boundary gives channel actions one canonical existence check before attaching new durable work.
 */
export async function projectRequire(
    executor: DrizzleExecutor,
    projectId: string,
): Promise<ProjectSummary> {
    const [row] = await executor
        .select(projectSelection)
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
    if (!row) throw new CollaborationError("not_found", "Project was not found");
    return asProject(row);
}
