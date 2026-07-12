import { createSignal } from "solid-js";
import { Avatar } from "rigged-ui";

type SidebarSectionIcon = "apps" | "channels" | "messages" | "star";

export type SidebarItem = {
    avatarClass?: string;
    badge?: number;
    id: string;
    initials?: string;
    kind: "action" | "app" | "channel" | "person";
    name: string;
    online?: boolean;
};

export type SidebarSection = {
    emptyText?: string;
    icon: SidebarSectionIcon;
    id: string;
    items: SidebarItem[];
    label: string;
};

type SidebarProps = {
    activeItemId: string;
    onItemChange: (itemId: string) => void;
    sections: SidebarSection[];
    workspaceName: string;
};

function UtilityIcon(props: {
    name: "compose" | "directory" | "headphones" | "invite" | "search" | "settings";
}) {
    const iconClass = "h-4 w-4 fill-none stroke-current stroke-[1.8]";

    switch (props.name) {
        case "compose":
            return (
                <svg class={iconClass} viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 20H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h7" />
                    <path d="m10 14 1.2-3.8L18 3.4a1.4 1.4 0 0 1 2 2l-6.8 6.8L10 14Z" />
                </svg>
            );
        case "directory":
            return (
                <svg class={iconClass} viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="4" y="3.5" width="16" height="17" rx="2.5" />
                    <circle cx="10" cy="10" r="2.2" />
                    <path d="M7.2 16c.6-1.7 1.6-2.5 2.8-2.5s2.2.8 2.8 2.5M15.5 8h2M15.5 12h2M15.5 16h2" />
                </svg>
            );
        case "headphones":
            return (
                <svg class={iconClass} viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4.5 13v-1a7.5 7.5 0 0 1 15 0v1M4.5 13v4a2 2 0 0 0 2 2h1v-7h-1a2 2 0 0 0-2 2ZM19.5 13v4a2 2 0 0 1-2 2h-1v-7h1a2 2 0 0 1 2 2Z" />
                </svg>
            );
        case "invite":
            return (
                <svg class={iconClass} viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="9" cy="8" r="3" />
                    <path d="M3.8 19c.6-3.2 2.3-5 5.2-5 1.5 0 2.7.5 3.6 1.4M17 8v6M14 11h6" />
                </svg>
            );
        case "search":
            return (
                <svg class={iconClass} viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="10.5" cy="10.5" r="5.5" />
                    <path d="m15 15 4.5 4.5" />
                </svg>
            );
        case "settings":
            return (
                <svg class={iconClass} viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19 13.5V10.5l-2-.6-.6-1.4 1-1.8-2.1-2.1-1.8 1-1.4-.6-.6-2h-3l-.6 2-1.4.6-1.8-1-2.1 2.1 1 1.8-.6 1.4-2 .6v3l2 .6.6 1.4-1 1.8 2.1 2.1 1.8-1 1.4.6.6 2h3l.6-2 1.4-.6 1.8 1 2.1-2.1-1-1.8.6-1.4 2-.6Z" />
                </svg>
            );
    }
}

function SectionIcon(props: { name: SidebarSectionIcon }) {
    if (props.name === "channels")
        return <span class="text-[1rem] font-semibold leading-none">#</span>;

    const iconClass = "h-[17px] w-[17px] fill-none stroke-current stroke-[1.7]";
    const path = {
        apps: "m12 3 1.2 3.4 3.5-1.2-1.2 3.4 3.5 1.1-3 2.1 2.1 3-3.6.1.1 3.5-3-2.2-2 2.2-3-3.5.8-1.2-3.4-1.2 3.4Z",
        messages:
            "M7.5 17.5H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v.8M10 13.5h9a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-4.5L11 22v-1.5h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2Z",
        star: "m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z",
    }[props.name];

    return (
        <svg class={iconClass} viewBox="0 0 24 24" aria-hidden="true">
            <path d={path} stroke-linejoin="round" />
        </svg>
    );
}

