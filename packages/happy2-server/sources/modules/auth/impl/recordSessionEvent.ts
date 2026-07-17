import { authSessionEvents } from "../../schema.js";
import { type DrizzleExecutor } from "../../drizzle.js";
import { type RequestMetadata } from "../types.js";
export async function recordSessionEvent(
    executor: DrizzleExecutor,
    sessionId: string,
    type: string,
    metadata: RequestMetadata,
): Promise<void> {
    await executor.insert(authSessionEvents).values({
        sessionId,
        eventType: type,
        ip: metadata.ip ?? null,
        forwardedFor: metadata.forwardedFor ? JSON.stringify(metadata.forwardedFor) : null,
        location: metadata.location ? JSON.stringify(metadata.location) : null,
        device: metadata.device ?? null,
        appVersion: metadata.appVersion ?? null,
        userAgent: metadata.userAgent ?? null,
    });
}
