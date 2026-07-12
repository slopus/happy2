import { createMemo, createSignal, For, Show } from "solid-js";
import type { AgentSidebarView } from "./AgentsSidebar";
import { Avatar } from "rigged-ui";

type AgentId = "forge" | "patch" | "scout";
type RunState = "complete" | "paused" | "queued" | "review" | "running";
type DelegationMode = "implement" | "plan" | "verify";

type AgentProfile = {
    avatarClass: string;
    id: AgentId;
    initials: string;
    name: string;
    role: string;
};

type WorkspaceRun = {
    agentId: AgentId;
    branch: string;
    id: string;
    mode: DelegationMode;
    progress: number;
    state: RunState;
    title: string;
    updated: string;
};

type AgentsWorkspaceProps = {
    onViewChange: (view: AgentSidebarView) => void;
    query: string;
    view: AgentSidebarView;
};

const agents: AgentProfile[] = [
    {
        id: "forge",
        name: "Forge",
        initials: "F",
        role: "Product engineering",
        avatarClass: "bg-[linear-gradient(145deg,#ef566d,#8056c7)]",
    },
    {
        id: "scout",
        name: "Scout",
        initials: "S",
        role: "Research & synthesis",
        avatarClass: "bg-[linear-gradient(145deg,#3296a4,#4d67bd)]",
    },
    {
        id: "patch",
        name: "Patch",
        initials: "P",
        role: "Verification & release",
        avatarClass: "bg-[linear-gradient(145deg,#d37c3e,#cf496e)]",
    },
];

const initialRuns: WorkspaceRun[] = [
    {
        id: "agent-phase-indicator",
        agentId: "forge",
        title: "Agent phase indicator",
        branch: "agent/forge/run-phase-status",
        state: "running",
        progress: 58,
        updated: "Now",
        mode: "verify",
    },
    {
        id: "activation-signals",
        agentId: "scout",
        title: "Activation drop-off signals",
        branch: "research/onboarding-activation",
        state: "running",
        progress: 42,
        updated: "1m",
        mode: "plan",
    },
    {
        id: "desktop-regression",
        agentId: "patch",
        title: "Desktop regression matrix",
        branch: "verify/desktop-min-height",
        state: "running",
        progress: 76,
        updated: "2m",
        mode: "verify",
    },
    {
        id: "onboarding-defaults",
        agentId: "forge",
        title: "Default workspace naming",
        branch: "agent/forge/workspace-naming",
        state: "review",
        progress: 100,
        updated: "8m",
        mode: "verify",
    },
    {
        id: "competitor-onboarding",
        agentId: "scout",
        title: "Onboarding pattern scan",
        branch: "research/onboarding-patterns",
        state: "queued",
        progress: 0,
        updated: "12m",
        mode: "plan",
    },
    {
        id: "chat-verification",
        agentId: "patch",
        title: "Chat interaction verification",
        branch: "agent/patch/chat-verification",
        state: "complete",
        progress: 100,
        updated: "18m",
        mode: "verify",
    },
];

const stateLabels: Record<RunState, string> = {
    complete: "Complete",
    paused: "Paused",
    queued: "Queued",
    review: "Needs review",
    running: "Running",
};

const stateStyles: Record<RunState, string> = {
    complete: "bg-[#e4f1e7] text-[#2f7542]",
    paused: "bg-[#eee9e2] text-[#776a58]",
    queued: "bg-[#ece9ef] text-[#6d6570]",
    review: "bg-[#f5e8d0] text-[#8a611c]",
    running: "bg-[#e5edf8] text-[#3b6596]",
};

const modeLabels: Record<DelegationMode, string> = {
    implement: "Implement",
    plan: "Plan only",
    verify: "Implement & verify",
};

