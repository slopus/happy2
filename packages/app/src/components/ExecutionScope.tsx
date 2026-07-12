import type { MentionableAgent } from "rigged-ui";
import { Avatar } from "rigged-ui";

export type ExecutionMode = "discuss" | "implement" | "plan" | "verify";

export type Delegation = {
    agentId: string;
    agentName: string;
    avatarClass: string;
    initials: string;
    mode: ExecutionMode;
    modeLabel: string;
    permissions: string[];
};

type ExecutionModeOption = {
    description: string;
    id: ExecutionMode;
    label: string;
    permissions: string[];
};

type ExecutionScopePickerProps = {
    onDone: () => void;
    onSelect: (mode: ExecutionMode) => void;
    selectedMode: ExecutionMode;
};

type DelegationBarProps = {
    agent: MentionableAgent;
    mode: ExecutionMode;
    onOpen: () => void;
};

const executionModes: ExecutionModeOption[] = [
    {
        id: "discuss",
        label: "Discuss only",
        description: "Respond in chat without using tools.",
        permissions: ["Chat only"],
    },
    {
        id: "plan",
        label: "Plan only",
        description: "Read attached context and propose an implementation plan.",
        permissions: ["Read context"],
    },
    {
        id: "implement",
        label: "Implement",
        description: "Read and edit scoped files without running commands.",
        permissions: ["Read files", "Edit files"],
    },
    {
        id: "verify",
        label: "Implement & verify",
        description: "Edit scoped files and run approved verification commands.",
        permissions: ["Read files", "Edit files", "Run tests"],
    },
];

export function getExecutionMode(mode: ExecutionMode) {
    return executionModes.find((option) => option.id === mode) ?? executionModes[0]!;
}

export function createDelegation(agent: MentionableAgent, mode: ExecutionMode): Delegation {
    const option = getExecutionMode(mode);
    return {
        agentId: agent.id,
        agentName: agent.name,
        avatarClass: agent.avatarClass,
        initials: agent.initials,
        mode,
        modeLabel: option.label,
        permissions: option.permissions,
    };
}

export function DelegationBar(props: DelegationBarProps) {
    const option = () => getExecutionMode(props.mode);

    return (
        <div
            class="flex items-center gap-2 border-b border-[#e7e1e8] bg-[#f9f6fb] px-3 py-2"
            aria-label={`Delegation scope for ${props.agent.name}`}
        >
            <Avatar
                backgroundClass={props.agent.avatarClass}
                initials={props.agent.initials}
                size="xs"
                type="bot"
            />
            <span class="text-[0.61rem] font-bold text-[#665a69]">Delegating to</span>
            <span class="text-[0.63rem] font-extrabold text-[#3f3541]">{props.agent.name}</span>
            <button
                class="ml-auto flex h-7 items-center gap-1.5 rounded-[7px] border border-[#d2c9d6] bg-white px-2.5 text-[0.6rem] font-extrabold text-[#5f4569] shadow-[0_1px_2px_rgb(53_35_56_/_4%)] hover:bg-[#f1ebf4] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#6f4b92]"
                type="button"
                aria-label={`Execution scope: ${option().label}`}
                onClick={props.onOpen}
            >
                {option().label}
                <span aria-hidden="true">⌄</span>
            </button>
        </div>
    );
}

export function ExecutionScopePicker(props: ExecutionScopePickerProps) {
    return (
        <div
            class="absolute bottom-[calc(100%+8px)] left-0 z-20 w-[360px] overflow-hidden rounded-[11px] border border-[#d5ced8] bg-white shadow-[0_16px_36px_rgb(43_24_46_/_18%)]"
            role="dialog"
            aria-label="Execution scope"
        >
            <div class="border-b border-[#e7e2e8] bg-[#faf8fb] px-3 py-2">
                <p class="text-[0.68rem] font-extrabold text-[#3d343d]">Execution scope</p>
                <p class="mt-0.5 text-[0.58rem] text-[#8d848c]">
                    Choose what this agent may do for the request.
                </p>
            </div>

            <div class="p-1.5">
                {executionModes.map((option) => (
                    <button
                        class={`flex w-full items-start gap-2.5 rounded-[8px] border-0 px-2 py-2 text-left transition focus:outline-none ${props.selectedMode === option.id ? "bg-[#eee7f3]" : "bg-transparent hover:bg-[#f3eff5] focus:bg-[#f0ebf3]"}`}
                        type="button"
                        aria-label={option.label}
                        aria-pressed={props.selectedMode === option.id}
                        onClick={() => props.onSelect(option.id)}
                    >
                        <span
                            class={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[0.57rem] font-black ${props.selectedMode === option.id ? "border-[#76517e] bg-[#76517e] text-white" : "border-[#cfc7d2] bg-white text-transparent"}`}
                        >
                            ✓
                        </span>
                        <span class="min-w-0 flex-1">
                            <span class="block text-[0.69rem] font-extrabold text-[#3b333b]">
                                {option.label}
                            </span>
                            <span class="mt-0.5 block text-[0.58rem] leading-4 text-[#81777f]">
                                {option.description}
                            </span>
                            <span class="mt-1 flex flex-wrap gap-1">
                                {option.permissions.map((permission) => (
                                    <span class="rounded bg-[#f2eef4] px-1.5 py-0.5 text-[0.52rem] font-bold text-[#776b79]">
                                        {permission}
                                    </span>
                                ))}
                            </span>
                        </span>
                    </button>
                ))}
            </div>

            <div class="flex justify-end border-t border-[#e7e2e8] bg-[#faf8fb] px-3 py-2">
                <button
                    class="h-7 rounded-md border border-[#76517e] bg-[#76517e] px-3 text-[0.61rem] font-extrabold text-white hover:bg-[#65436d] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#6f4b92]"
                    type="button"
                    onClick={props.onDone}
                >
                    Done
                </button>
            </div>
        </div>
    );
}

export function DelegationReceipt(props: { delegation: Delegation }) {
    return (
        <div
            class="mt-2 flex max-w-[680px] flex-wrap items-center gap-2 rounded-[8px] border border-[#d9d1df] bg-[#f9f6fb] px-2.5 py-2"
            aria-label={`Delegation to ${props.delegation.agentName}`}
        >
            <Avatar
                backgroundClass={props.delegation.avatarClass}
                initials={props.delegation.initials}
                size="xs"
                type="bot"
            />
            <span class="text-[0.59rem] font-bold text-[#7d7180]">Delegated to</span>
            <span class="text-[0.62rem] font-extrabold text-[#443848]">
                {props.delegation.agentName}
            </span>
            <span class="rounded-full bg-[#e9e0ef] px-2 py-0.5 text-[0.54rem] font-extrabold text-[#6b4474]">
                {props.delegation.modeLabel}
            </span>
            <span class="ml-auto flex flex-wrap gap-1">
                {props.delegation.permissions.map((permission) => (
                    <span class="rounded bg-white px-1.5 py-0.5 text-[0.5rem] font-bold text-[#807481] shadow-[inset_0_0_0_1px_#e2dce4]">
                        {permission}
                    </span>
                ))}
            </span>
        </div>
    );
}
