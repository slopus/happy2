import { For, Show, splitProps, type JSX } from "solid-js";
import { Avatar, type ToneName } from "./Avatar";
import { Badge } from "./Badge";
import { Icon, type IconName } from "./Icon";

export type DeskRun = {
    agent: string;
    detail?: string;
    eta?: string;
    id: string;
    initials: string;
    progress?: number;
    title: string;
    tone?: ToneName;
};

export type DeskListItem = {
    icon?: IconName;
    id: string;
    meta?: string;
    title: string;
};

export type AgentDeskProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, "style"> & {
    done?: DeskListItem[];
    onItemSelect?: (id: string) => void;
    queued?: DeskListItem[];
    running: DeskRun[];
    runningLabel?: string;
    style?: JSX.CSSProperties;
    title?: string;
};

function clampProgress(value: number | undefined) {
    return Math.min(100, Math.max(0, value ?? 0));
}

/**
 * AgentDesk — the docked right-panel overview of agent activity: running
 * tiles with a brand-gradient progress bar, dashed queued rows, and
 * done-today rows. Fluid width (designed for the 340px AppShell panel),
 * fills its container's height, and scrolls its body.
 */
export function AgentDesk(props: AgentDeskProps) {
    const [local, rest] = splitProps(props, [
        "class",
        "done",
        "onItemSelect",
        "queued",
        "running",
        "runningLabel",
        "style",
        "title",
    ]);

    const runningLabel = () => local.runningLabel ?? `${local.running.length} RUNNING`;

    return (
        <div
            {...rest}
            class={["rigged-agent-desk", local.class].filter(Boolean).join(" ")}
            data-rigged-ui="agent-desk"
            style={local.style}
        >
            <header class="rigged-agent-desk__header" data-rigged-ui="agent-desk-header">
                <Icon class="rigged-agent-desk__spark" name="spark" size={16} />
                <span class="rigged-agent-desk__title" data-rigged-ui="agent-desk-title">
                    {local.title ?? "Agent desk"}
                </span>
                <Badge class="rigged-agent-desk__count" label={runningLabel()} variant="accent" />
            </header>
            <div class="rigged-agent-desk__body" data-rigged-ui="agent-desk-body">
                <For each={local.running}>
                    {(run) => (
                        <section
                            aria-label={`${run.agent} · ${run.title}`}
                            class="rigged-agent-desk__run"
                            data-rigged-ui="agent-desk-run"
                        >
                            <div
                                class="rigged-agent-desk__run-head"
                                data-rigged-ui="agent-desk-run-head"
                            >
                                <Avatar
                                    aria-label={run.agent}
                                    initials={run.initials}
                                    size="xs"
                                    tone={run.tone}
                                    type="agent"
                                />
                                <span
                                    class="rigged-agent-desk__run-title"
                                    data-rigged-ui="agent-desk-run-title"
                                >
                                    {run.title}
                                </span>
                                <Show when={run.eta}>
                                    <span
                                        class="rigged-agent-desk__run-eta"
                                        data-rigged-ui="agent-desk-run-eta"
                                    >
                                        {run.eta}
                                    </span>
                                </Show>
                            </div>
                            <Show when={run.detail}>
                                <div
                                    class="rigged-agent-desk__run-detail"
                                    data-rigged-ui="agent-desk-run-detail"
                                >
                                    {run.detail}
                                </div>
                            </Show>
                            <Show when={run.progress !== undefined}>
                                <div
                                    aria-valuemax={100}
                                    aria-valuemin={0}
                                    aria-valuenow={clampProgress(run.progress)}
                                    class="rigged-agent-desk__run-track"
                                    data-rigged-ui="agent-desk-run-track"
                                    role="progressbar"
                                >
                                    <div
                                        class="rigged-agent-desk__run-fill"
                                        data-rigged-ui="agent-desk-run-fill"
                                        style={{ width: `${clampProgress(run.progress)}%` }}
                                    />
                                </div>
                            </Show>
                        </section>
                    )}
                </For>
                <Show when={(local.queued?.length ?? 0) > 0}>
                    <div
                        class="rigged-agent-desk__section-label"
                        data-rigged-ui="agent-desk-section-label"
                        data-section="queued"
                    >
                        Queued
                    </div>
                    <For each={local.queued}>
                        {(item) => (
                            <button
                                class="rigged-agent-desk__queued"
                                data-rigged-ui="agent-desk-queued"
                                onClick={() => local.onItemSelect?.(item.id)}
                                type="button"
                            >
                                <Icon
                                    class="rigged-agent-desk__row-icon"
                                    name={item.icon ?? "clock"}
                                    size={14}
                                />
                                <span
                                    class="rigged-agent-desk__row-title"
                                    data-rigged-ui="agent-desk-row-title"
                                >
                                    {item.title}
                                </span>
                                <Show when={item.meta}>
                                    <span
                                        class="rigged-agent-desk__row-meta"
                                        data-rigged-ui="agent-desk-row-meta"
                                    >
                                        {item.meta}
                                    </span>
                                </Show>
                            </button>
                        )}
                    </For>
                </Show>
                <Show when={(local.done?.length ?? 0) > 0}>
                    <div
                        class="rigged-agent-desk__section-label"
                        data-rigged-ui="agent-desk-section-label"
                        data-section="done"
                    >
                        Done today
                    </div>
                    <For each={local.done}>
                        {(item) => (
                            <button
                                class="rigged-agent-desk__done"
                                data-rigged-ui="agent-desk-done"
                                onClick={() => local.onItemSelect?.(item.id)}
                                type="button"
                            >
                                <Icon
                                    class="rigged-agent-desk__row-icon"
                                    name={item.icon ?? "check"}
                                    size={14}
                                />
                                <span
                                    class="rigged-agent-desk__row-title"
                                    data-rigged-ui="agent-desk-row-title"
                                >
                                    {item.title}
                                </span>
                                <Show when={item.meta}>
                                    <span
                                        class="rigged-agent-desk__row-meta"
                                        data-rigged-ui="agent-desk-row-meta"
                                    >
                                        {item.meta}
                                    </span>
                                </Show>
                            </button>
                        )}
                    </For>
                </Show>
            </div>
        </div>
    );
}
