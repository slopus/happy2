import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { Avatar, type AvatarType } from "rigged-ui";
import type { TaskCounts, TaskView } from "./TasksSidebar";

type TaskStatus = "complete" | "in-progress" | "planned" | "review";
type GoalId = "onboarding" | "reliability" | "transparency";
type OwnerId = "forge" | "maya" | "patch" | "scout" | "steve";

type TaskOwner = {
    avatarClass: string;
    id: OwnerId;
    initials: string;
    name: string;
    type: AvatarType;
};

type WorkspaceTask = {
    blocked?: boolean;
    due: string;
    goalId: GoalId;
    id: string;
    ownerId: OwnerId;
    priority: "High" | "Low" | "Medium";
    status: TaskStatus;
    title: string;
};

type TasksWorkspaceProps = {
    onCountsChange: (counts: TaskCounts) => void;
    onViewChange: (view: TaskView) => void;
    query: string;
    view: TaskView;
};

const owners: TaskOwner[] = [
    {
        id: "steve",
        name: "Steve",
        initials: "ST",
        type: "human",
        avatarClass: "bg-[linear-gradient(145deg,#3ca8a4,#4b5fb0_52%,#d14c78)]",
    },
    {
        id: "maya",
        name: "Maya Chen",
        initials: "MC",
        type: "human",
        avatarClass: "bg-[linear-gradient(145deg,#cf7548,#e9a752)]",
    },
    {
        id: "forge",
        name: "Forge",
        initials: "F",
        type: "bot",
        avatarClass: "bg-[linear-gradient(145deg,#ef566d,#8056c7)]",
    },
    {
        id: "scout",
        name: "Scout",
        initials: "S",
        type: "bot",
        avatarClass: "bg-[linear-gradient(145deg,#3296a4,#4d67bd)]",
    },
    {
        id: "patch",
        name: "Patch",
        initials: "P",
        type: "bot",
        avatarClass: "bg-[linear-gradient(145deg,#d37c3e,#cf496e)]",
    },
];

const goalNames: Record<GoalId, string> = {
    onboarding: "Frictionless onboarding",
    reliability: "Desktop reliability",
    transparency: "Agent transparency",
};

const initialTasks: WorkspaceTask[] = [
    {
        id: "workspace-naming",
        title: "Remove the workspace naming step",
        goalId: "onboarding",
        ownerId: "forge",
        status: "review",
        priority: "High",
        due: "Today",
    },
    {
        id: "migration-notes",
        title: "Write migration rollback notes",
        goalId: "onboarding",
        ownerId: "steve",
        status: "planned",
        priority: "Medium",
        due: "Today",
    },
    {
        id: "activation-signals",
        title: "Analyze activation drop-off signals",
        goalId: "onboarding",
        ownerId: "scout",
        status: "in-progress",
        priority: "High",
        due: "Tomorrow",
    },
    {
        id: "phase-indicator",
        title: "Build the agent phase indicator",
        goalId: "transparency",
        ownerId: "forge",
        status: "in-progress",
        priority: "High",
        due: "Today",
    },
    {
        id: "approval-audit",
        title: "Define the approval audit record",
        goalId: "transparency",
        ownerId: "maya",
        status: "planned",
        priority: "Medium",
        due: "Fri",
        blocked: true,
    },
    {
        id: "minimum-height",
        title: "Verify the minimum desktop height",
        goalId: "reliability",
        ownerId: "patch",
        status: "review",
        priority: "Medium",
        due: "Today",
    },
    {
        id: "recovery-fixtures",
        title: "Add workspace recovery fixtures",
        goalId: "reliability",
        ownerId: "patch",
        status: "planned",
        priority: "Low",
        due: "Fri",
    },
    {
        id: "bottom-chat",
        title: "Ship bottom-anchored chat",
        goalId: "reliability",
        ownerId: "forge",
        status: "complete",
        priority: "High",
        due: "Done",
    },
];

const columns: Array<{ id: TaskStatus; label: string; accent: string }> = [
    { id: "planned", label: "Planned", accent: "bg-[#a89a8c]" },
    { id: "in-progress", label: "In progress", accent: "bg-[#557da8]" },
    { id: "review", label: "Review", accent: "bg-[#b17a34]" },
    { id: "complete", label: "Complete", accent: "bg-[#4c9561]" },
];

