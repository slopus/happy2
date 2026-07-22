import { asc, desc, inArray, sql } from "drizzle-orm";
import type { ChatSummary } from "../chat/types.js";
import { channelDirectoryList } from "../chat/channelDirectoryList.js";
import type { DrizzleExecutor } from "../drizzle.js";
import { projects } from "../schema.js";
import { asProject } from "./impl/asProject.js";
import { projectSelection } from "./impl/projectSelection.js";
import type { ProjectSummary } from "./types.js";

/**
 * Lists only projects containing at least one channel visible through the caller's established channel directory access.
 * Deriving visibility from channels prevents private-only project metadata from widening the collaboration disclosure boundary.
 */
export async function projectDirectoryList(
    executor: DrizzleExecutor,
    userId: string,
): Promise<ProjectSummary[]> {
    const channels = await channelDirectoryList(executor, userId);
    const projectIds = [
        ...new Set(
            channels
                .map((chat) => (chat as ChatSummary & { projectId?: string }).projectId)
                .filter((projectId): projectId is string => projectId !== undefined),
        ),
    ];
    if (projectIds.length === 0) return [];
    const rows = await executor
        .select(projectSelection)
        .from(projects)
        .where(inArray(projects.id, projectIds))
        .orderBy(desc(projects.isDefault), asc(sql`lower(${projects.name})`), asc(projects.id));
    return rows.map(asProject);
}
