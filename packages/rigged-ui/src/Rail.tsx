import { splitProps, type JSX } from "solid-js";
import { Avatar } from "./Avatar";

export type FeatureIconName = "agents" | "files" | "home" | "more" | "tasks";

export type Feature = {
    icon: FeatureIconName;
    id: string;
    name: string;
};

export type RailProps = Omit<JSX.HTMLAttributes<HTMLElement>, "children" | "onInput" | "style"> & {
    activeFeatureId?: string;
    children: JSX.Element;
    features: Feature[];
    onBack?: () => void;
    onFeatureChange: (featureId: string) => void;
    onForward?: () => void;
    onHelp?: () => void;
    onHome?: () => void;
    onProfile?: () => void;
    onQueryChange: (query: string) => void;
    profileAvatarUrl?: string;
    profileInitials?: string;
    profileLabel?: string;
    query: string;
    searchLabel?: string;
    searchPlaceholder?: string;
    showWindowControls: boolean;
    sidebar: JSX.Element;
    style?: JSX.CSSProperties;
};

function SearchIcon() {
    return (
        <svg
            class="block h-[14px] w-[14px] shrink-0 fill-none stroke-current stroke-[1.8]"
            data-rigged-ui="rail-icon"
            data-icon="search"
            viewBox="0 0 24 24"
            aria-hidden="true"
        >
            <circle cx="10.8" cy="10.8" r="5.8" />
            <path d="m15.2 15.2 4.1 4.1" />
        </svg>
    );
}

function FeatureIcon(props: { name: FeatureIconName }) {
    const outlineClass = "block h-[21px] w-[21px] fill-none stroke-current stroke-[1.8]";
    return (
        <svg
            class={props.name === "more" ? "block h-[21px] w-[21px] fill-current" : outlineClass}
            data-rigged-ui="rail-icon"
            data-icon={props.name}
            viewBox="0 0 24 24"
            aria-hidden="true"
        >
            <g class="rigged-rail-feature-icon-artwork" data-icon={props.name}>
                {props.name === "home" && (
                    <>
                        <path d="m4 10 8-6.5 8 6.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19Z" />
                        <path d="M9.5 20.5v-6h5v6" />
                    </>
                )}
                {props.name === "agents" && (
                    <>
                        <path d="M8.2 18.8a7.5 7.5 0 1 1 3.8 1.1L7.3 22l.9-3.2Z" />
                        <path d="M8.5 10.8h.01M12 10.8h.01M15.5 10.8h.01" stroke-linecap="round" />
                    </>
                )}
                {props.name === "tasks" && (
                    <>
                        <rect x="4" y="3.5" width="16" height="17" rx="2.5" />
                        <path d="m8 9 1.4 1.4L12 7.8M14 9h2.5M8 15h8.5" />
                    </>
                )}
                {props.name === "files" && (
                    <>
                        <path d="M6 3.5h8l4 4V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
                        <path d="M14 3.5V8h4M8.5 12h7M8.5 16h5" />
                    </>
                )}
                {props.name === "more" && (
                    <>
                        <circle cx="5.5" cy="12" r="1.5" />
                        <circle cx="12" cy="12" r="1.5" />
                        <circle cx="18.5" cy="12" r="1.5" />
                    </>
                )}
            </g>
        </svg>
    );
}

function ArrowIcon(props: { direction: "back" | "forward" }) {
    const path = props.direction === "back" ? "M14.5 6 8.5 12l6 6" : "m9.5 6 6 6-6 6";
    return (
        <svg
            class="block h-4 w-4 fill-none stroke-current stroke-[1.7]"
            data-rigged-ui="rail-icon"
            data-icon={props.direction}
            viewBox="0 0 24 24"
            aria-hidden="true"
        >
            <path d={path} stroke-linecap="round" stroke-linejoin="round" />
        </svg>
    );
}