export function Sidebar(props: SidebarProps) {
    const [query, setQuery] = createSignal("");
    const visibleSections = () =>
        props.sections.map((section) => ({
            ...section,
            items: section.items.filter((item) =>
                item.name.toLowerCase().includes(query().toLowerCase()),
            ),
        }));

    return (
        <aside
            class="flex h-full min-h-0 flex-col bg-[#f7f5fb] text-[#40364e]"
            aria-label={`${props.workspaceName} sidebar`}
        >
            <header class="flex h-[58px] shrink-0 items-center gap-1.5 border-b border-[#dfdbe7] px-3">
                <button
                    class="mr-auto flex min-w-0 items-center gap-1.5 rounded-md border-0 bg-transparent px-1 py-1 text-left text-[1rem] font-extrabold tracking-[-0.025em] text-[#211c28] hover:bg-[#ece8f2] focus-visible:outline-2 focus-visible:outline-[#6f4b92]"
                    type="button"
                    aria-label={`${props.workspaceName} workspace menu`}
                >
                    <span class="truncate">{props.workspaceName}</span>
                    <span class="text-[0.7rem]">⌄</span>
                </button>
                {(["settings", "invite", "compose"] as const).map((action) => (
                    <button
                        class="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[#d8d3df] bg-white text-[#554a63] shadow-[0_1px_2px_rgb(43_29_41_/_4%)] transition hover:bg-[#f1edf5] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#6f4b92]"
                        type="button"
                        aria-label={
                            action === "settings"
                                ? "Workspace settings"
                                : action === "invite"
                                  ? "Invite people"
                                  : "New message"
                        }
                    >
                        <UtilityIcon name={action} />
                    </button>
                ))}
            </header>

            <div class="min-h-0 flex-1 overflow-y-auto px-3 pb-5 pt-3">
                <div class="flex h-[46px] items-center gap-2.5 rounded-[9px] border border-[#ddd7e7] bg-[#fbfaff] px-3 shadow-[0_1px_2px_rgb(49_34_58_/_3%)]">
                    <span
                        class="grid h-7 w-7 place-items-center rounded-full border border-[#d5cee0] text-[#5d4a72]"
                        aria-hidden="true"
                    >
                        <SectionIcon name="apps" />
                    </span>
                    <span class="min-w-0 flex-1 truncate text-[0.75rem] font-bold text-[#59476c]">
                        Set up your space
                    </span>
                    <span
                        class="h-6 w-6 rounded-full bg-[conic-gradient(#57d17d_0_26%,#ded8e5_26%)] p-[4px]"
                        aria-hidden="true"
                    >
                        <span class="block h-full w-full rounded-full bg-[#fbfaff]" />
                    </span>
                </div>

                <label class="mt-3 flex h-8 items-center gap-2 rounded-[7px] border border-[#d8d3df] bg-white px-2.5 text-[#625671] shadow-[0_1px_2px_rgb(49_34_58_/_3%)] focus-within:border-[#8a68a5] focus-within:ring-2 focus-within:ring-[#8a68a5]/10">
                    <UtilityIcon name="search" />
                    <input
                        class="min-w-0 flex-1 border-0 bg-transparent text-[0.72rem] text-[#31293a] outline-0 placeholder:text-[#81768e]"
                        type="search"
                        aria-label="Find a conversation"
                        placeholder="Find a conversation…"
                        value={query()}
                        onInput={(event) => setQuery(event.currentTarget.value)}
                    />
                </label>

                <nav class="mt-3 flex flex-col" aria-label="Workspace tools">
                    <button class="sidebar-link" type="button">
                        <UtilityIcon name="headphones" />
                        <span>Huddles</span>
                    </button>
                    <button class="sidebar-link" type="button">
                        <UtilityIcon name="directory" />
                        <span>Directory</span>
                    </button>
                </nav>

                <div class="my-3 h-px bg-[#ddd8e4]" />

                <nav class="flex flex-col gap-3" aria-label="Workspace navigation">
                    {visibleSections().map((section) => (
                        <section aria-labelledby={`sidebar-${section.id}`}>
                            <h3
                                class="flex h-7 items-center gap-2 px-1.5 text-[0.76rem] font-bold text-[#594d68]"
                                id={`sidebar-${section.id}`}
                            >
                                <SectionIcon name={section.icon} />
                                <span>{section.label}</span>
                            </h3>

                            {section.emptyText && section.items.length === 0 && !query() && (
                                <p class="mb-1 pl-7 pr-2 text-[0.65rem] leading-4 text-[#8d8398]">
                                    {section.emptyText}
                                </p>
                            )}

                            <div class="flex flex-col">
                                {section.items.map((item) => {
                                    const isActive = () => props.activeItemId === item.id;

                                    return (
                                        <button
                                            class={`flex h-8 w-full items-center gap-2 rounded-[7px] border-0 px-2 text-left text-[0.75rem] transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#6f4b92] ${isActive() ? "bg-[#dcd0eb] font-bold text-[#302439]" : "bg-transparent font-medium text-[#5e526d] hover:bg-[#ebe7f1]"}`}
                                            type="button"
                                            aria-label={item.name}
                                            aria-pressed={isActive()}
                                            onClick={() => props.onItemChange(item.id)}
                                        >
                                            {item.kind === "channel" && (
                                                <span class="w-4 text-center text-[0.9rem] leading-none">
                                                    #
                                                </span>
                                            )}
                                            {item.kind === "action" && (
                                                <span class="grid h-4 w-4 place-items-center rounded bg-white text-[0.9rem] leading-none">
                                                    +
                                                </span>
                                            )}
                                            {(item.kind === "person" || item.kind === "app") && (
                                                <Avatar
                                                    backgroundClass={
                                                        item.avatarClass ?? "bg-[#765c95]"
                                                    }
                                                    initials={item.initials ?? ""}
                                                    online={item.online}
                                                    size="xs"
                                                    type={item.kind === "app" ? "bot" : "human"}
                                                />
                                            )}
                                            <span class="min-w-0 flex-1 truncate">{item.name}</span>
                                            {item.badge && (
                                                <span class="grid h-5 min-w-5 place-items-center rounded-full bg-[#d7cee4] px-1.5 text-[0.61rem] font-bold text-[#574664]">
                                                    {item.badge}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </section>
                    ))}
                </nav>
            </div>

            <footer class="shrink-0 border-t border-[#ded9e5] p-3">
                <p class="mb-2 text-[0.67rem] leading-4 text-[#71647e]">
                    Rigged works better with your whole team.
                </p>
                <button
                    class="flex h-8 w-full items-center justify-center gap-2 rounded-[6px] border border-[#d6d0dc] bg-white text-[0.69rem] font-bold text-[#4d4258] hover:bg-[#f1edf5] focus-visible:outline-2 focus-visible:outline-[#6f4b92]"
                    type="button"
                >
                    <UtilityIcon name="invite" />
                    Invite teammates
                </button>
            </footer>
        </aside>
    );
}
