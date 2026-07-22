import { type KeyboardEvent } from "react";
import { Button } from "./Button";
import { Icon } from "./Icon";

export interface DesktopInstanceTarget {
    detail: string;
    id: string;
    kind: "local" | "cloud";
    label: string;
}

export interface DesktopInstanceStatus {
    label: string;
    tone?: "neutral" | "success" | "warning";
}

export interface DesktopInstanceUpdate {
    availableVersion?: string;
    message?: string;
    status: "idle" | "checking" | "available" | "downloading" | "downloaded" | "error";
}

export interface DesktopInstanceSwitcherProps {
    activeTargetId: string;
    notice?: string;
    onChangeMode(): void;
    onInstallUpdate?(): void;
    onTargetSelect(id: string): void;
    status?: DesktopInstanceStatus;
    targets: readonly DesktopInstanceTarget[];
    update?: DesktopInstanceUpdate;
}

/**
 * C-146 DesktopInstanceSwitcher — compact, keyboard-addressable local/cloud
 * identity shown above every desktop sidebar body. It switches between the
 * saved topologies (this machine, or a connected cloud instance), reports the
 * active runtime status, and surfaces a ready desktop update without leaving
 * the sidebar.
 */
export function DesktopInstanceSwitcher(props: DesktopInstanceSwitcherProps) {
    const selectAdjacent = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
        event.preventDefault();
        const direction = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
        const next = (index + direction + props.targets.length) % props.targets.length;
        const target = props.targets[next];
        if (!target) return;
        props.onTargetSelect(target.id);
        const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
            ".happy2-instance-switcher__target",
        );
        buttons?.[next]?.focus();
    };
    const updateLabel = () => {
        const update = props.update;
        if (!update || update.status === "idle") return undefined;
        if (update.message) return update.message;
        if (update.status === "downloaded")
            return `Happy ${update.availableVersion ?? "update"} ready`;
        if (update.status === "downloading") return "Downloading update";
        if (update.status === "available") return "Update available";
        if (update.status === "checking") return "Checking for updates";
        return "Update check failed";
    };
    return (
        <section
            aria-label="Happy instances"
            className="happy2-instance-switcher"
            data-happy2-ui="instance-switcher"
        >
            <div
                aria-label="Select Happy instance"
                className="happy2-instance-switcher__targets"
                data-count={props.targets.length}
                data-happy2-ui="instance-switcher-targets"
                role="group"
            >
                {props.targets.map((target, index) => {
                    const active = target.id === props.activeTargetId;
                    return (
                        <button
                            aria-label={`${target.label}, ${target.kind === "local" ? "local to this machine" : "cloud over HTTPS"}`}
                            aria-pressed={active}
                            className="happy2-instance-switcher__target"
                            data-active={active ? "" : undefined}
                            data-happy2-ui="instance-switcher-target"
                            data-kind={target.kind}
                            key={target.id}
                            onClick={() => props.onTargetSelect(target.id)}
                            onKeyDown={(event) => selectAdjacent(event, index)}
                            title={target.detail}
                            type="button"
                        >
                            <span
                                className="happy2-instance-switcher__target-icon"
                                data-happy2-ui="instance-switcher-target-icon"
                            >
                                <Icon
                                    name={target.kind === "local" ? "terminal" : "link"}
                                    size={14}
                                />
                            </span>
                            <span
                                className="happy2-instance-switcher__target-copy"
                                data-happy2-ui="instance-switcher-target-copy"
                            >
                                <span className="happy2-instance-switcher__target-label">
                                    {target.label}
                                </span>
                                <span className="happy2-instance-switcher__target-kind">
                                    {target.kind === "local" ? "LOCAL" : "CLOUD"}
                                </span>
                            </span>
                        </button>
                    );
                })}
            </div>
            <div className="happy2-instance-switcher__meta" data-happy2-ui="instance-switcher-meta">
                <span
                    className="happy2-instance-switcher__status"
                    data-happy2-ui="instance-switcher-status"
                    data-tone={
                        props.notice || props.update?.status === "error"
                            ? "warning"
                            : updateLabel()
                              ? "neutral"
                              : (props.status?.tone ?? "neutral")
                    }
                    title={props.notice}
                >
                    <span aria-hidden="true" className="happy2-instance-switcher__status-dot" />
                    {props.notice ?? updateLabel() ?? props.status?.label ?? "Ready"}
                </span>
                {props.update?.status === "downloaded" && props.onInstallUpdate ? (
                    <Button onClick={props.onInstallUpdate} size="small" variant="ghost">
                        Install
                    </Button>
                ) : null}
                <Button onClick={props.onChangeMode} size="small" variant="ghost">
                    Change
                </Button>
            </div>
        </section>
    );
}