export function Rail(props: RailProps) {
    const [local, rest] = splitProps(props, [
        "activeFeatureId",
        "children",
        "class",
        "features",
        "onBack",
        "onFeatureChange",
        "onForward",
        "onHelp",
        "onHome",
        "onProfile",
        "onQueryChange",
        "profileAvatarUrl",
        "profileInitials",
        "profileLabel",
        "query",
        "searchLabel",
        "searchPlaceholder",
        "showWindowControls",
        "sidebar",
        "style",
    ]);

    return (
        <main
            {...rest}
            class={`grid h-full min-h-[704px] w-full min-w-[1024px] grid-cols-[76px_288px_minmax(0,1fr)] grid-rows-[38px_minmax(0,1fr)] overflow-hidden text-[#292426] ${local.class ?? ""}`}
            data-rigged-ui="rail"
            style={{
                "box-sizing": "border-box",
                background:
                    "radial-gradient(circle at 7% -8%, rgb(229 75 133 / 88%) 0 10%, transparent 31%), radial-gradient(circle at 104% -15%, rgb(56 134 159 / 72%) 0 12%, transparent 38%), linear-gradient(145deg, #7e3078 0%, #5f256d 46%, #3b174c 100%)",
                "font-family": '"Rigged Manrope", sans-serif',
                ...local.style,
            }}
        >
            <header
                class="col-span-3 col-start-1 row-start-1 grid h-[38px] min-w-0 grid-cols-[76px_88px_minmax(0,1fr)_88px] items-center"
                data-rigged-ui="rail-title-row"
                aria-label="Window navigation"
            >
                <div
                    class="flex h-[38px] items-center justify-center gap-1.5"
                    data-rigged-ui="rail-window-controls"
                    data-testid={local.showWindowControls ? "window-controls" : undefined}
                    aria-hidden="true"
                >
                    {local.showWindowControls && (
                        <>
                            <span
                                class="h-[9px] w-[9px] rounded-[999px] bg-[#ff695e] shadow-[inset_0_0_0_0.5px_rgb(90_16_21_/_28%)]"
                                data-rigged-ui="rail-window-control"
                                data-control="close"
                            />
                            <span
                                class="h-[9px] w-[9px] rounded-[999px] bg-[#ffbd44] shadow-[inset_0_0_0_0.5px_rgb(90_55_7_/_25%)]"
                                data-rigged-ui="rail-window-control"
                                data-control="minimize"
                            />
                            <span
                                class="h-[9px] w-[9px] rounded-[999px] bg-[#30c553] shadow-[inset_0_0_0_0.5px_rgb(7_70_27_/_25%)]"
                                data-rigged-ui="rail-window-control"
                                data-control="maximize"
                            />
                        </>
                    )}
                </div>

                <div
                    class="flex h-[38px] items-center gap-1 text-white/65"
                    data-rigged-ui="rail-history-controls"
                >
                    <button
                        class="grid h-7 w-7 appearance-none place-items-center rounded-md border-0 bg-transparent p-0 text-inherit hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white"
                        data-rigged-ui="rail-back"
                        type="button"
                        aria-label="Go back"
                        onClick={() => local.onBack?.()}
                    >
                        <ArrowIcon direction="back" />
                    </button>
                    <button
                        class="grid h-7 w-7 appearance-none place-items-center rounded-md border-0 bg-transparent p-0 text-inherit hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white"
                        data-rigged-ui="rail-forward"
                        type="button"
                        aria-label="Go forward"
                        onClick={() => local.onForward?.()}
                    >
                        <ArrowIcon direction="forward" />
                    </button>
                </div>

                <div
                    class="grid h-[38px] min-w-0 place-items-center"
                    data-rigged-ui="rail-search-region"
                >
                    <label
                        class="flex h-[26px] w-[430px] items-center gap-2 rounded-[7px] border border-white/15 bg-black/14 px-2.5 text-white/70 shadow-[inset_0_1px_1px_rgb(33_7_35_/_18%)] focus-within:border-white/35 focus-within:bg-black/20 focus-within:text-white focus-within:ring-2 focus-within:ring-white/10"
                        data-rigged-ui="rail-search"
                    >
                        <SearchIcon />
                        <input
                            class="h-5 min-w-0 flex-1 appearance-none border-0 bg-transparent p-0 text-center text-[11.5px] font-medium leading-4 text-white outline-0 placeholder:text-white/65"
                            data-rigged-ui="rail-query"
                            aria-label={local.searchLabel ?? "Search Rigged"}
                            type="search"
                            value={local.query}
                            placeholder={local.searchPlaceholder ?? "Search Rigged"}
                            onInput={(event) => local.onQueryChange(event.currentTarget.value)}
                        />
                    </label>
                </div>

                <div
                    class="flex h-[38px] items-center justify-center"
                    data-rigged-ui="rail-help-region"
                >
                    <button
                        class="grid h-7 w-7 appearance-none place-items-center rounded-full border border-white/35 bg-transparent p-0 text-[12px] font-bold leading-3 text-white/80 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white"
                        data-rigged-ui="rail-help"
                        type="button"
                        aria-label="Help"
                        onClick={() => local.onHelp?.()}
                    >
                        ?
                    </button>
                </div>
            </header>

            <aside
                class="col-start-1 row-start-2 flex min-h-0 w-[76px] flex-col items-center overflow-hidden pb-3 pt-3"
                data-rigged-ui="rail-feature-region"
                aria-label="Feature rail"
            >
                <button
                    class="relative grid h-10 w-10 appearance-none place-items-center rounded-[11px] border border-white/35 bg-[linear-gradient(145deg,#ffd348_0%,#ff7b43_48%,#e63589_100%)] p-0 text-[18px] font-black leading-5 text-white shadow-[0_8px_18px_rgb(24_8_36_/_25%),inset_0_1px_0_rgb(255_255_255_/_45%)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                    data-rigged-ui="rail-home"
                    type="button"
                    aria-label="Rigged home"
                    onClick={() => local.onHome?.()}
                >
                    <span aria-hidden="true">R</span>
                    <span
                        class="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-[#6d2a72] bg-[#45d17b]"
                        data-rigged-ui="rail-home-status"
                        aria-hidden="true"
                    />
                </button>

                <nav
                    class="mt-4 flex w-full flex-col items-center gap-1"
                    data-rigged-ui="rail-features"
                    aria-label="Features"
                >
                    {local.features.map((feature) => {
                        const active = () => local.activeFeatureId === feature.id;
                        return (
                            <button
                                class={`flex h-[54px] w-[62px] appearance-none flex-col items-center justify-center gap-1 rounded-[9px] border-0 p-0 text-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white ${active() ? "shadow-[inset_0_1px_0_rgb(255_255_255_/_16%)]" : "text-white/72 hover:bg-white/9 hover:text-white"}`}
                                data-rigged-ui="rail-feature"
                                data-feature-id={feature.id}
                                style={{
                                    "background-color": active()
                                        ? "rgba(255, 255, 255, 0.24)"
                                        : "transparent",
                                }}
                                type="button"
                                aria-label={feature.name}
                                aria-pressed={active()}
                                onClick={() => local.onFeatureChange(feature.id)}
                            >
                                <FeatureIcon name={feature.icon} />
                                <span
                                    class="text-[9.75px] font-semibold leading-[10px] tracking-[-0.1px]"
                                    data-rigged-ui="rail-feature-label"
                                >
                                    {feature.name}
                                </span>
                            </button>
                        );
                    })}
                </nav>

                <button
                    class="mt-auto appearance-none rounded-full border-0 bg-transparent p-0 shadow-[0_7px_17px_rgb(28_8_37_/_24%)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                    data-rigged-ui="rail-profile"
                    type="button"
                    aria-label={local.profileLabel ?? "Open profile"}
                    onClick={() => local.onProfile?.()}
                >
                    <Avatar
                        backgroundClass="bg-[radial-gradient(circle_at_68%_25%,#f7cf70_0_18%,transparent_19%),linear-gradient(145deg,#3ca8a4_0%,#3265a8_48%,#dc4d78_100%)]"
                        imageUrl={local.profileAvatarUrl}
                        initials={local.profileInitials ?? "ST"}
                        size="md"
                        type="human"
                    />
                </button>
            </aside>

            <section
                class="col-span-2 col-start-2 row-start-2 m-2 grid min-h-0 min-w-0 grid-cols-[288px_minmax(0,1fr)] overflow-hidden rounded-[14px] border border-white/20 bg-white shadow-[0_12px_34px_rgb(30_7_38_/_18%)]"
                data-rigged-ui="rail-content-shell"
                style={{ "border-color": "rgba(255, 255, 255, 0.2)" }}
            >
                <div class="min-h-0 min-w-0 overflow-hidden" data-rigged-ui="rail-sidebar-slot">
                    {local.sidebar}
                </div>
                <div
                    class="flex min-h-0 min-w-0 flex-col overflow-hidden border-l border-[#ded7df] bg-white"
                    data-rigged-ui="rail-main-slot"
                >
                    {local.children}
                </div>
            </section>
        </main>
    );
}