function AgentLane(props: {
    agent: AgentProfile;
    currentRun?: WorkspaceRun;
    queuedCount: number;
    onToggleRun: (runId: string) => void;
}) {
    return (
        <article
            class="overflow-hidden rounded-[11px] border border-[#dcd7dd] bg-white shadow-[0_2px_8px_rgb(44_33_45_/_5%)]"
            aria-label={`${props.agent.name} agent lane`}
        >
            <div class="flex items-center gap-2.5 border-b border-[#ebe7eb] px-3.5 py-3">
                <Avatar
                    backgroundClass={props.agent.avatarClass}
                    initials={props.agent.initials}
                    size="sm"
                    type="bot"
                />
                <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                        <h3 class="text-[0.76rem] font-extrabold text-[#312c30]">
                            {props.agent.name}
                        </h3>
                        <span class="flex items-center gap-1 text-[0.54rem] font-bold text-[#398153]">
                            <span class="h-1.5 w-1.5 rounded-full bg-[#49a866]" /> online
                        </span>
                    </div>
                    <p class="mt-0.5 text-[0.58rem] font-medium text-[#8a8288]">
                        {props.agent.role}
                    </p>
                </div>
                <span class="rounded-full bg-[#f1eef2] px-2 py-1 text-[0.52rem] font-extrabold text-[#736a74]">
                    {props.queuedCount} queued
                </span>
            </div>

            <Show
                when={props.currentRun}
                fallback={
                    <p class="px-3.5 py-7 text-center text-[0.64rem] text-[#918991]">
                        Ready for a new delegation
                    </p>
                }
            >
                {(currentRun) => (
                    <div class="px-3.5 py-3">
                        <div class="flex items-start justify-between gap-2">
                            <div class="min-w-0">
                                <p class="text-[0.56rem] font-black uppercase tracking-[0.09em] text-[#938b92]">
                                    Current execution
                                </p>
                                <h4 class="mt-1 truncate text-[0.7rem] font-extrabold text-[#3b353a]">
                                    {currentRun().title}
                                </h4>
                                <p class="mt-0.5 truncate font-mono text-[0.53rem] text-[#918891]">
                                    {currentRun().branch}
                                </p>
                            </div>
                            <span
                                class={`shrink-0 rounded-full px-2 py-0.5 text-[0.52rem] font-extrabold ${stateStyles[currentRun().state]}`}
                            >
                                {stateLabels[currentRun().state]}
                            </span>
                        </div>

                        <div class="mt-3 flex items-center gap-2">
                            <div class="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[#ece8ed]">
                                <span
                                    class={`block h-full rounded-full transition-all duration-300 ${currentRun().state === "paused" ? "bg-[#a59a8c]" : "bg-[#587eaa]"}`}
                                    style={{ width: `${currentRun().progress}%` }}
                                />
                            </div>
                            <span class="w-7 text-right text-[0.54rem] font-extrabold tabular-nums text-[#756d74]">
                                {currentRun().progress}%
                            </span>
                        </div>

                        <div class="mt-3 flex items-center justify-between border-t border-[#eeebee] pt-2.5">
                            <span class="text-[0.54rem] font-bold text-[#8b838a]">
                                {modeLabels[currentRun().mode]}
                            </span>
                            <Show
                                when={
                                    currentRun().state === "running" ||
                                    currentRun().state === "paused"
                                }
                            >
                                <button
                                    class="h-7 rounded-md border border-[#d6d0d7] bg-white px-2.5 text-[0.57rem] font-extrabold text-[#5f5660] hover:bg-[#f3f0f3] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#6f4b92]"
                                    type="button"
                                    aria-label={`${currentRun().state === "paused" ? "Resume" : "Pause"} ${props.agent.name} current run`}
                                    onClick={() => props.onToggleRun(currentRun().id)}
                                >
                                    {currentRun().state === "paused" ? "Resume" : "Pause"}
                                </button>
                            </Show>
                        </div>
                    </div>
                )}
            </Show>
        </article>
    );
}

