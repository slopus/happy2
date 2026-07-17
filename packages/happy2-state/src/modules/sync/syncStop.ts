import type { SyncCoordinator } from "./syncCoordinator.js";

/** Stops realtime delivery and all ephemeral expiry ownership without disposing surface stores. */
export function syncStop(coordinator: SyncCoordinator): void {
    coordinator.stop();
}