const priorityStyles = {
    High: "bg-[#f5e3e0] text-[#9b4d44]",
    Medium: "bg-[#f4ead7] text-[#89621e]",
    Low: "bg-[#e9edf1] text-[#687584]",
};

export function TasksWorkspace(props: TasksWorkspaceProps) {
    const [tasks, setTasks] = createSignal<WorkspaceTask[]>(initialTasks);
    const [createOpen, setCreateOpen] = createSignal(false);
    const [newTitle, setNewTitle] = createSignal("");
    const [newGoal, setNewGoal] = createSignal<GoalId>("onboarding");
    const [newOwner, setNewOwner] = createSignal<OwnerId>("forge");

    const selectedGoal = () =>
        props.view.startsWith("goal-") ? (props.view.slice(5) as GoalId) : undefined;
    const visibleTasks = createMemo(() => {
        const normalizedQuery = props.query.trim().toLowerCase();
        return tasks().filter((task) => {
            const owner = owners.find((candidate) => candidate.id === task.ownerId)!;
            const matchesView =
                props.view === "mine"
                    ? task.ownerId === "steve"
                    : props.view === "agents"
                      ? owner.type === "bot"
                      : props.view === "blocked"
                        ? task.blocked
                        : props.view === "complete"
                          ? task.status === "complete"
                          : selectedGoal()
                            ? task.goalId === selectedGoal()
                            : true;
            const matchesQuery =
                !normalizedQuery ||
                `${task.title} ${owner.name} ${goalNames[task.goalId]}`
                    .toLowerCase()
                    .includes(normalizedQuery);
            return matchesView && matchesQuery;
        });
    });
    const activeCount = createMemo(
        () => tasks().filter((task) => task.status === "in-progress").length,
    );
    const reviewCount = createMemo(() => tasks().filter((task) => task.status === "review").length);
    const blockedCount = createMemo(() => tasks().filter((task) => task.blocked).length);
    createEffect(() => {
        const currentTasks = tasks();
        props.onCountsChange({
            all: currentTasks.length,
            mine: currentTasks.filter((task) => task.ownerId === "steve").length,
            agents: currentTasks.filter(
                (task) => owners.find((owner) => owner.id === task.ownerId)!.type === "bot",
            ).length,
            blocked: currentTasks.filter((task) => task.blocked).length,
            complete: currentTasks.filter((task) => task.status === "complete").length,
        });
    });
    const viewLabel = () => {
        if (selectedGoal()) return goalNames[selectedGoal()!];
        return {
            all: "All work",
            agents: "Agent-owned",
            blocked: "Blocked",
            complete: "Completed",
            mine: "My tasks",
        }[props.view as Exclude<TaskView, `goal-${GoalId}`>];
    };
    const moveTask = (taskId: string, status: TaskStatus) => {
        setTasks((current) =>
            current.map((task) =>
                task.id === taskId
                    ? { ...task, status, blocked: status === "planned" ? task.blocked : false }
                    : task,
            ),
        );
    };
    const nextStatus = (status: TaskStatus): TaskStatus =>
        status === "planned"
            ? "in-progress"
            : status === "in-progress"
              ? "review"
              : status === "review"
                ? "complete"
                : "planned";
    const actionLabel = (task: WorkspaceTask) =>
        task.status === "planned"
            ? `Start ${task.title}`
            : task.status === "in-progress"
              ? `Send ${task.title} to review`
              : task.status === "review"
                ? `Complete ${task.title}`
                : `Reopen ${task.title}`;
    const createTask = () => {
        const title = newTitle().trim();
        if (!title) return;
        setTasks((current) => [
            {
                id: `task-${Date.now()}`,
                title,
                goalId: newGoal(),
                ownerId: newOwner(),
                status: "planned",
                priority: "Medium",
                due: "Unscheduled",
            },
            ...current,
        ]);
        props.onViewChange("all");
        setNewTitle("");
        setNewGoal("onboarding");
        setNewOwner("forge");
        setCreateOpen(false);
    };

    return (
        <section
            class="relative flex min-h-0 min-w-0 flex-1 flex-col bg-[#f5f3f0]"
            id="feature"
            aria-label="Tasks workspace"
        >
            <header class="flex h-[72px] shrink-0 items-center justify-between border-b border-[#ded9d3] bg-white px-5">
                <div>
                    <div class="flex items-center gap-2.5">
                        <h1 class="font-serif text-[1.35rem] font-semibold tracking-[-0.035em] text-[#302a25]">
                            Work board
                        </h1>
                        <span class="rounded-full bg-[#ece4dc] px-2 py-1 text-[0.52rem] font-extrabold text-[#745d4b]">
                            {viewLabel()}
                        </span>
                    </div>
                    <p class="mt-1 text-[0.62rem] font-medium text-[#857d76]">
                        Coordinate goals across people and agents.
                    </p>
                </div>
                <button
                    class="h-8 rounded-[7px] border border-[#70513b] bg-[#79563e] px-3.5 text-[0.62rem] font-extrabold text-white shadow-[0_2px_5px_rgb(74_49_32_/_15%)] hover:bg-[#684631] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#79563e]"
                    type="button"
                    onClick={() => setCreateOpen(true)}
                >
                    + Add task
                </button>
            </header>

            <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                <section
                    class="grid grid-cols-[1.4fr_repeat(4,minmax(100px,0.65fr))] overflow-hidden rounded-[11px] border border-[#ddd6ce] bg-white shadow-[0_3px_10px_rgb(53_43_34_/_5%)]"
                    aria-label="Task pulse"
                >
                    <div class="border-r border-[#e5dfd8] bg-[#2f2b27] px-4 py-3 text-white">
                        <p class="text-[0.53rem] font-black uppercase tracking-[0.12em] text-white/45">
                            Weekly intent
                        </p>
                        <p class="mt-2 text-[0.7rem] font-semibold leading-5">
                            Ship work that removes friction and earns trust.
                        </p>
                    </div>
                    <div class="border-r border-[#e7e1da] px-3 py-3">
                        <p class="text-[1.25rem] font-semibold tabular-nums text-[#39322c]">
                            {tasks().length.toString().padStart(2, "0")}
                        </p>
                        <p class="mt-1 text-[0.52rem] font-bold text-[#91877e]">Total tasks</p>
                    </div>
                    <div class="border-r border-[#e7e1da] px-3 py-3">
                        <p class="text-[1.25rem] font-semibold tabular-nums text-[#4e739a]">
                            {activeCount().toString().padStart(2, "0")}
                        </p>
                        <p class="mt-1 text-[0.52rem] font-bold text-[#91877e]">In progress</p>
                    </div>
                    <div class="border-r border-[#e7e1da] px-3 py-3">
                        <p class="text-[1.25rem] font-semibold tabular-nums text-[#a06c29]">
                            {reviewCount().toString().padStart(2, "0")}
                        </p>
                        <p class="mt-1 text-[0.52rem] font-bold text-[#91877e]">In review</p>
                    </div>
                    <div class="px-3 py-3">
                        <p class="text-[1.25rem] font-semibold tabular-nums text-[#9b4d44]">
                            {blockedCount().toString().padStart(2, "0")}
                        </p>
                        <p class="mt-1 text-[0.52rem] font-bold text-[#91877e]">Blocked</p>
                    </div>
                </section>

                <div class="mt-4 flex items-end justify-between">
                    <div>
                        <h2 class="text-[0.74rem] font-extrabold text-[#3e3832]">
                            Execution ledger
                        </h2>
                        <p class="mt-0.5 text-[0.57rem] text-[#8c837b]">
                            Advance work when its outcome is ready.
                        </p>
                    </div>
                    <Show when={props.view !== "all"}>
                        <button
                            class="rounded-md border border-[#d8d1ca] bg-white px-2.5 py-1.5 text-[0.55rem] font-extrabold text-[#6a5f56] hover:bg-[#f0ece7]"
                            type="button"
                            onClick={() => props.onViewChange("all")}
                        >
                            Clear view
                        </button>
                    </Show>
                </div>

                <div
                    class="mt-2.5 grid grid-cols-4 gap-3 max-[1180px]:grid-cols-1"
                    aria-label="Task board"
                >
                    <For each={columns}>
                        {(column) => {
                            const columnTasks = () =>
                                visibleTasks().filter((task) => task.status === column.id);
                            return (
                                <section
                                    class="min-w-0 rounded-[10px] border border-[#ddd7d0] bg-[#eeeae5]/75 p-2"
                                    aria-label={`${column.label} tasks`}
                                >
                                    <header class="flex h-7 items-center gap-2 px-1">
                                        <span class={`h-2 w-2 rounded-full ${column.accent}`} />
                                        <h3 class="text-[0.61rem] font-extrabold text-[#554d46]">
                                            {column.label}
                                        </h3>
                                        <span class="ml-auto rounded-full bg-white px-1.5 py-0.5 text-[0.48rem] font-bold text-[#887e75]">
                                            {columnTasks().length}
                                        </span>
                                    </header>
                                    <div class="mt-1.5 flex flex-col gap-2">
                                        <For
                                            each={columnTasks()}
                                            fallback={
                                                <div class="grid min-h-[68px] place-items-center rounded-[8px] border border-dashed border-[#d7d0c9] text-[0.52rem] font-medium text-[#9b9188]">
                                                    No tasks
                                                </div>
                                            }
                                        >
                                            {(task) => {
                                                const owner = owners.find(
                                                    (candidate) => candidate.id === task.ownerId,
                                                )!;
                                                return (
                                                    <article
                                                        class="rounded-[9px] border border-[#d8d1ca] bg-white p-2.5 shadow-[0_2px_6px_rgb(48_39_31_/_5%)]"
                                                        aria-label={`${task.title} task`}
                                                    >
                                                        <div class="flex items-start justify-between gap-2">
                                                            <span
                                                                class={`rounded-full px-1.5 py-0.5 text-[0.47rem] font-extrabold ${priorityStyles[task.priority]}`}
                                                            >
                                                                {task.priority}
                                                            </span>
                                                            <Show when={task.blocked}>
                                                                <span class="rounded-full bg-[#f4dddd] px-1.5 py-0.5 text-[0.47rem] font-extrabold text-[#984848]">
                                                                    Blocked
                                                                </span>
                                                            </Show>
                                                        </div>
                                                        <h4 class="mt-2 text-[0.64rem] font-extrabold leading-4 text-[#423b35]">
                                                            {task.title}
                                                        </h4>
                                                        <p class="mt-1 text-[0.5rem] font-semibold text-[#938980]">
                                                            {goalNames[task.goalId]}
                                                        </p>
                                                        <div class="mt-2.5 flex items-center gap-1.5 border-t border-[#eee9e4] pt-2">
                                                            <Avatar
                                                                backgroundClass={owner.avatarClass}
                                                                initials={owner.initials}
                                                                size="xs"
                                                                type={owner.type}
                                                            />
                                                            <span class="min-w-0 flex-1 truncate text-[0.52rem] font-bold text-[#665d55]">
                                                                {owner.name}
                                                            </span>
                                                            <span class="text-[0.48rem] font-medium text-[#948a81]">
                                                                {task.due}
                                                            </span>
                                                        </div>
                                                        <button
                                                            class="mt-2 h-7 w-full rounded-md border border-[#d8d1ca] bg-[#faf8f6] text-[0.53rem] font-extrabold text-[#655b52] hover:border-[#bda995] hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#8b6b50]"
                                                            type="button"
                                                            aria-label={actionLabel(task)}
                                                            onClick={() =>
                                                                moveTask(
                                                                    task.id,
                                                                    nextStatus(task.status),
                                                                )
                                                            }
                                                        >
                                                            {task.status === "planned"
                                                                ? "Start"
                                                                : task.status === "in-progress"
                                                                  ? "Send to review"
                                                                  : task.status === "review"
                                                                    ? "Complete"
                                                                    : "Reopen"}
                                                        </button>
                                                    </article>
                                                );
                                            }}
                                        </For>
                                    </div>
                                </section>
                            );
                        }}
                    </For>
                </div>
            </div>

            <Show when={createOpen()}>
                <div
                    class="absolute inset-0 z-30 grid place-items-center bg-[#2d2824]/28 px-6 backdrop-blur-[1px]"
                    role="presentation"
                >
                    <form
                        class="w-full max-w-[480px] overflow-hidden rounded-[13px] border border-[#d1c9c1] bg-white shadow-[0_22px_58px_rgb(42_32_25_/_24%)]"
                        role="dialog"
                        aria-label="Add task"
                        onSubmit={(event) => {
                            event.preventDefault();
                            createTask();
                        }}
                    >
                        <div class="flex items-start justify-between border-b border-[#e7e1db] bg-[#fbfaf8] px-4 py-3.5">
                            <div>
                                <h2 class="font-serif text-[1.05rem] font-semibold text-[#352f2a]">
                                    Add work to the board
                                </h2>
                                <p class="mt-1 text-[0.59rem] text-[#877e76]">
                                    Assign a clear outcome to a person or agent.
                                </p>
                            </div>
                            <button
                                class="grid h-7 w-7 place-items-center rounded-md border-0 bg-transparent text-[1rem] text-[#857b73] hover:bg-[#eee9e4]"
                                type="button"
                                aria-label="Close task creation"
                                onClick={() => setCreateOpen(false)}
                            >
                                ×
                            </button>
                        </div>
                        <div class="space-y-4 px-4 py-4">
                            <label class="block">
                                <span class="text-[0.56rem] font-black uppercase tracking-[0.08em] text-[#796f66]">
                                    Outcome
                                </span>
                                <textarea
                                    class="mt-1.5 block min-h-[72px] w-full resize-none rounded-[8px] border border-[#d0c8c0] px-3 py-2.5 text-[0.7rem] leading-5 text-[#3d3630] outline-none placeholder:text-[#9d938a] focus:border-[#987253] focus:ring-2 focus:ring-[#987253]/10"
                                    aria-label="Task outcome"
                                    placeholder="What should be true when this task is done?"
                                    value={newTitle()}
                                    onInput={(event) => setNewTitle(event.currentTarget.value)}
                                />
                            </label>
                            <fieldset>
                                <legend class="text-[0.56rem] font-black uppercase tracking-[0.08em] text-[#796f66]">
                                    Goal
                                </legend>
                                <div class="mt-1.5 grid grid-cols-3 gap-2">
                                    <For
                                        each={Object.entries(goalNames) as Array<[GoalId, string]>}
                                    >
                                        {([id, label]) => (
                                            <button
                                                class={`min-h-10 rounded-[7px] border px-2 text-[0.54rem] font-extrabold leading-4 ${newGoal() === id ? "border-[#987253] bg-[#f0e5dc] text-[#5c4431]" : "border-[#ddd6cf] bg-white text-[#70665e] hover:bg-[#f8f5f2]"}`}
                                                type="button"
                                                aria-pressed={newGoal() === id}
                                                onClick={() => setNewGoal(id)}
                                            >
                                                {label}
                                            </button>
                                        )}
                                    </For>
                                </div>
                            </fieldset>
                            <fieldset>
                                <legend class="text-[0.56rem] font-black uppercase tracking-[0.08em] text-[#796f66]">
                                    Owner
                                </legend>
                                <div class="mt-1.5 grid grid-cols-5 gap-1.5">
                                    <For each={owners}>
                                        {(owner) => (
                                            <button
                                                class={`flex flex-col items-center gap-1.5 rounded-[7px] border px-1 py-2 ${newOwner() === owner.id ? "border-[#987253] bg-[#f0e5dc]" : "border-[#ddd6cf] bg-white hover:bg-[#f8f5f2]"}`}
                                                type="button"
                                                aria-label={`Assign task to ${owner.name}`}
                                                aria-pressed={newOwner() === owner.id}
                                                onClick={() => setNewOwner(owner.id)}
                                            >
                                                <Avatar
                                                    backgroundClass={owner.avatarClass}
                                                    initials={owner.initials}
                                                    size="xs"
                                                    type={owner.type}
                                                />
                                                <span class="truncate text-[0.5rem] font-extrabold text-[#665c54]">
                                                    {owner.name.split(" ")[0]}
                                                </span>
                                            </button>
                                        )}
                                    </For>
                                </div>
                            </fieldset>
                        </div>
                        <div class="flex justify-end border-t border-[#e7e1db] bg-[#fbfaf8] px-4 py-3">
                            <button
                                class="h-8 rounded-[7px] border border-[#70513b] bg-[#79563e] px-3.5 text-[0.6rem] font-extrabold text-white hover:bg-[#684631] disabled:border-[#d8d1ca] disabled:bg-[#ded9d4]"
                                type="submit"
                                disabled={!newTitle().trim()}
                            >
                                Add to planned
                            </button>
                        </div>
                    </form>
                </div>
            </Show>
        </section>
    );
}
