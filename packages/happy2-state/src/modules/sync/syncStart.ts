import type { SyncCoordinator } from "./syncCoordinator.js";

/** Starts initial durable loading and realtime hint delivery for a connected HappyState. */
export async function syncStart(coordinator: SyncCoordinator): Promise<void> {
    await coordinator.start();
}
