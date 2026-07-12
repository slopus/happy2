import { For, Show, splitProps, type JSX } from "solid-js";
import { Avatar } from "./Avatar";

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

export type AgentRunCardProps = Omit<JSX.HTMLAttributes<HTMLElement>, "children" | "style"> & {
    expanded: boolean;
    onExpandedChange: (expanded: boolean) => void;
    onReviewedChange: (reviewed: boolean) => void;
    reviewed: boolean;
    run: AgentRun;
    style?: JSX.CSSProperties;
};

const statusStyles = {
    approved: "bg-[#e5f3e8] text-[#26713b]",
    complete: "bg-[#e5f3e8] text-[#26713b]",
    review: "bg-[#f3e7f5] text-[#773b7f]",
    working: "bg-[#e7eef9] text-[#355f91]",
} as const;

export function AgentRunCard(props: AgentRunCardProps) {
    const [local, rest] = splitProps(props, [
        "class",
        "expanded",
        "onExpandedChange",
        "onReviewedChange",
        "reviewed",
        "run",
        "style",
    ]);
    const status = () => (local.reviewed ? "approved" : local.run.status);
    const statusLabel = () => {
        if (local.reviewed) return "Reviewed";
        if (local.run.status === "review") return "Needs review";
        if (local.run.status === "working") return "Working";
        return "Complete";
    };
    const finishedSteps = () => local.run.steps.filter((step) => step.status === "done").length;

    return (
        <section
            {...rest}
            class={`mt-2.5 max-w-[680px] overflow-hidden rounded-[10px] border border-[#d9d2dc] bg-[#fbfafc] shadow-[0_2px_7px_rgb(51_32_55_/_5%)] ${local.class ?? ""}`}
            data-rigged-ui="agent-run-card"
            data-status={status()}
            style={{ "font-family": '"Rigged Manrope", sans-serif', ...local.style }}
            aria-label={`${local.run.agent} agent run: ${local.run.title}`}
        >
            <div
                class="flex h-[38px] items-center gap-2.5 px-3"
                data-rigged-ui="agent-run-card-header"
            >
                <Avatar
                    backgroundClass={local.run.avatarClass}
                    initials={local.run.initials}
                    size="xs"
                    type="bot"
                />
                <div class="min-w-0 flex-1">
                    <div class="flex h-3 min-w-0 items-center gap-2">
                        <h4
                            class="truncate text-[0.72rem] leading-3 font-extrabold text-[#352e35]"
                            data-rigged-ui="agent-run-card-title"
                        >
                            {local.run.title}
                        </h4>
                        <span
                            class={`h-4 shrink-0 rounded-[999px] px-2 text-[0.56rem] leading-4 font-extrabold ${statusStyles[status()]}`}
                            data-rigged-ui="agent-run-card-status"
                        >
                            {statusLabel()}
                        </span>
                    </div>
                    <p
                        class="mt-0.5 truncate text-[0.57rem] leading-[0.625rem] font-medium tracking-[0.01em] text-[#8a8189]"
                        data-rigged-ui="agent-run-card-branch"
                    >
                        {local.run.branch}
                    </p>
                </div>
                <button
                    class="h-7 w-[74px] shrink-0 rounded-md border-0 bg-transparent px-0 text-[0.62rem] leading-7 font-bold text-[#6c4c78] hover:bg-[#eee8f1] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#6f4b92]"
                    data-rigged-ui="agent-run-card-details-toggle"
                    type="button"
                    aria-expanded={local.expanded}
                    aria-label={`${local.expanded ? "Hide" : "View"} ${local.run.agent} run details`}
                    onClick={() => local.onExpandedChange(!local.expanded)}
                >
                    {local.expanded ? "Hide details" : "View details"}
                </button>
            </div>

            <div class="h-[35px] px-3" data-rigged-ui="agent-run-card-progress-region">
                <div
                    class="h-1.5 overflow-hidden rounded-[3px] bg-[#e7e2e9]"
                    data-rigged-ui="agent-run-card-progress"
                    role="progressbar"
                    aria-label={`${local.run.agent} run progress`}
                    aria-valuemin="0"
                    aria-valuemax="100"
                    aria-valuenow={local.run.progress}
                >
                    <span
                        class={`block h-full rounded-[3px] ${status() === "approved" || status() === "complete" ? "bg-[#4ca267]" : status() === "review" ? "bg-[#9760a0]" : "bg-[#5d81b3]"}`}
                        data-rigged-ui="agent-run-card-progress-fill"
                        style={{ width: `${local.run.progress}%` }}
                    />
                </div>
                <p
                    class="mt-1.5 h-3 text-[0.58rem] leading-3 font-medium text-[#8c838b]"
                    data-rigged-ui="agent-run-card-summary"
                >
                    {finishedSteps()} of {local.run.steps.length} steps · {local.run.files.length}{" "}
                    {local.run.files.length === 1 ? "file" : "files"}
                </p>
            </div>

            <Show when={local.expanded}>
                <div
                    class="border-t border-[#e3dee5] bg-white/80 px-3 py-2.5"
                    data-rigged-ui="agent-run-card-details"
                >
                    <ol class="flex flex-col gap-1.5" data-rigged-ui="agent-run-card-steps">
                        <For each={local.run.steps}>
                            {(step) => (
                                <li class="flex h-4 items-center gap-2 text-[0.65rem] leading-4 text-[#574f56]">
                                    <span
                                        class={`grid h-4 w-4 shrink-0 place-items-center rounded-[999px] text-[0.54rem] leading-4 font-black ${step.status === "done" ? "bg-[#dff0e3] text-[#2f7d45]" : step.status === "working" ? "bg-[#e4ebf6] text-[#456d9a]" : "bg-[#ece9ed] text-[#978f96]"}`}
                                        data-rigged-ui="agent-run-card-step-icon"
                                        data-status={step.status}
                                        aria-hidden="true"
                                    >
                                        <span
                                            class="block h-4 w-4 text-center"
                                            data-rigged-ui="agent-run-card-step-glyph"
                                            data-status={step.status}
                                        >
                                            <span
                                                class="rigged-agent-run-step-glyph-mark block h-4 w-4"
                                                data-status={step.status}
                                            >
                                                {step.status === "done"
                                                    ? "✓"
                                                    : step.status === "working"
                                                      ? "↻"
                                                      : "·"}
                                            </span>
                                        </span>
                                    </span>
                                    <span class={step.status === "pending" ? "text-[#938b92]" : ""}>
                                        {step.label}
                                    </span>
                                </li>
                            )}
                        </For>
                    </ol>

                    <div
                        class="mt-2.5 flex flex-wrap gap-1.5"
                        data-rigged-ui="agent-run-card-files"
                        aria-label="Changed files"
                    >
                        <For each={local.run.files}>
                            {(file) => (
                                <span
                                    class="h-[23px] rounded-md border border-[#ded8e1] bg-[#f7f4f8] px-2 text-[0.56rem] leading-[21px] font-medium tracking-[0.01em] text-[#695d6b]"
                                    data-rigged-ui="agent-run-card-file"
                                >
                                    {file}
                                </span>
                            )}
                        </For>
                    </div>

                    <Show when={local.run.status === "review" && !local.reviewed}>
                        <div class="mt-3 flex justify-end" data-rigged-ui="agent-run-card-review">
                            <button
                                class="h-7 rounded-md border border-[#76517e] bg-[#76517e] px-3 text-[0.62rem] leading-[26px] font-extrabold text-white shadow-[0_1px_2px_rgb(62_32_67_/_14%)] hover:bg-[#65436d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6f4b92]"
                                data-rigged-ui="agent-run-card-review-button"
                                type="button"
                                aria-label={`Approve ${local.run.agent} run`}
                                onClick={() => local.onReviewedChange(true)}
                            >
                                Mark reviewed
                            </button>
                        </div>
                    </Show>
                </div>
            </Show>
        </section>
    );
}
