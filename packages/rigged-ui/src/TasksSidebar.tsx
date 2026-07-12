import { For, Show, splitProps, type JSX } from "solid-js";

export type TasksSidebarMark = "agents" | "all" | "blocked" | "complete" | "mine";

export type TasksSidebarView = {
    id: string;
    label: string;
    mark: TasksSidebarMark;
};

export type TasksSidebarGoal = {
    color: string;
    id: string;
    label: string;
    progress: number;
};

export type TasksSidebarSummary = {
    bars: number[];
    label: string;
    value: string;
};

export type TasksSidebarProps = Omit<JSX.HTMLAttributes<HTMLElement>, "children"> & {
    activeView: string;
    counts: Readonly<Record<string, number>>;
    goals: readonly TasksSidebarGoal[];
    onQueryChange: (query: string) => void;
    onSettingsClick?: () => void;
    onViewChange: (view: string) => void;
    query: string;
    subtitle?: string;
    summary: TasksSidebarSummary;
    title?: string;
    views: readonly TasksSidebarView[];
};

function ViewMark(props: { mark: TasksSidebarMark }) {
    const paths: Record<TasksSidebarMark, JSX.Element> = {
        all: <path d="M4 4h8v8H4zM6.5 1.5v3M9.5 1.5v3M6.5 11.5v3M9.5 11.5v3" />,
        mine: <circle cx="8" cy="8" r="4.5" />,
        agents: <path d="m8 2.25 5.25 5.75L8 13.75 2.75 8 8 2.25Z" />,
        blocked: <path d="M8 3.25v6M8 12.25v.5" />,
        complete: <path d="m3.25 8.25 3 3 6.5-6.5" />,
    };

    return (
        <svg
            aria-hidden="true"
            class="block h-4 w-4 overflow-visible"
            data-rigged-ui="tasks-sidebar-view-mark"
            viewBox="0 0 16 16"
        >
            <g
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.4"
                vector-effect="non-scaling-stroke"
            >
                {paths[props.mark]}
            </g>
        </svg>
    );
}

function SearchMark() {
    return (
        <svg
            aria-hidden="true"
            class="block h-4 w-4 overflow-visible"
            data-rigged-ui="tasks-sidebar-search-mark"
            viewBox="0 0 16 16"
        >
            <g class="translate-x-[0.5px] translate-y-[0.5px]">
                <circle
                    cx="7"
                    cy="7"
                    r="4.25"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.4"
                />
                <path
                    d="m10.25 10.25 3 3"
                    fill="none"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-width="1.4"
                />
            </g>
        </svg>
    );
}

function SettingsMark() {
    return (
        <svg
            aria-hidden="true"
            class="block h-4 w-4 overflow-visible"
            data-rigged-ui="tasks-sidebar-settings-mark"
            viewBox="0 0 16 16"
        >
            <g class="-translate-y-[0.5px] [@supports(font:-apple-system-body)]:translate-y-0">
                <circle
                    cx="8"
                    cy="8"
                    r="2.25"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.3"
                />
                <path
                    d="M8 1.75v1.5M8 12.75v1.5M1.75 8h1.5M12.75 8h1.5M3.58 3.58l1.06 1.06M11.36 11.36l1.06 1.06M12.42 3.58l-1.06 1.06M4.64 11.36l-1.06 1.06"
                    fill="none"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-width="1.3"
                />
            </g>
        </svg>
    );
}

