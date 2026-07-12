import { splitProps, type JSX } from "solid-js";
import { Avatar } from "./Avatar";

export type MentionableAgent = {
    avatarClass: string;
    description: string;
    id: string;
    initials: string;
    name: string;
    status: "ready" | "working";
};

export type AgentMentionPickerProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, "onSelect"> & {
    agents: MentionableAgent[];
    onSelect: (agent: MentionableAgent) => void;
    query: string;
};

export function AgentMentionPicker(props: AgentMentionPickerProps) {
    const [local, rest] = splitProps(props, ["agents", "class", "onSelect", "query"]);
    const matchingAgents = () =>
        local.agents.filter((agent) =>
            agent.name.toLowerCase().includes(local.query.toLowerCase()),
        );

    return (
        <div
            {...rest}
            class={`w-[320px] overflow-hidden rounded-[11px] border border-[#d5ced8] bg-white shadow-[0_16px_36px_rgb(43_24_46_/_18%)] ${local.class ?? ""}`}
            data-rigged-ui="agent-mention-picker"
            id="agent-mention-picker"
            role="listbox"
            aria-label="Mention an agent"
        >
            <div class="grid h-[50px] content-center border-b border-[#e7e2e8] bg-[#faf8fb] px-3">
                <p class="text-[0.68rem] font-extrabold text-[#3d343d]">Delegate to an agent</p>
                <p class="mt-0.5 text-[0.58rem] text-[#8d848c]">
                    {local.query ? `Matching “${local.query}”` : "Choose an agent for this message"}
                </p>
            </div>

            <div class="p-1.5">
                {matchingAgents().length === 0 && (
                    <p class="grid h-[52px] place-items-center px-3 text-center text-[0.68rem] text-[#8b8389]">
                        No matching agents.
                    </p>
                )}

                {matchingAgents().map((agent) => (
                    <button
                        class="flex h-[52px] w-full items-center gap-2.5 rounded-[8px] border-0 bg-transparent px-2 text-left transition hover:bg-[#f0ebf3] focus:bg-[#eee7f2] focus:outline-none"
                        type="button"
                        role="option"
                        aria-label={agent.name}
                        aria-selected="false"
                        onClick={() => local.onSelect(agent)}
                    >
                        <Avatar
                            backgroundClass={agent.avatarClass}
                            initials={agent.initials}
                            size="sm"
                            type="bot"
                        />
                        <span class="min-w-0 flex-1">
                            <span class="flex items-center gap-2">
                                <span class="truncate text-[0.72rem] font-extrabold text-[#352d35]">
                                    {agent.name}
                                </span>
                                <span
                                    class={`h-1.5 w-1.5 rounded-full ${agent.status === "ready" ? "bg-[#45a968]" : "bg-[#5c83b6]"}`}
                                    data-rigged-ui="agent-status"
                                />
                            </span>
                            <span class="mt-0.5 block truncate text-[0.61rem] text-[#81777f]">
                                {agent.description}
                            </span>
                        </span>
                        <span class="shrink-0 text-[0.57rem] font-bold capitalize text-[#918790]">
                            {agent.status}
                        </span>
                    </button>
                ))}
            </div>
        </div>
    );
}
