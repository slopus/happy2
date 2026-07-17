import { type ChatSummary, type MessageSummary, type UserSummary } from "../chat/types.js";
import { type DrizzleExecutor } from "../drizzle.js";

import { searchPageGet } from "./searchPageGet.js";
/**
 * Returns the first ranked page of fuzzy users, accessible channels, and visible non-expired messages for the normalized query.
 * Omitting cursor handling from this convenience action preserves the same scoring and authorization pipeline used by paginated search.
 */
export async function searchRun(
    executor: DrizzleExecutor,
    userId: string,
    query: string,
    limit: number,
): Promise<
    Array<
        | {
              type: "message";
              score: number;
              message: MessageSummary;
          }
        | {
              type: "channel";
              score: number;
              channel: ChatSummary;
          }
        | {
              type: "user";
              score: number;
              user: UserSummary;
          }
    >
> {
    return (
        await searchPageGet(executor, {
            userId,
            query,
            limit,
        })
    ).results;
}