export function TasksSidebar(props: TasksSidebarProps) {
    const [local, rest] = splitProps(props, [
        "activeView",
        "class",
        "counts",
        "goals",
        "onQueryChange",
        "onSettingsClick",
        "onViewChange",
        "query",
        "subtitle",
        "summary",
        "title",
        "views",
    ]);
    const normalizedQuery = () => local.query.trim().toLowerCase();
    const visibleViews = () =>
        local.views.filter((view) => view.label.toLowerCase().includes(normalizedQuery()));
    const visibleGoals = () =>
        local.goals.filter((goal) => goal.label.toLowerCase().includes(normalizedQuery()));
    const isActive = (id: string) => local.activeView === id;

    return (
        <aside
            {...rest}
            aria-label={rest["aria-label"] ?? "Tasks sidebar"}
            class={`box-border flex h-full min-h-0 w-72 flex-col overflow-hidden bg-[#f8f6f3] font-['Rigged_Manrope',sans-serif] text-[#484039] ${local.class ?? ""}`}
            data-rigged-ui="tasks-sidebar"
        >
            <header
                class="flex h-[58px] shrink-0 items-center justify-between border-b border-[#e1dcd5] px-3"
                data-rigged-ui="tasks-sidebar-header"
            >
                <div class="min-w-0">
                    <h2
                        class="m-0 h-5 truncate text-base font-extrabold leading-5 tracking-[-0.025em] text-[#28231f]"
                        data-rigged-ui="tasks-sidebar-title"
                    >
                        {local.title ?? "Tasks"}
                    </h2>
                    <p
                        class="m-0 mt-0.5 h-3 truncate text-[8.8px] font-medium leading-3 text-[#8b837b]"
                        data-rigged-ui="tasks-sidebar-subtitle"
                    >
                        {local.subtitle ?? "Human + agent work"}
                    </p>
                </div>
                <Show when={local.onSettingsClick}>
                    <button
                        aria-label="Task settings"
                        class="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[#dbd5ce] bg-white p-0 text-[#635a52] shadow-[0_1px_2px_rgb(43_35_29_/_4%)] hover:bg-[#f2eee9] focus-visible:outline-2 focus-visible:outline-[#a57b59]"
                        data-rigged-ui="tasks-sidebar-settings"
                        type="button"
                        onClick={() => local.onSettingsClick?.()}
                    >
                        <SettingsMark />
                    </button>
                </Show>
            </header>

            <div
                class="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-3"
                data-rigged-ui="tasks-sidebar-scroll"
            >
                <label
                    class="box-border flex h-8 items-center gap-2 rounded-[7px] border border-[#d9d3cb] bg-white px-2.5 text-[#6a6158] shadow-[0_1px_2px_rgb(49_38_29_/_3%)] focus-within:border-[#a57b59] focus-within:ring-2 focus-within:ring-[#a57b59]/10"
                    data-rigged-ui="tasks-sidebar-search"
                >
                    <SearchMark />
                    <input
                        aria-label="Find a task or goal"
                        class="h-4 min-w-0 flex-1 border-0 bg-transparent p-0 text-[11px] leading-4 text-[#352f2a] outline-0 placeholder:text-[#8c8279]"
                        data-rigged-ui="tasks-sidebar-search-input"
                        placeholder="Find a task or goal…"
                        role="searchbox"
                        type="text"
                        value={local.query}
                        onInput={(event) => local.onQueryChange(event.currentTarget.value)}
                    />
                </label>

                <nav class="mt-4" aria-label="Task views" data-rigged-ui="tasks-sidebar-views">
                    <h3 class="m-0 h-3 px-2 text-[8.64px] font-black uppercase leading-3 tracking-[0.11em] text-[#958b81]">
                        Views
                    </h3>
                    <div class="mt-1.5 flex flex-col gap-0.5">
                        <For each={visibleViews()}>
                            {(view) => (
                                <button
                                    aria-label={view.label}
                                    aria-pressed={isActive(view.id)}
                                    class={`box-border flex h-8 w-full items-center gap-2 rounded-[7px] border-0 px-2 py-0 text-left text-[10.72px] font-semibold leading-4 ${isActive(view.id) ? "bg-[#e6d9cd] text-[#3e3026]" : "bg-transparent text-[#685e55] hover:bg-[#eee9e3]"}`}
                                    data-active={isActive(view.id) ? "true" : "false"}
                                    data-rigged-ui="tasks-sidebar-view"
                                    data-view-id={view.id}
                                    type="button"
                                    onClick={() => local.onViewChange(view.id)}
                                >
                                    <span class="grid h-5 w-5 shrink-0 place-items-center rounded-[6px] bg-white/70">
                                        <ViewMark mark={view.mark} />
                                    </span>
                                    <span class="min-w-0 flex-1 truncate">{view.label}</span>
                                    <span
                                        class="h-3 shrink-0 text-[8.64px] font-extrabold leading-3 text-[#8b8077] tabular-nums"
                                        data-rigged-ui="tasks-sidebar-view-count"
                                    >
                                        {local.counts[view.id] ?? 0}
                                    </span>
                                </button>
                            )}
                        </For>
                    </div>
                </nav>

                <div class="my-4 h-px bg-[#e0dbd4]" data-rigged-ui="tasks-sidebar-divider" />

                <section aria-labelledby="tasks-sidebar-goals" data-rigged-ui="tasks-sidebar-goals">
                    <h3
                        class="m-0 h-3 px-2 text-[8.64px] font-black uppercase leading-3 tracking-[0.11em] text-[#958b81]"
                        id="tasks-sidebar-goals"
                    >
                        Goals
                    </h3>
                    <div class="mt-1.5 flex flex-col gap-1">
                        <For each={visibleGoals()}>
                            {(goal) => (
                                <button
                                    aria-label={goal.label}
                                    aria-pressed={isActive(goal.id)}
                                    class={`box-border h-12 w-full rounded-lg border-0 px-2 py-2 text-left ${isActive(goal.id) ? "bg-[#e6d9cd]" : "bg-transparent hover:bg-[#eee9e3]"}`}
                                    data-active={isActive(goal.id) ? "true" : "false"}
                                    data-rigged-ui="tasks-sidebar-goal"
                                    data-view-id={goal.id}
                                    type="button"
                                    onClick={() => local.onViewChange(goal.id)}
                                >
                                    <span class="flex h-3 items-center justify-between gap-2">
                                        <span class="min-w-0 flex-1 truncate text-[10.08px] font-extrabold leading-3 text-[#584e45]">
                                            {goal.label}
                                        </span>
                                        <span class="h-3 shrink-0 text-[8px] font-bold leading-3 text-[#8b8178] tabular-nums">
                                            {goal.progress}%
                                        </span>
                                    </span>
                                    <span class="mt-1.5 block h-1 overflow-hidden rounded-[2px] bg-white/80">
                                        <span
                                            class="block h-full rounded-[2px]"
                                            data-rigged-ui="tasks-sidebar-goal-progress"
                                            style={{
                                                "background-color": goal.color,
                                                width: `${goal.progress}%`,
                                            }}
                                        />
                                    </span>
                                </button>
                            )}
                        </For>
                    </div>
                </section>
            </div>

            <footer
                class="h-[78px] shrink-0 border-t border-[#e0dbd5] p-3"
                data-rigged-ui="tasks-sidebar-footer"
            >
                <div class="box-border h-[53px] rounded-lg border border-[#ddd6ce] bg-white p-2.5">
                    <div class="flex h-3 items-center justify-between gap-2">
                        <span class="truncate text-[9.12px] font-extrabold leading-3 text-[#5f554c]">
                            {local.summary.label}
                        </span>
                        <span class="shrink-0 text-[8.64px] font-bold leading-3 text-[#438157]">
                            {local.summary.value}
                        </span>
                    </div>
                    <div
                        aria-hidden="true"
                        class="mt-2 flex h-5 items-end gap-1"
                        data-rigged-ui="tasks-sidebar-summary-bars"
                    >
                        <For each={local.summary.bars}>
                            {(height) => (
                                <span
                                    class="flex-1 rounded-sm bg-[#d9c8b8]"
                                    data-rigged-ui="tasks-sidebar-summary-bar"
                                    style={{ height: `${height}%` }}
                                />
                            )}
                        </For>
                    </div>
                </div>
            </footer>
        </aside>
    );
}