export function AgentsWorkspace(props: AgentsWorkspaceProps) {
    const [runs, setRuns] = createSignal<WorkspaceRun[]>(initialRuns);
    const [delegateOpen, setDelegateOpen] = createSignal(false);
    const [delegationTitle, setDelegationTitle] = createSignal("");
    const [delegationAgent, setDelegationAgent] = createSignal<AgentId>("forge");
    const [delegationMode, setDelegationMode] = createSignal<DelegationMode>("verify");

    const selectedAgentId = createMemo<AgentId | undefined>(() =>
        props.view.startsWith("agent-") ? (props.view.slice(6) as AgentId) : undefined,
    );
    const visibleAgents = createMemo(() =>
        selectedAgentId() ? agents.filter((agent) => agent.id === selectedAgentId()) : agents,
    );
    const visibleRuns = createMemo(() => {
        const normalizedQuery = props.query.trim().toLowerCase();
        return runs().filter((run) => {
            const matchesAgent = !selectedAgentId() || run.agentId === selectedAgentId();
            const matchesWorkView =
                props.view === "work-active"
                    ? run.state === "running" || run.state === "paused"
                    : props.view === "work-review"
                      ? run.state === "review"
                      : props.view === "work-queued"
                        ? run.state === "queued"
                        : props.view === "work-complete"
                          ? run.state === "complete"
                          : true;
            const agent = agents.find((profile) => profile.id === run.agentId)!;
            const matchesQuery =
                !normalizedQuery ||
                run.title.toLowerCase().includes(normalizedQuery) ||
                run.branch.toLowerCase().includes(normalizedQuery) ||
                agent.name.toLowerCase().includes(normalizedQuery);
            return matchesAgent && matchesWorkView && matchesQuery;
        });
    });
    const viewLabel = createMemo(() => {
        if (props.view === "overview") return "All agents";
        if (selectedAgentId()) return agents.find((agent) => agent.id === selectedAgentId())!.name;
        return {
            "work-active": "Active runs",
            "work-complete": "Completed today",
            "work-queued": "Queued",
            "work-review": "Awaiting you",
        }[props.view as Exclude<AgentSidebarView, "overview" | `agent-${AgentId}`>];
    });
    const runningCount = createMemo(() => runs().filter((run) => run.state === "running").length);
    const waitingCount = createMemo(() => runs().filter((run) => run.state === "review").length);
    const toggleRun = (runId: string) => {
        setRuns((current) =>
            current.map((run) =>
                run.id === runId && (run.state === "running" || run.state === "paused")
                    ? {
                          ...run,
                          state: run.state === "running" ? "paused" : "running",
                          updated: "Now",
                      }
                    : run,
            ),
        );
    };
    const markReviewed = (runId: string) => {
        setRuns((current) =>
            current.map((run) =>
                run.id === runId
                    ? { ...run, state: "complete", progress: 100, updated: "Now" }
                    : run,
            ),
        );
    };
    const currentRunFor = (agentId: AgentId) =>
        runs().find(
            (run) => run.agentId === agentId && (run.state === "running" || run.state === "paused"),
        ) ?? runs().find((run) => run.agentId === agentId && run.state !== "complete");
    const queuedCountFor = (agentId: AgentId) =>
        runs().filter(
            (run) => run.agentId === agentId && (run.state === "queued" || run.state === "review"),
        ).length;
    const closeDelegation = () => {
        setDelegateOpen(false);
        setDelegationTitle("");
        setDelegationAgent("forge");
        setDelegationMode("verify");
    };
    const createDelegation = () => {
        const title = delegationTitle().trim();
        if (!title) return;
        const agent = agents.find((profile) => profile.id === delegationAgent())!;
        setRuns((current) => [
            {
                id: `delegation-${Date.now()}`,
                agentId: agent.id,
                title,
                branch: `queued/${agent.id}/${title
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/^-|-$/g, "")}`,
                state: "queued",
                progress: 0,
                updated: "Now",
                mode: delegationMode(),
            },
            ...current,
        ]);
        props.onViewChange("overview");
        closeDelegation();
    };

    return (
        <section
            class="relative flex min-h-0 min-w-0 flex-1 flex-col bg-[#f6f4f6]"
            id="feature"
            aria-label="Agents workspace"
        >
            <header class="flex h-[72px] shrink-0 items-center justify-between border-b border-[#ded9df] bg-white px-5">
                <div>
                    <div class="flex items-center gap-2">
                        <h1 class="font-serif text-[1.35rem] font-semibold tracking-[-0.035em] text-[#2d282c]">
                            Agent command center
                        </h1>
                        <span class="flex items-center gap-1 rounded-full bg-[#e7f2e9] px-2 py-1 text-[0.53rem] font-extrabold text-[#357548]">
                            <span class="h-1.5 w-1.5 rounded-full bg-[#49a866]" /> Live
                        </span>
                    </div>
                    <p class="mt-1 text-[0.63rem] font-medium text-[#827a81]">
                        Direct parallel work across the Rigged workspace.
                    </p>
                </div>
                <button
                    class="h-8 rounded-[7px] border border-[#5e4164] bg-[#65456b] px-3.5 text-[0.63rem] font-extrabold text-white shadow-[0_2px_5px_rgb(55_31_60_/_15%)] hover:bg-[#54365a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6f4b92]"
                    type="button"
                    onClick={() => setDelegateOpen(true)}
                >
                    + Delegate work
                </button>
            </header>

            <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                <section
                    class="overflow-hidden rounded-[12px] bg-[#29262c] text-white shadow-[0_8px_20px_rgb(37_28_39_/_12%)]"
                    aria-label="Workspace pulse"
                >
                    <div class="grid grid-cols-[1.4fr_repeat(4,minmax(100px,0.65fr))] items-stretch">
                        <div class="flex flex-col justify-between border-r border-white/10 bg-[radial-gradient(circle_at_12%_20%,rgb(255_255_255_/_8%)_0_1px,transparent_1.5px)] [background-size:9px_9px] px-4 py-3">
                            <p class="text-[0.55rem] font-black uppercase tracking-[0.13em] text-white/48">
                                Workspace pulse
                            </p>
                            <p class="mt-2 max-w-[260px] text-[0.72rem] font-semibold leading-5 text-white/90">
                                Three agents working from one shared context.
                            </p>
                        </div>
                        <div class="border-r border-white/10 px-3 py-3">
                            <p class="text-[1.35rem] font-semibold tabular-nums tracking-[-0.04em]">
                                {runningCount().toString().padStart(2, "0")}
                            </p>
                            <p class="mt-1 text-[0.54rem] font-bold text-white/50">Running now</p>
                        </div>
                        <div class="border-r border-white/10 px-3 py-3">
                            <p class="text-[1.35rem] font-semibold tabular-nums tracking-[-0.04em]">
                                {waitingCount().toString().padStart(2, "0")}
                            </p>
                            <p class="mt-1 text-[0.54rem] font-bold text-white/50">Awaiting you</p>
                        </div>
                        <div class="border-r border-white/10 px-3 py-3">
                            <p class="text-[1.35rem] font-semibold tabular-nums tracking-[-0.04em]">
                                08
                            </p>
                            <p class="mt-1 text-[0.54rem] font-bold text-white/50">Done today</p>
                        </div>
                        <div class="px-3 py-3">
                            <p class="text-[1.35rem] font-semibold tabular-nums tracking-[-0.04em]">
                                21m
                            </p>
                            <p class="mt-1 text-[0.54rem] font-bold text-white/50">Time returned</p>
                        </div>
                    </div>
                </section>

                <div class="mt-4 flex items-center justify-between gap-4">
                    <div>
                        <h2 class="text-[0.74rem] font-extrabold text-[#393339]">Live execution</h2>
                        <p class="mt-0.5 text-[0.57rem] font-medium text-[#8a8289]">
                            Pause work without losing its place.
                        </p>
                    </div>
                    <div
                        class="flex items-center gap-2 rounded-[7px] border border-[#d9d4da] bg-white px-2.5 py-1.5"
                        aria-label="Current agent view"
                    >
                        <span class="text-[0.54rem] font-bold text-[#8a8189]">Showing</span>
                        <span class="text-[0.57rem] font-extrabold text-[#4a4249]">
                            {viewLabel()}
                        </span>
                        <Show when={props.view !== "overview"}>
                            <button
                                class="ml-1 grid h-4 w-4 place-items-center rounded-full border-0 bg-[#eee9ef] p-0 text-[0.65rem] leading-none text-[#776d76] hover:bg-[#e2dce3]"
                                type="button"
                                aria-label="Clear agent view"
                                onClick={() => props.onViewChange("overview")}
                            >
                                ×
                            </button>
                        </Show>
                    </div>
                </div>

                <div
                    class={`mt-2.5 grid gap-3 ${visibleAgents().length === 1 ? "grid-cols-[minmax(0,1fr)]" : "grid-cols-3 max-[1180px]:grid-cols-1"}`}
                >
                    <For each={visibleAgents()}>
                        {(agent) => (
                            <AgentLane
                                agent={agent}
                                currentRun={currentRunFor(agent.id)}
                                queuedCount={queuedCountFor(agent.id)}
                                onToggleRun={toggleRun}
                            />
                        )}
                    </For>
                </div>

                <section
                    class="mt-4 overflow-hidden rounded-[11px] border border-[#dcd7dd] bg-white shadow-[0_2px_8px_rgb(44_33_45_/_4%)]"
                    aria-labelledby="workspace-queue-heading"
                >
                    <div class="flex items-center justify-between border-b border-[#e6e2e6] px-3.5 py-3">
                        <div>
                            <h2
                                class="text-[0.72rem] font-extrabold text-[#393339]"
                                id="workspace-queue-heading"
                            >
                                Workspace queue
                            </h2>
                            <p class="mt-0.5 text-[0.56rem] font-medium text-[#8a8289]">
                                Every active, queued, and recently completed run.
                            </p>
                        </div>
                        <Show when={props.query.trim()}>
                            <span class="rounded-md bg-[#f0ebf3] px-2 py-1 text-[0.55rem] font-bold text-[#705d77]">
                                Filtering for “{props.query}”
                            </span>
                        </Show>
                    </div>

                    <div
                        class="grid grid-cols-[minmax(160px,1.6fr)_96px_88px_60px_70px] items-center gap-3 border-b border-[#eeebee] bg-[#faf9fa] px-3.5 py-2 text-[0.5rem] font-black uppercase tracking-[0.08em] text-[#989097]"
                        aria-hidden="true"
                    >
                        <span>Run</span>
                        <span>Agent</span>
                        <span>State</span>
                        <span>Progress</span>
                        <span class="text-right">Control</span>
                    </div>

                    <div aria-label="Agent runs">
                        <For
                            each={visibleRuns()}
                            fallback={
                                <p class="px-4 py-8 text-center text-[0.65rem] text-[#8d858c]">
                                    No runs match this view.
                                </p>
                            }
                        >
                            {(run) => {
                                const agent = agents.find((profile) => profile.id === run.agentId)!;
                                return (
                                    <article
                                        class="grid grid-cols-[minmax(160px,1.6fr)_96px_88px_60px_70px] items-center gap-3 border-b border-[#eeebee] px-3.5 py-2.5 last:border-b-0 hover:bg-[#fcfbfc]"
                                        aria-label={`${run.title} run`}
                                    >
                                        <div class="min-w-0">
                                            <h3 class="truncate text-[0.64rem] font-extrabold text-[#403940]">
                                                {run.title}
                                            </h3>
                                            <p class="mt-0.5 truncate font-mono text-[0.5rem] text-[#999098]">
                                                {run.branch}
                                            </p>
                                        </div>
                                        <div class="flex min-w-0 items-center gap-2">
                                            <Avatar
                                                backgroundClass={agent.avatarClass}
                                                initials={agent.initials}
                                                size="xs"
                                                type="bot"
                                            />
                                            <span class="truncate text-[0.58rem] font-bold text-[#5d555c]">
                                                {agent.name}
                                            </span>
                                        </div>
                                        <span
                                            class={`w-fit rounded-full px-2 py-0.5 text-[0.5rem] font-extrabold ${stateStyles[run.state]}`}
                                        >
                                            {stateLabels[run.state]}
                                        </span>
                                        <div>
                                            <span class="text-[0.55rem] font-extrabold tabular-nums text-[#696169]">
                                                {run.progress}%
                                            </span>
                                            <div class="mt-1 h-1 overflow-hidden rounded-full bg-[#ece8ed]">
                                                <span
                                                    class="block h-full rounded-full bg-[#6d7fa1]"
                                                    style={{ width: `${run.progress}%` }}
                                                />
                                            </div>
                                        </div>
                                        <div class="flex justify-end">
                                            <Show
                                                when={
                                                    run.state === "running" ||
                                                    run.state === "paused"
                                                }
                                            >
                                                <button
                                                    class="h-7 rounded-md border border-[#d8d2d9] bg-white px-2.5 text-[0.54rem] font-extrabold text-[#625961] hover:bg-[#f2eff2] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#6f4b92]"
                                                    type="button"
                                                    aria-label={`${run.state === "paused" ? "Resume" : "Pause"} ${run.title}`}
                                                    onClick={() => toggleRun(run.id)}
                                                >
                                                    {run.state === "paused" ? "Resume" : "Pause"}
                                                </button>
                                            </Show>
                                            <Show when={run.state === "review"}>
                                                <button
                                                    class="h-7 rounded-md border border-[#a97834] bg-[#f8edda] px-2.5 text-[0.54rem] font-extrabold text-[#805b22] hover:bg-[#f2e1c3] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#8b692f]"
                                                    type="button"
                                                    aria-label={`Mark ${run.title} reviewed`}
                                                    onClick={() => markReviewed(run.id)}
                                                >
                                                    Review
                                                </button>
                                            </Show>
                                            <Show when={run.state === "queued"}>
                                                <span class="text-[0.52rem] font-bold text-[#938b92]">
                                                    Waiting
                                                </span>
                                            </Show>
                                            <Show when={run.state === "complete"}>
                                                <span class="text-[0.52rem] font-extrabold text-[#4b895c]">
                                                    Done
                                                </span>
                                            </Show>
                                        </div>
                                    </article>
                                );
                            }}
                        </For>
                    </div>
                </section>
            </div>

            <Show when={delegateOpen()}>
                <div
                    class="absolute inset-0 z-30 grid place-items-center bg-[#2d2730]/28 px-6 backdrop-blur-[1px]"
                    role="presentation"
                >
                    <form
                        class="w-full max-w-[480px] overflow-hidden rounded-[13px] border border-[#cfc8d1] bg-white shadow-[0_22px_58px_rgb(42_27_45_/_24%)]"
                        role="dialog"
                        aria-label="Delegate work"
                        onSubmit={(event) => {
                            event.preventDefault();
                            createDelegation();
                        }}
                    >
                        <div class="flex items-start justify-between border-b border-[#e7e2e7] bg-[#faf9fa] px-4 py-3.5">
                            <div>
                                <h2 class="font-serif text-[1.05rem] font-semibold tracking-[-0.025em] text-[#322c31]">
                                    Delegate new work
                                </h2>
                                <p class="mt-1 text-[0.6rem] text-[#817980]">
                                    Create a scoped run and place it in the workspace queue.
                                </p>
                            </div>
                            <button
                                class="grid h-7 w-7 place-items-center rounded-md border-0 bg-transparent text-[1rem] text-[#817880] hover:bg-[#eee9ef] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#6f4b92]"
                                type="button"
                                aria-label="Close delegation"
                                onClick={closeDelegation}
                            >
                                ×
                            </button>
                        </div>

                        <div class="space-y-4 px-4 py-4">
                            <label class="block">
                                <span class="text-[0.58rem] font-black uppercase tracking-[0.08em] text-[#746b73]">
                                    Goal
                                </span>
                                <textarea
                                    class="mt-1.5 block min-h-[76px] w-full resize-none rounded-[8px] border border-[#cec7cf] bg-white px-3 py-2.5 text-[0.72rem] leading-5 text-[#383137] outline-none placeholder:text-[#a39ba1] focus:border-[#795880] focus:ring-2 focus:ring-[#795880]/10"
                                    aria-label="Delegation goal"
                                    placeholder="Describe the outcome this agent should produce…"
                                    value={delegationTitle()}
                                    onInput={(event) =>
                                        setDelegationTitle(event.currentTarget.value)
                                    }
                                />
                            </label>

                            <fieldset>
                                <legend class="text-[0.58rem] font-black uppercase tracking-[0.08em] text-[#746b73]">
                                    Assign to
                                </legend>
                                <div class="mt-1.5 grid grid-cols-3 gap-2">
                                    <For each={agents}>
                                        {(agent) => (
                                            <button
                                                class={`flex items-center gap-2 rounded-[8px] border px-2.5 py-2 text-left transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#6f4b92] ${delegationAgent() === agent.id ? "border-[#76517e] bg-[#f0eaf3]" : "border-[#d9d3da] bg-white hover:bg-[#f8f6f8]"}`}
                                                type="button"
                                                aria-label={`Assign to ${agent.name}`}
                                                aria-pressed={delegationAgent() === agent.id}
                                                onClick={() => setDelegationAgent(agent.id)}
                                            >
                                                <Avatar
                                                    backgroundClass={agent.avatarClass}
                                                    initials={agent.initials}
                                                    size="xs"
                                                    type="bot"
                                                />
                                                <span class="text-[0.6rem] font-extrabold text-[#4b434a]">
                                                    {agent.name}
                                                </span>
                                            </button>
                                        )}
                                    </For>
                                </div>
                            </fieldset>

                            <fieldset>
                                <legend class="text-[0.58rem] font-black uppercase tracking-[0.08em] text-[#746b73]">
                                    Execution scope
                                </legend>
                                <div class="mt-1.5 flex rounded-[8px] border border-[#d9d3da] bg-[#f7f5f7] p-1">
                                    <For each={["plan", "implement", "verify"] as DelegationMode[]}>
                                        {(mode) => (
                                            <button
                                                class={`h-8 flex-1 rounded-[6px] border-0 text-[0.58rem] font-extrabold transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#6f4b92] ${delegationMode() === mode ? "bg-white text-[#513b57] shadow-[0_1px_4px_rgb(47_32_49_/_10%)]" : "bg-transparent text-[#817880] hover:text-[#4e474d]"}`}
                                                type="button"
                                                aria-pressed={delegationMode() === mode}
                                                onClick={() => setDelegationMode(mode)}
                                            >
                                                {modeLabels[mode]}
                                            </button>
                                        )}
                                    </For>
                                </div>
                            </fieldset>
                        </div>

                        <div class="flex items-center justify-between border-t border-[#e7e2e7] bg-[#faf9fa] px-4 py-3">
                            <span class="text-[0.55rem] font-medium text-[#8c848b]">
                                The run starts queued and remains visible to everyone.
                            </span>
                            <button
                                class="h-8 rounded-[7px] border border-[#604166] bg-[#65456b] px-3.5 text-[0.61rem] font-extrabold text-white hover:bg-[#54365a] disabled:border-[#d7d1d8] disabled:bg-[#ded9df] disabled:text-[#a49ca3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6f4b92]"
                                type="submit"
                                disabled={!delegationTitle().trim()}
                            >
                                Start delegation
                            </button>
                        </div>
                    </form>
                </div>
            </Show>
        </section>
    );
}
