import { createSignal, For } from "solid-js";
import { Avatar } from "rigged-ui";

export type AgentSidebarView =
    | "agent-forge"
    | "agent-patch"
    | "agent-scout"
    | "overview"
    | "work-active"
    | "work-complete"
    | "work-queued"
    | "work-review";

type AgentsSidebarProps = {
    activeView: AgentSidebarView;
    onViewChange: (view: AgentSidebarView) => void;
};

const agentItems = [
    {
        id: "agent-forge" as const,
        name: "Forge",
        initials: "F",
        role: "Product engineering",
        count: 2,
        avatarClass: "bg-[linear-gradient(145deg,#ef566d,#8056c7)]",
    },
    {
        id: "agent-scout" as const,
        name: "Scout",
        initials: "S",
        role: "Research & synthesis",
        count: 1,
        avatarClass: "bg-[linear-gradient(145deg,#3296a4,#4d67bd)]",
    },
    {
        id: "agent-patch" as const,
        name: "Patch",
        initials: "P",
        role: "Verification & release",
        count: 1,
        avatarClass: "bg-[linear-gradient(145deg,#d37c3e,#cf496e)]",
    },
];

const workItems = [
    { id: "work-active" as const, label: "Active runs", count: 3, icon: "↻" },
    { id: "work-review" as const, label: "Awaiting you", count: 1, icon: "!" },
    { id: "work-queued" as const, label: "Queued", count: 2, icon: "≡" },
    { id: "work-complete" as const, label: "Completed today", count: 8, icon: "✓" },
];

