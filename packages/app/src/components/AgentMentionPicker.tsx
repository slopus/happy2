import { Avatar } from "rigged-ui";

export type MentionableAgent = {
    avatarClass: string;
    description: string;
    id: string;
    initials: string;
    name: string;
    status: "ready" | "working";
};

type AgentMentionPickerProps = {
    agents: MentionableAgent[];
    onSelect: (agent: MentionableAgent) => void;
    query: string;
};

export function AgentMentionPicker(props: AgentMentionPickerProps) {
    const matchingAgents = () =>
        props.agents.filter((agent) =>
            agent.name.toLowerCase().includes(props.query.toLowerCase()),
        );

    return (
        <div
            class="absolute bottom-[calc(100%+8px)] left-0 z-20 w-[320px] overflow-hidden rounded-[11px] border border-[#d5ced8] bg-white shadow-[0_16px_36px_rgb(43_24_46_/_18%)]"
            id="agent-mention-picker"
            role="listbox"
            aria-label="Mention an agent"
        >
            <div class="border-b border-[#e7e2e8] bg-[#faf8fb] px-3 py-2">
                <p class="text-[0.68rem] font-extrabold text-[#3d343d]">Delegate to an agent</p>
                <p class="mt-0.5 text-[0.58rem] text-[#8d848c]">
                    {props.query ? `Matching “${props.query}”` : "Choose an agent for this message"}
                </p>
            </div>

            <div class="p-1.5">
                {matchingAgents().length === 0 && (
                    <p class="px-3 py-5 text-center text-[0.68rem] text-[#8b8389]">
                        No matching agents.
                    </p>
                )}

                {matchingAgents().map((agent) => (
                    <button
                        class="flex w-full items-center gap-2.5 rounded-[8px] border-0 bg-transparent px-2 py-2 text-left transition hover:bg-[#f0ebf3] focus:bg-[#eee7f2] focus:outline-none"
                        type="button"
                        role="option"
                        aria-label={agent.name}
                        aria-selected="false"
                        onClick={() => props.onSelect(agent)}
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
