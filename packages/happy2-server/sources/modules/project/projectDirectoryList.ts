import { and, asc, desc, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { ChatSummary } from "../chat/types.js";
import { channelDirectoryList } from "../chat/channelDirectoryList.js";
import { userIsServerAdmin } from "../chat/userIsServerAdmin.js";
import type { DrizzleExecutor } from "../drizzle.js";
import { chats, projects } from "../schema.js";
import { asProject } from "./impl/asProject.js";
import { projectSelection } from "./impl/projectSelection.js";
import type { ProjectSummary } from "./types.js";

/**
 * Lists projects containing a directory-visible channel, plus every live channel project for a server administrator.
 * The administrator expansion stays at the project boundary so the joinable channel directory never exposes private channels that its Join action must reject.
 */
export async function projectDirectoryList(
    executor: DrizzleExecutor,
    userId: string,
): Promise<ProjectSummary[]> {
    const channels = await channelDirectoryList(executor, userId);
    const projectIds = new Set(
        channels
            .map((chat) => (chat as ChatSummary & { projectId?: string }).projectId)
            .filter((projectId): projectId is string => projectId !== undefined),
    );
    if (await userIsServerAdmin(executor, userId)) {
        const administrativeProjects = await executor
            .selectDistinct({ projectId: chats.projectId })
            .from(chats)
            .where(
                and(
                    isNull(chats.deletedAt),
                    isNotNull(chats.projectId),
                    inArray(chats.kind, ["public_channel", "private_channel"]),
                ),
            );
        for (const { projectId } of administrativeProjects)
            if (projectId) projectIds.add(projectId);
    }
    if (projectIds.size === 0) return [];
    const rows = await executor
        .select(projectSelection)
        .from(projects)
        .where(inArray(projects.id, [...projectIds]))
        .orderBy(desc(projects.isDefault), asc(sql`lower(${projects.name})`), asc(projects.id));
    return rows.map(asProject);
}
