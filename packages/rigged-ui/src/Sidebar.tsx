import { splitProps, type JSX } from "solid-js";
import { Avatar } from "./Avatar";

export type SidebarSectionIcon = "apps" | "channels" | "messages" | "star";

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

export type SidebarCopy = {
    composeLabel: string;
    directoryLabel: string;
    footerMessage: string;
    huddlesLabel: string;
    inviteLabel: string;
    queryLabel: string;
    queryPlaceholder: string;
    settingsLabel: string;
    setupLabel: string;
    workspaceMenuLabel: string;
};

export type SidebarProps = Omit<JSX.HTMLAttributes<HTMLElement>, "onInput" | "style"> & {
    activeItemId?: string;
    copy?: Partial<SidebarCopy>;
    onCompose?: () => void;
    onDirectory?: () => void;
    onHuddles?: () => void;
    onInvite?: () => void;
    onItemChange: (itemId: string) => void;
    onQueryChange: (query: string) => void;
    onSettings?: () => void;
    onWorkspaceMenu?: () => void;
    query: string;
    sections: SidebarSection[];
    setupProgress?: number;
    style?: JSX.CSSProperties;
    workspaceName: string;
};

const defaultCopy: SidebarCopy = {
    composeLabel: "New message",
    directoryLabel: "Directory",
    footerMessage: "Rigged works better with your whole team.",
    huddlesLabel: "Huddles",
    inviteLabel: "Invite teammates",
    queryLabel: "Find a conversation",
    queryPlaceholder: "Find a conversation…",
    settingsLabel: "Workspace settings",
    setupLabel: "Set up your space",
    workspaceMenuLabel: "Workspace menu",
};

type UtilityIconName = "compose" | "directory" | "headphones" | "invite" | "search" | "settings";

function UtilityIcon(props: { name: UtilityIconName }) {
    const iconClass = "block h-4 w-4 fill-none stroke-current stroke-[1.8]";

    return (
        <svg
            class={iconClass}
            data-rigged-ui="sidebar-icon"
            data-icon={props.name}
            viewBox="0 0 24 24"
            aria-hidden="true"
        >
            {props.name === "compose" && (
                <>
                    <path d="M12 20H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h7" />
                    <path d="m10 14 1.2-3.8L18 3.4a1.4 1.4 0 0 1 2 2l-6.8 6.8L10 14Z" />
                </>
            )}
            {props.name === "directory" && (
                <>
                    <rect x="4" y="3.5" width="16" height="17" rx="2.5" />
                    <circle cx="10" cy="10" r="2.2" />
                    <path d="M7.2 16c.6-1.7 1.6-2.5 2.8-2.5s2.2.8 2.8 2.5M15.5 8h2M15.5 12h2M15.5 16h2" />
                </>
            )}
            {props.name === "headphones" && (
                <path d="M4.5 13v-1a7.5 7.5 0 0 1 15 0v1M4.5 13v4a2 2 0 0 0 2 2h1v-7h-1a2 2 0 0 0-2 2ZM19.5 13v4a2 2 0 0 1-2 2h-1v-7h1a2 2 0 0 1 2 2Z" />
            )}
            {props.name === "invite" && (
                <>
                    <circle cx="9" cy="8" r="3" />
                    <path d="M3.8 19c.6-3.2 2.3-5 5.2-5 1.5 0 2.7.5 3.6 1.4M17 8v6M14 11h6" />
                </>
            )}
            {props.name === "search" && (
                <>
                    <circle cx="10.5" cy="10.5" r="5.5" />
                    <path d="m15 15 4.5 4.5" />
                </>
            )}
            {props.name === "settings" && (
                <>
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19 13.5V10.5l-2-.6-.6-1.4 1-1.8-2.1-2.1-1.8 1-1.4-.6-.6-2h-3l-.6 2-1.4.6-1.8-1-2.1 2.1 1 1.8-.6 1.4-2 .6v3l2 .6.6 1.4-1 1.8 2.1 2.1 1.8-1 1.4.6.6 2h3l.6-2 1.4-.6 1.8 1 2.1-2.1-1-1.8.6-1.4 2-.6Z" />
                </>
            )}
        </svg>
    );
}

function SectionIcon(props: { name: SidebarSectionIcon }) {
    if (props.name === "channels")
        return (
            <span
                class="block h-[17px] w-[17px] text-center text-[16px] font-semibold leading-[17px]"
                data-rigged-ui="sidebar-section-icon"
                data-icon="channels"
                aria-hidden="true"
            >
                #
            </span>
        );

    const path = {
        apps: "m12 3 1.2 3.4 3.5-1.2-1.2 3.4 3.5 1.1-3 2.1 2.1 3-3.6.1.1 3.5-3-2.2-2 2.2-3-3.5.8-1.2-3.4-1.2 3.4Z",
        messages:
            "M7.5 17.5H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v.8M10 13.5h9a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-4.5L11 22v-1.5h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2Z",
        star: "m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z",
    }[props.name];

    return (
        <svg
            class="block h-[17px] w-[17px] fill-none stroke-current stroke-[1.7]"
            data-rigged-ui="sidebar-section-icon"
            data-icon={props.name}
            viewBox="0 0 24 24"
            aria-hidden="true"
        >
            <path d={path} stroke-linejoin="round" />
        </svg>
    );
}