export function AgentsSidebar(props: AgentsSidebarProps) {
    const [query, setQuery] = createSignal("");
    const normalizedQuery = () => query().trim().toLowerCase();
    const visibleAgents = () =>
        agentItems.filter((agent) =>
            `${agent.name} ${agent.role}`.toLowerCase().includes(normalizedQuery()),
        );
    const visibleWork = () =>
        workItems.filter((item) => item.label.toLowerCase().includes(normalizedQuery()));
    const active = (view: AgentSidebarView) => props.activeView === view;
    const rowClass = (view: AgentSidebarView) =>
        `flex w-full items-center gap-2 rounded-[7px] border-0 px-2 text-left transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#6f4b92] ${active(view) ? "bg-[#dcd0eb] text-[#302439]" : "bg-transparent text-[#5e526d] hover:bg-[#ebe7f1]"}`;

    return (
        <aside
            class="flex h-full min-h-0 flex-col bg-[#f7f5fb] text-[#40364e]"
            aria-label="Agents sidebar"
        >
            <header class="flex h-[58px] shrink-0 items-center justify-between border-b border-[#dfdbe7] px-3">
                <div>
                    <h2 class="text-[1rem] font-extrabold tracking-[-0.025em] text-[#211c28]">
                        Agents
                    </h2>
                    <p class="mt-0.5 text-[0.55rem] font-medium text-[#897e94]">
                        Workspace operations
                    </p>
                </div>
                <button
                    class="grid h-8 w-8 place-items-center rounded-lg border border-[#d8d3df] bg-white text-[1rem] font-medium text-[#554a63] shadow-[0_1px_2px_rgb(43_29_41_/_4%)] hover:bg-[#f1edf5] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#6f4b92]"
                    type="button"
                    aria-label="Agent settings"
                >
                    ⚙
                </button>
            </header>

            <div class="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-3">
                <label class="flex h-8 items-center gap-2 rounded-[7px] border border-[#d8d3df] bg-white px-2.5 text-[#625671] shadow-[0_1px_2px_rgb(49_34_58_/_3%)] focus-within:border-[#8a68a5] focus-within:ring-2 focus-within:ring-[#8a68a5]/10">
                    <span class="text-[0.8rem]" aria-hidden="true">
                        ⌕
                    </span>
                    <input
                        class="min-w-0 flex-1 border-0 bg-transparent text-[0.69rem] text-[#31293a] outline-0 placeholder:text-[#81768e]"
                        type="search"
                        aria-label="Find an agent or run"
                        placeholder="Find an agent or run…"
                        value={query()}
                        onInput={(event) => setQuery(event.currentTarget.value)}
                    />
                </label>

                <nav class="mt-3" aria-label="Agent views">
                    <button
                        class={`${rowClass("overview")} h-9 font-bold`}
                        type="button"
                        aria-label="All agents"
                        aria-pressed={active("overview")}
                        onClick={() => props.onViewChange("overview")}
                    >
                        <span class="grid h-5 w-5 place-items-center rounded-[6px] bg-white/70 text-[0.7rem]">
                            ⌂
                        </span>
                        <span class="flex-1">All agents</span>
                        <span class="text-[0.55rem] font-extrabold text-[#84778f]">3 live</span>
                    </button>
                </nav>

                <section class="mt-4" aria-labelledby="agent-sidebar-agents">
                    <h3
                        class="px-2 text-[0.54rem] font-black uppercase tracking-[0.11em] text-[#8f8499]"
                        id="agent-sidebar-agents"
                    >
                        Your agents
                    </h3>
                    <div class="mt-1.5 flex flex-col gap-0.5">
                        <For each={visibleAgents()}>
                            {(agent) => (
                                <button
                                    class={`${rowClass(agent.id)} min-h-11 py-1.5`}
                                    type="button"
                                    aria-label={agent.name}
                                    aria-pressed={active(agent.id)}
                                    onClick={() => props.onViewChange(agent.id)}
                                >
                                    <Avatar
                                        backgroundClass={agent.avatarClass}
                                        initials={agent.initials}
                                        size="xs"
                                        type="bot"
                                    />
                                    <span class="min-w-0 flex-1">
                                        <span class="flex items-center gap-1.5 text-[0.68rem] font-extrabold">
                                            {agent.name}
                                            <span class="h-1.5 w-1.5 rounded-full bg-[#4bab66]" />
                                        </span>
                                        <span class="mt-0.5 block truncate text-[0.52rem] font-medium opacity-70">
                                            {agent.role}
                                        </span>
                                    </span>
                                    <span class="grid h-5 min-w-5 place-items-center rounded-full bg-[#e5deeb] px-1 text-[0.54rem] font-extrabold">
                                        {agent.count}
                                    </span>
                                </button>
                            )}
                        </For>
                    </div>
                </section>

                <div class="my-4 h-px bg-[#ddd8e4]" />

                <section aria-labelledby="agent-sidebar-work">
                    <h3
                        class="px-2 text-[0.54rem] font-black uppercase tracking-[0.11em] text-[#8f8499]"
                        id="agent-sidebar-work"
                    >
                        Work
                    </h3>
                    <div class="mt-1.5 flex flex-col gap-0.5">
                        <For each={visibleWork()}>
                            {(item) => (
                                <button
                                    class={`${rowClass(item.id)} h-8 text-[0.67rem] font-semibold`}
                                    type="button"
                                    aria-pressed={active(item.id)}
                                    onClick={() => props.onViewChange(item.id)}
                                >
                                    <span class="grid h-5 w-5 place-items-center rounded-[6px] bg-white/65 text-[0.62rem] font-black">
                                        {item.icon}
                                    </span>
                                    <span class="flex-1">{item.label}</span>
                                    <span class="text-[0.55rem] font-extrabold text-[#81758c]">
                                        {item.count}
                                    </span>
                                </button>
                            )}
                        </For>
                    </div>
                </section>
            </div>

            <footer class="shrink-0 border-t border-[#ded9e5] p-3">
                <div class="rounded-[8px] border border-[#d9d3df] bg-white p-2.5">
                    <div class="flex items-center justify-between text-[0.57rem] font-extrabold text-[#5b5066]">
                        <span>Agent capacity</span>
                        <span>3 / 4</span>
                    </div>
                    <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e8e3eb]">
                        <span class="block h-full w-3/4 rounded-full bg-[#6f5282]" />
                    </div>
                    <p class="mt-1.5 text-[0.51rem] leading-4 text-[#8a8093]">
                        One execution slot is available.
                    </p>
                </div>
            </footer>
        </aside>
    );
}
