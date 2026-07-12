import { For, splitProps, type JSX } from "solid-js";
import { Avatar } from "./Avatar";

export type AgentSidebarView =
    | "agent-forge"
    | "agent-patch"
    | "agent-scout"
    | "overview"
    | "work-active"
    | "work-complete"
    | "work-queued"
    | "work-review";

export type AgentsSidebarAgent = {
    avatarClass: string;
    count: number;
    id: Extract<AgentSidebarView, `agent-${string}`>;
    initials: string;
    name: string;
    online: boolean;
    role: string;
};

export type AgentsSidebarWorkItem = {
    count: number;
    icon: "active" | "complete" | "queued" | "review";
    id: Extract<AgentSidebarView, `work-${string}`>;
    label: string;
};

function WorkMark(props: { kind: AgentsSidebarWorkItem["icon"] }) {
    return (
        <svg
            class="h-3 w-3"
            data-icon={props.kind}
            data-rigged-ui="agents-sidebar-work-mark"
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden="true"
        >
            {props.kind === "active" ? (
                <>
                    <path
                        d="M9.6 4.6A4 4 0 1 0 9.4 8"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="round"
                    />
                    <path d="m9.6 2.5.1 2.3-2.3-.1" fill="currentColor" />
                </>
            ) : props.kind === "review" ? (
                <>
                    <path
                        d="M6 2.2v5"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="round"
                    />
                    <circle cx="6" cy="9.6" r=".9" fill="currentColor" />
                </>
            ) : props.kind === "queued" ? (
                <path
                    d="M3 3.2h6M3 6h6M3 8.8h6"
                    stroke="currentColor"
                    stroke-width="1.4"
                    stroke-linecap="round"
                />
            ) : (
                <path
                    d="m2.7 6.2 2.1 2.1 4.5-4.6"
                    stroke="currentColor"
                    stroke-width="1.6"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                />
            )}
        </svg>
    );
}

export type AgentsSidebarCopy = {
    agentsHeading: string;
    allAgentsLabel: string;
    capacityLabel: string;
    capacityMessage: string;
    heading: string;
    liveLabel: string;
    searchLabel: string;
    searchPlaceholder: string;
    settingsLabel: string;
    subheading: string;
    workHeading: string;
};

export type AgentsSidebarProps = Omit<JSX.HTMLAttributes<HTMLElement>, "children" | "onInput"> & {
    activeView: AgentSidebarView;
    agents: readonly AgentsSidebarAgent[];
    capacityTotal: number;
    capacityUsed: number;
    copy: AgentsSidebarCopy;
    onQueryChange: (query: string) => void;
    onSettingsClick?: () => void;
    onViewChange: (view: AgentSidebarView) => void;
    query: string;
    workItems: readonly AgentsSidebarWorkItem[];
};

