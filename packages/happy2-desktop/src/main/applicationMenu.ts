import type { DesktopRuntimeSnapshot } from "../shared/desktopContract";

export interface DesktopInstanceMenuTarget {
    active: boolean;
    id: string;
    label: string;
}

/** Projects durable runtime targets into the native switcher available to remote web apps. */
export function desktopInstanceMenuTargets(
    snapshot: DesktopRuntimeSnapshot,
): readonly DesktopInstanceMenuTarget[] {
    const activeId = snapshot.phase === "ready" ? snapshot.activeTargetId : undefined;
    return snapshot.targets.map((target) => ({
        active: target.id === activeId,
        id: target.id,
        label: `${target.label} — ${target.detail}`,
    }));
}
