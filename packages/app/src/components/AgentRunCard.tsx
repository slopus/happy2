import { createSignal } from "solid-js";
import { Avatar } from "rigged-ui";

export type AgentRunStep = {
    label: string;
    status: "done" | "pending" | "working";
};

export type AgentRun = {
    agent: string;
    avatarClass: string;
    branch: string;
    files: string[];
    initials: string;
    progress: number;
    status: "complete" | "review" | "working";
    steps: AgentRunStep[];
    title: string;
};

type AgentRunCardProps = {
    run: AgentRun;
};

const statusStyles = {
    approved: "bg-[#e5f3e8] text-[#26713b]",
    complete: "bg-[#e5f3e8] text-[#26713b]",
    review: "bg-[#f3e7f5] text-[#773b7f]",
    working: "bg-[#e7eef9] text-[#355f91]",
};

export function AgentRunCard(props: AgentRunCardProps) {
    const [expanded, setExpanded] = createSignal(false);
    const [approved, setApproved] = createSignal(false);
    const status = () => (approved() ? "approved" : props.run.status);
    const statusLabel = () => {
        if (approved()) return "Reviewed";
        if (props.run.status === "review") return "Needs review";
        if (props.run.status === "working") return "Working";
        return "Complete";
    };
    const finishedSteps = () => props.run.steps.filter((step) => step.status === "done").length;

    return (
        <section
            class="mt-2.5 max-w-[680px] overflow-hidden rounded-[10px] border border-[#d9d2dc] bg-[#fbfafc] shadow-[0_2px_7px_rgb(51_32_55_/_5%)]"
            aria-label={`${props.run.agent} agent run: ${props.run.title}`}
        >
            <div class="flex items-center gap-2.5 px-3 py-2.5">
                <Avatar
                    backgroundClass={props.run.avatarClass}
                    initials={props.run.initials}
                    size="xs"
                    type="bot"
                />
                <div class="min-w-0 flex-1">
                    <div class="flex min-w-0 items-center gap-2">
                        <h4 class="truncate text-[0.72rem] font-extrabold text-[#352e35]">
                            {props.run.title}
                        </h4>
                        <span
                            class={`shrink-0 rounded-full px-2 py-0.5 text-[0.56rem] font-extrabold ${statusStyles[status()]}`}
                        >
                            {statusLabel()}
                        </span>
                    </div>
                    <p class="mt-0.5 truncate font-mono text-[0.57rem] text-[#8a8189]">
                        {props.run.branch}
                    </p>
                </div>
                <button
                    class="rounded-md border-0 bg-transparent px-2 py-1 text-[0.62rem] font-bold text-[#6c4c78] hover:bg-[#eee8f1] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#6f4b92]"
                    type="button"
                    aria-expanded={expanded()}
                    aria-label={`${expanded() ? "Hide" : "View"} ${props.run.agent} run details`}
                    onClick={() => setExpanded((current) => !current)}
                >
                    {expanded() ? "Hide details" : "View details"}
                </button>
            </div>

            <div class="px-3 pb-2.5">
                <div
                    class="h-1.5 overflow-hidden rounded-full bg-[#e7e2e9]"
                    role="progressbar"
                    aria-label={`${props.run.agent} run progress`}
                    aria-valuemin="0"
                    aria-valuemax="100"
                    aria-valuenow={props.run.progress}
                >
                    <span
                        class={`block h-full rounded-full transition-all ${status() === "approved" || status() === "complete" ? "bg-[#4ca267]" : status() === "review" ? "bg-[#9760a0]" : "bg-[#5d81b3]"}`}
                        style={{ width: `${props.run.progress}%` }}
                    />
                </div>
                <p class="mt-1.5 text-[0.58rem] font-medium text-[#8c838b]">
                    {finishedSteps()} of {props.run.steps.length} steps · {props.run.files.length}{" "}
                    {props.run.files.length === 1 ? "file" : "files"}
                </p>
            </div>

            {expanded() && (
                <div class="border-t border-[#e3dee5] bg-white/80 px-3 py-2.5">
                    <ol class="flex flex-col gap-1.5" aria-label="Run steps">
                        {props.run.steps.map((step) => (
                            <li class="flex items-center gap-2 text-[0.65rem] text-[#574f56]">
                                <span
                                    class={`grid h-4 w-4 shrink-0 place-items-center rounded-full text-[0.54rem] font-black ${step.status === "done" ? "bg-[#dff0e3] text-[#2f7d45]" : step.status === "working" ? "bg-[#e4ebf6] text-[#456d9a]" : "bg-[#ece9ed] text-[#978f96]"}`}
                                    aria-hidden="true"
                                >
                                    {step.status === "done"
                                        ? "✓"
                                        : step.status === "working"
                                          ? "↻"
                                          : "·"}
                                </span>
                                <span class={step.status === "pending" ? "text-[#938b92]" : ""}>
                                    {step.label}
                                </span>
                            </li>
                        ))}
                    </ol>

                    <div class="mt-2.5 flex flex-wrap gap-1.5" aria-label="Changed files">
                        {props.run.files.map((file) => (
                            <span class="rounded-md border border-[#ded8e1] bg-[#f7f4f8] px-2 py-1 font-mono text-[0.56rem] text-[#695d6b]">
                                {file}
                            </span>
                        ))}
                    </div>

                    {props.run.status === "review" && !approved() && (
                        <div class="mt-3 flex justify-end">
                            <button
                                class="h-7 rounded-md border border-[#76517e] bg-[#76517e] px-3 text-[0.62rem] font-extrabold text-white shadow-[0_1px_2px_rgb(62_32_67_/_14%)] hover:bg-[#65436d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6f4b92]"
                                type="button"
                                aria-label={`Approve ${props.run.agent} run`}
                                onClick={() => setApproved(true)}
                            >
                                Mark reviewed
                            </button>
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}