export function AgentsSidebar(props: AgentsSidebarProps) {
    const [local, rest] = splitProps(props, [
        "activeView",
        "agents",
        "capacityTotal",
        "capacityUsed",
        "class",
        "copy",
        "onQueryChange",
        "onSettingsClick",
        "onViewChange",
        "query",
        "workItems",
    ]);
    const normalizedQuery = () => local.query.trim().toLowerCase();
    const visibleAgents = () =>
        local.agents.filter((agent) =>
            `${agent.name} ${agent.role}`.toLowerCase().includes(normalizedQuery()),
        );
    const visibleWork = () =>
        local.workItems.filter((item) => item.label.toLowerCase().includes(normalizedQuery()));
    const active = (view: AgentSidebarView) => local.activeView === view;
    const rowClass = (view: AgentSidebarView) =>
        `flex w-full items-center gap-2 rounded-[7px] border-0 px-2 text-left focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#6f4b92] ${active(view) ? "bg-[#dcd0eb] text-[#302439]" : "bg-transparent text-[#5e526d] hover:bg-[#ebe7f1]"}`;
    const capacityPercent = () =>
        local.capacityTotal > 0
            ? Math.min(100, Math.max(0, (local.capacityUsed / local.capacityTotal) * 100))
            : 0;

    return (
        <aside
            {...rest}
            class={`flex h-full min-h-0 w-72 flex-none flex-col bg-[#f7f5fb] font-['Rigged_Manrope',sans-serif] text-[#40364e] ${local.class ?? ""}`}
            data-rigged-ui="agents-sidebar"
        >
            <header
                class="flex h-[58px] flex-none items-center justify-between border-b border-[#dfdbe7] px-3"
                data-rigged-ui="agents-sidebar-header"
            >
                <div data-rigged-ui="agents-sidebar-heading-group">
                    <h2
                        class="text-[16px] font-extrabold leading-4 tracking-[-0.025em] text-[#211c28]"
                        data-rigged-ui="agents-sidebar-heading"
                    >
                        {local.copy.heading}
                    </h2>
                    <p
                        class="mt-1 text-[9px] font-medium leading-[9px] text-[#897e94]"
                        data-rigged-ui="agents-sidebar-subheading"
                    >
                        {local.copy.subheading}
                    </p>
                </div>
                <button
                    class="grid h-8 w-8 translate-y-[0.5px] place-items-center rounded-lg border border-[#d8d3df] bg-white p-0 text-[#554a63] shadow-[0_1px_2px_rgb(43_29_41_/_4%)] hover:bg-[#f1edf5] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#6f4b92]"
                    data-rigged-ui="agents-sidebar-settings"
                    type="button"
                    aria-label={local.copy.settingsLabel}
                    onClick={() => local.onSettingsClick?.()}
                >
                    <svg
                        class="h-4 w-4"
                        data-rigged-ui="agents-sidebar-settings-mark"
                        viewBox="0 0 16 16"
                        fill="none"
                        aria-hidden="true"
                    >
                        <g>
                            <circle
                                cx="8"
                                cy="8"
                                r="2.25"
                                stroke="currentColor"
                                stroke-width="1.5"
                            />
                            <path
                                d="M8 1.5v1.3M8 13.2v1.3M1.5 8h1.3M13.2 8h1.3M3.4 3.4l.9.9M11.7 11.7l.9.9M12.6 3.4l-.9.9M4.3 11.7l-.9.9"
                                stroke="currentColor"
                                stroke-width="1.5"
                                stroke-linecap="round"
                            />
                        </g>
                    </svg>
                </button>
            </header>

            <div
                class="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-3"
                data-rigged-ui="agents-sidebar-scroll"
            >
                <label
                    class="flex h-8 items-center gap-2 rounded-[7px] border border-[#d8d3df] bg-white px-2.5 text-[#625671] shadow-[0_1px_2px_rgb(49_34_58_/_3%)] focus-within:border-[#8a68a5] focus-within:ring-2 focus-within:ring-[#8a68a5]/10"
                    data-rigged-ui="agents-sidebar-search"
                >
                    <svg
                        class="h-3.5 w-3.5 flex-none"
                        data-rigged-ui="agents-sidebar-search-mark"
                        viewBox="0 0 14 14"
                        fill="none"
                        aria-hidden="true"
                    >
                        <circle cx="6" cy="6" r="3.5" stroke="currentColor" stroke-width="1.25" />
                        <path
                            d="m8.7 8.7 3 3"
                            stroke="currentColor"
                            stroke-width="1.25"
                            stroke-linecap="round"
                        />
                    </svg>
                    <input
                        class="h-full min-w-0 flex-1 appearance-none border-0 bg-transparent p-0 text-[11px] leading-[11px] text-[#31293a] outline-0 placeholder:text-[#81768e] [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
                        data-rigged-ui="agents-sidebar-search-input"
                        type="search"
                        aria-label={local.copy.searchLabel}
                        placeholder={local.copy.searchPlaceholder}
                        value={local.query}
                        onInput={(event) => local.onQueryChange(event.currentTarget.value)}
                    />
                </label>

                <nav class="mt-3" aria-label={local.copy.allAgentsLabel}>
                    <button
                        class={`${rowClass("overview")} h-9 font-bold`}
                        data-rigged-ui="agents-sidebar-overview-row"
                        type="button"
                        aria-pressed={active("overview")}
                        onClick={() => local.onViewChange("overview")}
                    >
                        <span
                            class="grid h-5 w-5 place-items-center rounded-[6px] bg-white/70"
                            data-rigged-ui="agents-sidebar-overview-icon"
                            aria-hidden="true"
                        >
                            <svg class="h-3 w-3" viewBox="0 0 12 12" fill="none">
                                <path
                                    d="M1.5 5.5 6 1.8l4.5 3.7v4.7H7.4V7.3H4.6v2.9H1.5V5.5Z"
                                    fill="currentColor"
                                />
                            </svg>
                        </span>
                        <span class="flex-1 text-[11px] leading-[11px]">
                            {local.copy.allAgentsLabel}
                        </span>
                        <span class="text-[9px] font-extrabold leading-[9px] text-[#84778f]">
                            {local.copy.liveLabel}
                        </span>
                    </button>
                </nav>

                <section class="mt-4" aria-labelledby="rigged-agents-sidebar-agents">
                    <h3
                        class="px-2 text-[9px] font-black uppercase leading-[9px] tracking-[0.11em] text-[#8f8499]"
                        data-rigged-ui="agents-sidebar-agents-heading"
                        id="rigged-agents-sidebar-agents"
                    >
                        {local.copy.agentsHeading}
                    </h3>
                    <div class="mt-1.5 flex flex-col gap-0.5">
                        <For each={visibleAgents()}>
                            {(agent) => (
                                <button
                                    class={`${rowClass(agent.id)} h-11 py-1.5`}
                                    data-agent-id={agent.id}
                                    data-rigged-ui="agents-sidebar-agent-row"
                                    type="button"
                                    aria-label={agent.name}
                                    aria-pressed={active(agent.id)}
                                    onClick={() => local.onViewChange(agent.id)}
                                >
                                    <Avatar
                                        backgroundClass={agent.avatarClass}
                                        initials={agent.initials}
                                        size="xs"
                                        type="bot"
                                    />
                                    <span class="min-w-0 flex-1">
                                        <span class="flex items-center gap-1.5 text-[11px] font-extrabold leading-[11px]">
                                            <span data-rigged-ui="agents-sidebar-agent-name">
                                                {agent.name}
                                            </span>
                                            {agent.online && (
                                                <span
                                                    class="h-1.5 w-1.5 rounded-full bg-[#4bab66]"
                                                    data-rigged-ui="agents-sidebar-agent-presence"
                                                />
                                            )}
                                        </span>
                                        <span class="mt-1 block truncate text-[8px] font-medium leading-2 opacity-70">
                                            {agent.role}
                                        </span>
                                    </span>
                                    <span class="grid h-5 min-w-5 place-items-center rounded-full bg-[#e5deeb] px-1 text-[9px] font-extrabold leading-[9px]">
                                        {agent.count}
                                    </span>
                                </button>
                            )}
                        </For>
                    </div>
                </section>

                <div class="my-4 h-px bg-[#ddd8e4]" data-rigged-ui="agents-sidebar-divider" />

                <section aria-labelledby="rigged-agents-sidebar-work">
                    <h3
                        class="px-2 text-[9px] font-black uppercase leading-[9px] tracking-[0.11em] text-[#8f8499]"
                        id="rigged-agents-sidebar-work"
                    >
                        {local.copy.workHeading}
                    </h3>
                    <div class="mt-1.5 flex flex-col gap-0.5">
                        <For each={visibleWork()}>
                            {(item) => (
                                <button
                                    class={`${rowClass(item.id)} h-8 text-[11px] font-semibold leading-[11px]`}
                                    data-rigged-ui="agents-sidebar-work-row"
                                    data-work-id={item.id}
                                    type="button"
                                    aria-pressed={active(item.id)}
                                    onClick={() => local.onViewChange(item.id)}
                                >
                                    <span
                                        class="grid h-5 w-5 place-items-center rounded-[6px] bg-white/65 text-[#5e526d]"
                                        data-rigged-ui="agents-sidebar-work-icon"
                                        aria-hidden="true"
                                    >
                                        <WorkMark kind={item.icon} />
                                    </span>
                                    <span class="flex-1">{item.label}</span>
                                    <span class="text-[9px] font-extrabold leading-[9px] text-[#81758c]">
                                        {item.count}
                                    </span>
                                </button>
                            )}
                        </For>
                    </div>
                </section>
            </div>

            <footer
                class="h-[101px] flex-none border-t border-[#ded9e5] p-3"
                data-rigged-ui="agents-sidebar-footer"
            >
                <div class="h-[76px] rounded-[8px] border border-[#d9d3df] bg-white p-2.5">
                    <div class="flex h-[9px] items-center justify-between text-[9px] font-extrabold leading-[9px] text-[#5b5066]">
                        <span>{local.copy.capacityLabel}</span>
                        <span>
                            {local.capacityUsed} / {local.capacityTotal}
                        </span>
                    </div>
                    <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e8e3eb]">
                        <span
                            class="block h-full rounded-full bg-[#6f5282]"
                            data-rigged-ui="agents-sidebar-capacity-fill"
                            style={{ width: `${capacityPercent()}%` }}
                        />
                    </div>
                    <p class="mt-1.5 text-[8px] leading-4 text-[#8a8093]">
                        {local.copy.capacityMessage}
                    </p>
                </div>
            </footer>
        </aside>
    );
}