export function Sidebar(props: SidebarProps) {
    const [local, rest] = splitProps(props, [
        "activeItemId",
        "class",
        "copy",
        "onCompose",
        "onDirectory",
        "onHuddles",
        "onInvite",
        "onItemChange",
        "onQueryChange",
        "onSettings",
        "onWorkspaceMenu",
        "query",
        "sections",
        "setupProgress",
        "style",
        "workspaceName",
    ]);
    const copy = (key: keyof SidebarCopy) => local.copy?.[key] ?? defaultCopy[key];
    const visibleSections = () => {
        const query = local.query.trim().toLowerCase();
        return local.sections.map((section) => ({
            ...section,
            items: query
                ? section.items.filter((item) => item.name.toLowerCase().includes(query))
                : section.items,
        }));
    };
    const progress = () => Math.max(0, Math.min(1, local.setupProgress ?? 0.26));

    return (
        <aside
            {...rest}
            class={`flex h-full min-h-0 w-[288px] shrink-0 flex-col overflow-hidden bg-[#f7f5fb] text-[#40364e] ${local.class ?? ""}`}
            data-rigged-ui="sidebar"
            style={{
                "box-sizing": "border-box",
                "font-family": '"Rigged Manrope", sans-serif',
                ...local.style,
            }}
            aria-label={`${local.workspaceName} sidebar`}
        >
            <header
                class="flex h-[58px] shrink-0 items-center gap-1.5 border-b border-[#dfdbe7] px-3"
                data-rigged-ui="sidebar-header"
            >
                <button
                    class="mr-auto flex h-8 min-w-0 appearance-none items-center gap-1.5 rounded-md border-0 bg-transparent px-1 text-left text-[16px] font-extrabold leading-5 tracking-[-0.4px] text-[#211c28] hover:bg-[#ece8f2] focus-visible:outline-2 focus-visible:outline-[#6f4b92]"
                    data-rigged-ui="sidebar-workspace-menu"
                    type="button"
                    aria-label={`${local.workspaceName} ${copy("workspaceMenuLabel")}`}
                    onClick={() => local.onWorkspaceMenu?.()}
                >
                    <span class="truncate" data-rigged-ui="sidebar-workspace-name">
                        {local.workspaceName}
                    </span>
                    <span class="text-[11px] leading-[11px]" aria-hidden="true">
                        ⌄
                    </span>
                </button>
                {(
                    [
                        ["settings", copy("settingsLabel"), local.onSettings],
                        ["invite", copy("inviteLabel"), local.onInvite],
                        ["compose", copy("composeLabel"), local.onCompose],
                    ] as const
                ).map(([action, label, callback]) => (
                    <button
                        class="grid h-8 w-8 shrink-0 appearance-none place-items-center rounded-lg border border-[#d8d3df] bg-white p-0 text-[#554a63] shadow-[0_1px_2px_rgb(43_29_41_/_4%)] hover:bg-[#f1edf5] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#6f4b92]"
                        data-rigged-ui="sidebar-header-action"
                        data-action={action}
                        type="button"
                        aria-label={label}
                        onClick={() => callback?.()}
                    >
                        <UtilityIcon name={action} />
                    </button>
                ))}
            </header>

            <div
                class="min-h-0 flex-1 overflow-y-auto px-3 pb-5 pt-3"
                data-rigged-ui="sidebar-scroll-area"
            >
                <div
                    class="flex h-[46px] items-center gap-2.5 rounded-[9px] border border-[#ddd7e7] bg-[#fbfaff] px-3 shadow-[0_1px_2px_rgb(49_34_58_/_3%)]"
                    data-rigged-ui="sidebar-setup"
                >
                    <span
                        class="grid h-7 w-7 place-items-center rounded-full border border-[#d5cee0] text-[#5d4a72]"
                        aria-hidden="true"
                    >
                        <SectionIcon name="apps" />
                    </span>
                    <span class="min-w-0 flex-1 truncate text-[12px] font-bold leading-4 text-[#59476c]">
                        {copy("setupLabel")}
                    </span>
                    <span
                        class="h-6 w-6 rounded-full p-1"
                        data-rigged-ui="sidebar-setup-progress"
                        style={{
                            background: `conic-gradient(#57d17d 0 ${progress() * 100}%, #ded8e5 ${progress() * 100}%)`,
                        }}
                        aria-label={`${Math.round(progress() * 100)}% complete`}
                    >
                        <span class="block h-full w-full rounded-full bg-[#fbfaff]" />
                    </span>
                </div>

                <label
                    class="mt-3 flex h-8 items-center gap-2 rounded-[7px] border border-[#d8d3df] bg-white px-2.5 text-[#625671] shadow-[0_1px_2px_rgb(49_34_58_/_3%)] focus-within:border-[#8a68a5] focus-within:ring-2 focus-within:ring-[#8a68a5]/10"
                    data-rigged-ui="sidebar-search"
                >
                    <UtilityIcon name="search" />
                    <input
                        class="h-6 min-w-0 flex-1 appearance-none border-0 bg-transparent p-0 text-[11.5px] leading-4 text-[#31293a] outline-0 placeholder:text-[#81768e]"
                        data-rigged-ui="sidebar-query"
                        type="search"
                        aria-label={copy("queryLabel")}
                        placeholder={copy("queryPlaceholder")}
                        value={local.query}
                        onInput={(event) => local.onQueryChange(event.currentTarget.value)}
                    />
                </label>

                <nav class="mt-3 flex flex-col" aria-label="Workspace tools">
                    {(
                        [
                            ["headphones", copy("huddlesLabel"), local.onHuddles, "huddles"],
                            ["directory", copy("directoryLabel"), local.onDirectory, "directory"],
                        ] as const
                    ).map(([icon, label, callback, action]) => (
                        <button
                            class="flex h-8 w-full appearance-none items-center gap-2 rounded-[7px] border-0 bg-transparent px-2 text-left text-[12px] font-semibold leading-4 text-[#5e526d] hover:bg-[#ebe7f1] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#6f4b92]"
                            data-rigged-ui="sidebar-tool"
                            data-action={action}
                            type="button"
                            onClick={() => callback?.()}
                        >
                            <UtilityIcon name={icon} />
                            <span>{label}</span>
                        </button>
                    ))}
                </nav>

                <div class="my-3 h-px bg-[#ddd8e4]" data-rigged-ui="sidebar-rule" />

                <nav class="flex flex-col gap-3" aria-label="Workspace navigation">
                    {visibleSections().map((section) => (
                        <section
                            data-rigged-ui="sidebar-section"
                            data-section-id={section.id}
                            aria-labelledby={`sidebar-${section.id}`}
                        >
                            <h3
                                class="flex h-7 items-center gap-2 px-1.5 text-[12px] font-bold leading-4 text-[#594d68]"
                                data-rigged-ui="sidebar-section-heading"
                                id={`sidebar-${section.id}`}
                            >
                                <SectionIcon name={section.icon} />
                                <span>{section.label}</span>
                            </h3>

                            {section.emptyText && section.items.length === 0 && !local.query && (
                                <p
                                    class="mb-1 pl-7 pr-2 text-[10.5px] leading-4 text-[#8d8398]"
                                    data-rigged-ui="sidebar-empty"
                                >
                                    {section.emptyText}
                                </p>
                            )}

                            <div class="flex flex-col">
                                {section.items.map((item) => {
                                    const active = () => local.activeItemId === item.id;
                                    return (
                                        <button
                                            class={`flex h-8 w-full appearance-none items-center gap-2 rounded-[7px] border-0 px-2 text-left text-[12px] leading-4 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#6f4b92] ${active() ? "bg-[#dcd0eb] font-bold text-[#302439]" : "bg-transparent font-medium text-[#5e526d] hover:bg-[#ebe7f1]"}`}
                                            data-rigged-ui="sidebar-item"
                                            data-item-id={item.id}
                                            type="button"
                                            aria-label={item.name}
                                            aria-pressed={active()}
                                            onClick={() => local.onItemChange(item.id)}
                                        >
                                            {item.kind === "channel" && (
                                                <span
                                                    class="w-[18px] text-center text-[14px] leading-4"
                                                    aria-hidden="true"
                                                >
                                                    #
                                                </span>
                                            )}
                                            {item.kind === "action" && (
                                                <span
                                                    class="grid h-[18px] w-[18px] place-items-center rounded bg-white text-[14px] leading-4"
                                                    aria-hidden="true"
                                                >
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
                                            <span
                                                class="min-w-0 flex-1 truncate"
                                                data-rigged-ui="sidebar-item-label"
                                            >
                                                {item.name}
                                            </span>
                                            {item.badge !== undefined && item.badge > 0 && (
                                                <span
                                                    class="grid h-5 min-w-5 place-items-center rounded-full bg-[#d7cee4] px-1.5 text-[10px] font-bold leading-3 text-[#574664]"
                                                    data-rigged-ui="sidebar-item-badge"
                                                >
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

            <footer
                class="h-[86px] shrink-0 border-t border-[#ded9e5] p-3"
                data-rigged-ui="sidebar-footer"
            >
                <p class="mb-2 h-4 text-[10.5px] leading-4 text-[#71647e]">
                    {copy("footerMessage")}
                </p>
                <button
                    class="flex h-8 w-full appearance-none items-center justify-center gap-2 rounded-[6px] border border-[#d6d0dc] bg-white p-0 text-[11px] font-bold leading-4 text-[#4d4258] hover:bg-[#f1edf5] focus-visible:outline-2 focus-visible:outline-[#6f4b92]"
                    data-rigged-ui="sidebar-invite"
                    type="button"
                    onClick={() => local.onInvite?.()}
                >
                    <UtilityIcon name="invite" />
                    {copy("inviteLabel")}
                </button>
            </footer>
        </aside>
    );
}
