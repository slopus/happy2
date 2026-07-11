import { createSignal, For } from "solid-js";
import { changeReviewFileItems, type ReviewTab } from "./ChangeReviewWorkspace";

type FilesSidebarProps = {
    activeFileId: string;
    activeTab: ReviewTab;
    onFileChange: (fileId: string) => void;
    onTabChange: (tab: ReviewTab) => void;
};

export function FilesSidebar(props: FilesSidebarProps) {
    const [query, setQuery] = createSignal("");
    const visibleFiles = () =>
        changeReviewFileItems.filter((file) =>
            `${file.name} ${file.path}`.toLowerCase().includes(query().trim().toLowerCase()),
        );

    return (
        <aside
            class="flex h-full min-h-0 flex-col bg-[#f7f5f8] text-[#433a46]"
            aria-label="Files sidebar"
        >
            <header class="flex h-[58px] shrink-0 items-center justify-between border-b border-[#dfdbe2] px-3">
                <div>
                    <h2 class="text-[1rem] font-extrabold tracking-[-0.025em] text-[#251f27]">
                        Changes
                    </h2>
                    <p class="mt-0.5 text-[0.55rem] font-medium text-[#8a818d]">Review workspace</p>
                </div>
                <button
                    class="grid h-8 w-8 place-items-center rounded-lg border border-[#d8d3da] bg-white text-[0.8rem] text-[#5b505e] shadow-[0_1px_2px_rgb(43_29_41_/_4%)] hover:bg-[#f1edf2]"
                    type="button"
                    aria-label="Change review settings"
                >
                    •••
                </button>
            </header>

            <div class="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-3">
                <label class="flex h-8 items-center gap-2 rounded-[7px] border border-[#d8d3da] bg-white px-2.5 text-[#625768] shadow-[0_1px_2px_rgb(49_34_58_/_3%)] focus-within:border-[#8a68a5] focus-within:ring-2 focus-within:ring-[#8a68a5]/10">
                    <span class="text-[0.8rem]" aria-hidden="true">
                        ⌕
                    </span>
                    <input
                        class="min-w-0 flex-1 border-0 bg-transparent text-[0.69rem] text-[#332b35] outline-0 placeholder:text-[#837888]"
                        type="search"
                        aria-label="Find a changed file"
                        placeholder="Find a changed file…"
                        value={query()}
                        onInput={(event) => setQuery(event.currentTarget.value)}
                    />
                </label>

                <section class="mt-4" aria-labelledby="files-review-queue">
                    <h3
                        class="px-2 text-[0.54rem] font-black uppercase tracking-[0.11em] text-[#918695]"
                        id="files-review-queue"
                    >
                        Review queue
                    </h3>
                    <button
                        class="mt-1.5 w-full rounded-[8px] border border-[#d9cedd] bg-white px-2.5 py-2.5 text-left shadow-[inset_3px_0_0_#79517f,0_1px_2px_rgb(43_29_41_/_3%)]"
                        type="button"
                        aria-label="Default workspace naming review"
                        onClick={() => props.onTabChange("changes")}
                    >
                        <span class="flex items-center justify-between gap-2">
                            <span class="truncate text-[0.66rem] font-extrabold text-[#443748]">
                                Default workspace naming
                            </span>
                            <span class="shrink-0 rounded-full bg-[#f4e7cf] px-1.5 py-0.5 text-[0.47rem] font-extrabold text-[#855f21]">
                                Review
                            </span>
                        </span>
                        <span class="mt-1 block truncate font-mono text-[0.49rem] text-[#918793]">
                            agent/forge/workspace-naming
                        </span>
                        <span class="mt-1.5 flex gap-2 text-[0.5rem] font-bold">
                            <span class="text-[#3b8250]">+102</span>
                            <span class="text-[#a95656]">−22</span>
                            <span class="text-[#8b818e]">3 files</span>
                        </span>
                    </button>
                </section>

                <nav class="mt-4" aria-label="Review navigation">
                    <h3 class="px-2 text-[0.54rem] font-black uppercase tracking-[0.11em] text-[#918695]">
                        Review
                    </h3>
                    <div class="mt-1.5 flex flex-col gap-0.5">
                        <button
                            class={`flex h-8 items-center gap-2 rounded-[7px] border-0 px-2 text-[0.67rem] font-semibold ${props.activeTab === "changes" ? "bg-[#ded2e5] text-[#34273a]" : "bg-transparent text-[#65596a] hover:bg-[#ece8ed]"}`}
                            type="button"
                            aria-label="Changed files"
                            aria-pressed={props.activeTab === "changes"}
                            onClick={() => props.onTabChange("changes")}
                        >
                            <span class="grid h-5 w-5 place-items-center rounded-[5px] bg-white/70 text-[0.62rem]">
                                ±
                            </span>
                            <span class="flex-1 text-left">Changed files</span>
                            <span class="text-[0.54rem] font-extrabold">3</span>
                        </button>
                        <button
                            class={`flex h-8 items-center gap-2 rounded-[7px] border-0 px-2 text-[0.67rem] font-semibold ${props.activeTab === "checks" ? "bg-[#ded2e5] text-[#34273a]" : "bg-transparent text-[#65596a] hover:bg-[#ece8ed]"}`}
                            type="button"
                            aria-label="Verification"
                            aria-pressed={props.activeTab === "checks"}
                            onClick={() => props.onTabChange("checks")}
                        >
                            <span class="grid h-5 w-5 place-items-center rounded-[5px] bg-[#e3f1e7] text-[0.58rem] font-black text-[#347548]">
                                ✓
                            </span>
                            <span class="flex-1 text-left">Verification</span>
                            <span class="text-[0.54rem] font-extrabold text-[#347548]">4</span>
                        </button>
                    </div>
                </nav>

                <section class="mt-4" aria-labelledby="files-changed-files">
                    <h3
                        class="px-2 text-[0.54rem] font-black uppercase tracking-[0.11em] text-[#918695]"
                        id="files-changed-files"
                    >
                        Changed files
                    </h3>
                    <div class="mt-1.5 flex flex-col gap-0.5" aria-label="Changed files">
                        <For
                            each={visibleFiles()}
                            fallback={
                                <p class="px-2 py-4 text-center text-[0.58rem] text-[#918793]">
                                    No files match.
                                </p>
                            }
                        >
                            {(file) => (
                                <button
                                    class={`flex min-h-10 w-full items-center gap-2 rounded-[7px] border-0 px-2 py-1.5 text-left transition ${props.activeTab === "changes" && props.activeFileId === file.id ? "bg-[#ded2e5] text-[#34273a]" : "bg-transparent text-[#625667] hover:bg-[#ece8ed]"}`}
                                    type="button"
                                    aria-label={`Open ${file.name} diff`}
                                    aria-pressed={
                                        props.activeTab === "changes" &&
                                        props.activeFileId === file.id
                                    }
                                    onClick={() => {
                                        props.onFileChange(file.id);
                                        props.onTabChange("changes");
                                    }}
                                >
                                    <span
                                        class={`grid h-5 w-5 shrink-0 place-items-center rounded-[5px] font-mono text-[0.5rem] font-black ${file.status === "added" ? "bg-[#e1f0e5] text-[#347749]" : "bg-white/75 text-[#735b78]"}`}
                                    >
                                        {file.status === "added" ? "A" : "M"}
                                    </span>
                                    <span class="min-w-0 flex-1">
                                        <span class="block truncate text-[0.6rem] font-extrabold">
                                            {file.name}
                                        </span>
                                        <span class="mt-0.5 block truncate text-[0.47rem] opacity-65">
                                            {file.path}
                                        </span>
                                    </span>
                                    <span class="text-right text-[0.47rem] font-bold">
                                        <span class="block text-[#3b8250]">+{file.additions}</span>
                                        <span class="block text-[#a95656]">−{file.deletions}</span>
                                    </span>
                                </button>
                            )}
                        </For>
                    </div>
                </section>

                <section class="mt-4" aria-labelledby="files-recent-reviews">
                    <h3
                        class="px-2 text-[0.54rem] font-black uppercase tracking-[0.11em] text-[#918695]"
                        id="files-recent-reviews"
                    >
                        Recently reviewed
                    </h3>
                    <div class="mt-2 space-y-2 px-2">
                        <div>
                            <p class="truncate text-[0.6rem] font-bold text-[#625767]">
                                Bottom-anchored chat
                            </p>
                            <p class="mt-0.5 text-[0.49rem] font-semibold text-[#438157]">
                                ✓ Approved · 18m
                            </p>
                        </div>
                        <div>
                            <p class="truncate text-[0.6rem] font-bold text-[#625767]">
                                Chat verification
                            </p>
                            <p class="mt-0.5 text-[0.49rem] font-semibold text-[#438157]">
                                ✓ Approved · 32m
                            </p>
                        </div>
                    </div>
                </section>
            </div>

            <footer class="shrink-0 border-t border-[#ded9df] p-3">
                <div class="flex items-center justify-between rounded-[8px] border border-[#d8d2da] bg-white px-2.5 py-2">
                    <span>
                        <span class="block text-[0.55rem] font-extrabold text-[#554a58]">
                            All checks passed
                        </span>
                        <span class="mt-0.5 block text-[0.48rem] text-[#8b818d]">
                            Commit eb0fb8a
                        </span>
                    </span>
                    <span class="grid h-6 w-6 place-items-center rounded-full bg-[#e3f1e7] text-[0.62rem] font-black text-[#347548]">
                        ✓
                    </span>
                </div>
            </footer>
        </aside>
    );
}
