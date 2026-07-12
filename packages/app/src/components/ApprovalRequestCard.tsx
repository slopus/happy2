import { createSignal } from "solid-js";
import { Avatar } from "rigged-ui";

export type ApprovalRequest = {
    action: string;
    agent: string;
    avatarClass: string;
    impact: string;
    initials: string;
    reason: string;
    resources: string[];
    title: string;
    typeLabel: string;
};

type ApprovalResolution = "approved" | "denied" | "pending";

export function ApprovalRequestCard(props: { request: ApprovalRequest }) {
    const [expanded, setExpanded] = createSignal(false);
    const [resolution, setResolution] = createSignal<ApprovalResolution>("pending");
    let card: HTMLElement | undefined;
    const resolved = () => resolution() !== "pending";
    const toggleDetails = () => {
        const nextExpanded = !expanded();
        setExpanded(nextExpanded);
        if (nextExpanded) {
            queueMicrotask(() => card?.scrollIntoView?.({ block: "nearest" }));
        }
    };

    return (
        <section
            ref={(element) => {
                card = element;
            }}
            class={`mt-2.5 max-w-[680px] overflow-hidden rounded-[10px] border bg-[#fffdf8] shadow-[0_2px_8px_rgb(73_51_20_/_6%)] ${resolution() === "approved" ? "border-[#b8d4be] border-l-[3px] border-l-[#4d9660]" : resolution() === "denied" ? "border-[#dfc3c3] border-l-[3px] border-l-[#b65c5c]" : "border-[#ddcfac] border-l-[3px] border-l-[#c2933f]"}`}
            aria-label={`Approval request: ${props.request.title}`}
        >
            <div class="flex items-start gap-2.5 px-3 py-2.5">
                <span
                    class={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-[7px] ${resolution() === "approved" ? "bg-[#e4f1e7] text-[#337345]" : resolution() === "denied" ? "bg-[#f5e7e7] text-[#9a4545]" : "bg-[#f5e9c9] text-[#8a6421]"}`}
                    aria-hidden="true"
                >
                    {resolution() === "approved" ? (
                        <span class="text-[0.72rem] font-black">✓</span>
                    ) : resolution() === "denied" ? (
                        <span class="text-[0.72rem] font-black">×</span>
                    ) : (
                        <svg
                            class="h-3.5 w-3.5 fill-none stroke-current stroke-[1.8]"
                            viewBox="0 0 24 24"
                        >
                            <rect x="6" y="10" width="12" height="9" rx="2" />
                            <path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10" stroke-linecap="round" />
                        </svg>
                    )}
                </span>

                <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span
                            class={`text-[0.58rem] font-black uppercase tracking-[0.09em] ${resolution() === "approved" ? "text-[#367849]" : resolution() === "denied" ? "text-[#9a4545]" : "text-[#8a6421]"}`}
                        >
                            {resolution() === "approved"
                                ? "Approved once"
                                : resolution() === "denied"
                                  ? "Request denied"
                                  : "Approval required"}
                        </span>
                        <span class="rounded-full border border-[#e0d4b9] bg-white/75 px-2 py-0.5 text-[0.52rem] font-extrabold text-[#75684d]">
                            {props.request.typeLabel}
                        </span>
                    </div>
                    <h4 class="mt-1 text-[0.74rem] font-extrabold text-[#37312a]">
                        {props.request.title}
                    </h4>
                    <p class="mt-1 text-[0.64rem] leading-4 text-[#71685d]">
                        {props.request.reason}
                    </p>
                </div>

                <Avatar
                    backgroundClass={props.request.avatarClass}
                    initials={props.request.initials}
                    size="xs"
                    type="bot"
                />
            </div>

            {expanded() && (
                <div class="border-y border-[#e7dcc2] bg-white/65 px-3 py-2.5">
                    <div class="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-2">
                        <span class="text-[0.55rem] font-black uppercase tracking-[0.08em] text-[#91846e]">
                            Requested action
                        </span>
                        <code class="min-w-0 break-all rounded-[5px] bg-[#f2eee6] px-2 py-1 font-mono text-[0.58rem] text-[#51483d]">
                            {props.request.action}
                        </code>
                        <span class="text-[0.55rem] font-black uppercase tracking-[0.08em] text-[#91846e]">
                            Impact
                        </span>
                        <span class="text-[0.61rem] leading-4 text-[#675e53]">
                            {props.request.impact}
                        </span>
                    </div>

                    <div class="mt-2.5 flex flex-wrap gap-1.5" aria-label="Affected resources">
                        {props.request.resources.map((resource) => (
                            <span class="rounded-md border border-[#ded5c2] bg-[#faf7f0] px-2 py-1 text-[0.54rem] font-bold text-[#756b59]">
                                {resource}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            <div class="flex min-h-10 items-center gap-2 bg-[#fcf8ee] px-3 py-2" aria-live="polite">
                <span
                    class={`h-1.5 w-1.5 shrink-0 rounded-full ${resolution() === "approved" ? "bg-[#54a269]" : resolution() === "denied" ? "bg-[#be6868]" : "animate-pulse bg-[#c4933f]"}`}
                />
                <span class="text-[0.58rem] font-bold text-[#7c705e]">
                    {resolution() === "approved"
                        ? `${props.request.agent} may perform this action once`
                        : resolution() === "denied"
                          ? `${props.request.agent} remains paused`
                          : "Waiting for a person"}
                </span>

                <button
                    class="ml-auto rounded-md border-0 bg-transparent px-2 py-1 text-[0.58rem] font-extrabold text-[#775d32] hover:bg-[#f1e7d1] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#8b692f]"
                    type="button"
                    aria-expanded={expanded()}
                    aria-label={`${expanded() ? "Hide" : "View"} approval details`}
                    onClick={toggleDetails}
                >
                    {expanded() ? "Hide details" : "Review details"}
                </button>

                {resolved() ? (
                    <button
                        class="h-7 rounded-md border border-[#cdbf9e] bg-white px-2.5 text-[0.58rem] font-extrabold text-[#665a47] hover:bg-[#f7f2e7] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#8b692f]"
                        type="button"
                        aria-label={`Reset approval request for ${props.request.agent}`}
                        onClick={() => setResolution("pending")}
                    >
                        Undo
                    </button>
                ) : (
                    <>
                        <button
                            class="h-7 rounded-md border border-[#cdbf9e] bg-white px-2.5 text-[0.58rem] font-extrabold text-[#755151] hover:border-[#be8989] hover:bg-[#fcf2f2] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#9b5656]"
                            type="button"
                            aria-label={`Deny ${props.request.agent} approval request`}
                            onClick={() => setResolution("denied")}
                        >
                            Deny
                        </button>
                        <button
                            class="h-7 rounded-md border border-[#8c672b] bg-[#8c672b] px-2.5 text-[0.58rem] font-extrabold text-white shadow-[0_1px_2px_rgb(76_49_13_/_16%)] hover:bg-[#765420] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#8b692f]"
                            type="button"
                            aria-label={`Allow ${props.request.agent} action once`}
                            onClick={() => setResolution("approved")}
                        >
                            Allow once
                        </button>
                    </>
                )}
            </div>
        </section>
    );
}
