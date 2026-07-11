import { createSignal, For } from "solid-js";

export type TaskView =
    | "all"
    | "agents"
    | "blocked"
    | "complete"
    | "goal-onboarding"
    | "goal-reliability"
    | "goal-transparency"
    | "mine";

export type TaskCounts = {
    agents: number;
    all: number;
    blocked: number;
    complete: number;
    mine: number;
};

type TasksSidebarProps = {
    activeView: TaskView;
    counts: TaskCounts;
    onViewChange: (view: TaskView) => void;
};

const views = [
    { id: "all" as const, label: "All work", icon: "⌘" },
    { id: "mine" as const, label: "My tasks", icon: "○" },
    { id: "agents" as const, label: "Agent-owned", icon: "◇" },
    { id: "blocked" as const, label: "Blocked", icon: "!" },
    { id: "complete" as const, label: "Completed", icon: "✓" },
];

const goals = [
    {
        id: "goal-onboarding" as const,
        label: "Frictionless onboarding",
        progress: 68,
        tone: "bg-[#d98057]",
    },
    {
        id: "goal-transparency" as const,
        label: "Agent transparency",
        progress: 46,
        tone: "bg-[#7862a4]",
    },
    {
        id: "goal-reliability" as const,
        label: "Desktop reliability",
        progress: 74,
        tone: "bg-[#4f8a82]",
    },
];

export function TasksSidebar(props: TasksSidebarProps) {
    const [query, setQuery] = createSignal("");
    const normalizedQuery = () => query().trim().toLowerCase();
    const visibleViews = () =>
        views.filter((view) => view.label.toLowerCase().includes(normalizedQuery()));
    const visibleGoals = () =>
        goals.filter((goal) => goal.label.toLowerCase().includes(normalizedQuery()));
    const active = (view: TaskView) => props.activeView === view;

    return (
        <aside
            class="flex h-full min-h-0 flex-col bg-[#f8f6f3] text-[#484039]"
            aria-label="Tasks sidebar"
        >
            <header class="flex h-[58px] shrink-0 items-center justify-between border-b border-[#e1dcd5] px-3">
                <div>
                    <h2 class="text-[1rem] font-extrabold tracking-[-0.025em] text-[#28231f]">
                        Tasks
                    </h2>
                    <p class="mt-0.5 text-[0.55rem] font-medium text-[#8b837b]">
                        Human + agent work
                    </p>
                </div>
                <button
                    class="grid h-8 w-8 place-items-center rounded-lg border border-[#dbd5ce] bg-white text-[0.8rem] text-[#635a52] shadow-[0_1px_2px_rgb(43_35_29_/_4%)] hover:bg-[#f2eee9]"
                    type="button"
                    aria-label="Task settings"
                >
                    ⚙
                </button>
            </header>

            <div class="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-3">
                <label class="flex h-8 items-center gap-2 rounded-[7px] border border-[#d9d3cb] bg-white px-2.5 text-[#6a6158] shadow-[0_1px_2px_rgb(49_38_29_/_3%)] focus-within:border-[#a57b59] focus-within:ring-2 focus-within:ring-[#a57b59]/10">
                    <span class="text-[0.8rem]" aria-hidden="true">
                        ⌕
                    </span>
                    <input
                        class="min-w-0 flex-1 border-0 bg-transparent text-[0.69rem] text-[#352f2a] outline-0 placeholder:text-[#8c8279]"
                        type="search"
                        aria-label="Find a task or goal"
                        placeholder="Find a task or goal…"
                        value={query()}
                        onInput={(event) => setQuery(event.currentTarget.value)}
                    />
                </label>

                <nav class="mt-4" aria-label="Task views">
                    <h3 class="px-2 text-[0.54rem] font-black uppercase tracking-[0.11em] text-[#958b81]">
                        Views
                    </h3>
                    <div class="mt-1.5 flex flex-col gap-0.5">
                        <For each={visibleViews()}>
                            {(view) => (
                                <button
                                    class={`flex h-8 w-full items-center gap-2 rounded-[7px] border-0 px-2 text-left text-[0.67rem] font-semibold transition ${active(view.id) ? "bg-[#e6d9cd] text-[#3e3026]" : "bg-transparent text-[#685e55] hover:bg-[#eee9e3]"}`}
                                    type="button"
                                    aria-label={view.label}
                                    aria-pressed={active(view.id)}
                                    onClick={() => props.onViewChange(view.id)}
                                >
                                    <span class="grid h-5 w-5 place-items-center rounded-[6px] bg-white/70 text-[0.62rem] font-black">
                                        {view.icon}
                                    </span>
                                    <span class="flex-1">{view.label}</span>
                                    <span class="text-[0.54rem] font-extrabold text-[#8b8077]">
                                        {props.counts[view.id]}
                                    </span>
                                </button>
                            )}
                        </For>
                    </div>
                </nav>

                <div class="my-4 h-px bg-[#e0dbd4]" />

                <section aria-labelledby="tasks-sidebar-goals">
                    <h3
                        class="px-2 text-[0.54rem] font-black uppercase tracking-[0.11em] text-[#958b81]"
                        id="tasks-sidebar-goals"
                    >
                        Goals
                    </h3>
                    <div class="mt-1.5 flex flex-col gap-1">
                        <For each={visibleGoals()}>
                            {(goal) => (
                                <button
                                    class={`w-full rounded-[8px] border-0 px-2 py-2 text-left transition ${active(goal.id) ? "bg-[#e6d9cd]" : "bg-transparent hover:bg-[#eee9e3]"}`}
                                    type="button"
                                    aria-label={goal.label}
                                    aria-pressed={active(goal.id)}
                                    onClick={() => props.onViewChange(goal.id)}
                                >
                                    <span class="flex items-center justify-between gap-2">
                                        <span class="truncate text-[0.63rem] font-extrabold text-[#584e45]">
                                            {goal.label}
                                        </span>
                                        <span class="text-[0.5rem] font-bold tabular-nums text-[#8b8178]">
                                            {goal.progress}%
                                        </span>
                                    </span>
                                    <span class="mt-1.5 block h-1 overflow-hidden rounded-full bg-white/80">
                                        <span
                                            class={`block h-full rounded-full ${goal.tone}`}
                                            style={{ width: `${goal.progress}%` }}
                                        />
                                    </span>
                                </button>
                            )}
                        </For>
                    </div>
                </section>
            </div>

            <footer class="shrink-0 border-t border-[#e0dbd5] p-3">
                <div class="rounded-[8px] border border-[#ddd6ce] bg-white p-2.5">
                    <div class="flex items-center justify-between">
                        <span class="text-[0.57rem] font-extrabold text-[#5f554c]">This week</span>
                        <span class="text-[0.54rem] font-bold text-[#438157]">6 completed</span>
                    </div>
                    <div class="mt-2 flex h-5 items-end gap-1" aria-hidden="true">
                        {[35, 65, 48, 82, 58, 92, 70].map((height) => (
                            <span
                                class="flex-1 rounded-sm bg-[#d9c8b8]"
                                style={{ height: `${height}%` }}
                            />
                        ))}
                    </div>
                </div>
            </footer>
        </aside>
    );
}
