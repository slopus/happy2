import { splitProps, type JSX } from "solid-js";
import { Avatar } from "./Avatar";

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

export type ApprovalResolution = "approved" | "denied" | "pending";

export type ApprovalRequestCardProps = Omit<
    JSX.HTMLAttributes<HTMLElement>,
    "children" | "onChange"
> & {
    expanded: boolean;
    onExpandedChange: (expanded: boolean) => void;
    onResolutionChange: (resolution: ApprovalResolution) => void;
    request: ApprovalRequest;
    resolution: ApprovalResolution;
};

export function ApprovalRequestCard(props: ApprovalRequestCardProps) {
    const [local, rest] = splitProps(props, [
        "class",
        "expanded",
        "onExpandedChange",
        "onResolutionChange",
        "request",
        "resolution",
    ]);
    const resolved = () => local.resolution !== "pending";
    const resolutionLabel = () =>
        local.resolution === "approved"
            ? "Approved once"
            : local.resolution === "denied"
              ? "Request denied"
              : "Approval required";

    return (
        <section
            {...rest}
            class={`mt-2.5 w-full max-w-[680px] overflow-hidden rounded-[10px] border bg-[#fffdf8] font-['Rigged_Manrope'] shadow-[0_2px_8px_rgb(73_51_20_/_6%)] ${local.resolution === "approved" ? "border-[#b8d4be] border-l-[3px] border-l-[#4d9660]" : local.resolution === "denied" ? "border-[#dfc3c3] border-l-[3px] border-l-[#b65c5c]" : "border-[#ddcfac] border-l-[3px] border-l-[#c2933f]"} ${local.class ?? ""}`}
            data-rigged-ui="approval-request-card"
            data-resolution={local.resolution}
            aria-label={`Approval request: ${local.request.title}`}
        >
            <div
                class="flex min-h-[82px] items-start gap-2.5 px-3 py-2.5"
                data-rigged-ui="approval-request-summary"
            >
                <span
                    class={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-[7px] ${local.resolution === "approved" ? "bg-[#e4f1e7] text-[#337345]" : local.resolution === "denied" ? "bg-[#f5e7e7] text-[#9a4545]" : "bg-[#f5e9c9] text-[#8a6421]"}`}
                    data-rigged-ui="approval-request-mark"
                    aria-hidden="true"
                >
                    {local.resolution === "approved" ? (
                        <svg
                            class="block h-3.5 w-3.5 overflow-visible"
                            data-rigged-ui="approval-request-approved-mark"
                            viewBox="0 0 14 14"
                        >
                            <path
                                d="M2 7 5.25 10.25 12 3.5"
                                transform="translate(0 -0.5)"
                                fill="none"
                                stroke="currentColor"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="1.5"
                                vector-effect="non-scaling-stroke"
                            />
                        </svg>
                    ) : local.resolution === "denied" ? (
                        <svg
                            class="block h-3.5 w-3.5 overflow-visible"
                            data-rigged-ui="approval-request-denied-mark"
                            viewBox="0 0 14 14"
                        >
                            <path
                                d="M3 3 11 11M11 3 3 11"
                                fill="none"
                                stroke="currentColor"
                                stroke-linecap="round"
                                stroke-width="1.5"
                                vector-effect="non-scaling-stroke"
                            />
                        </svg>
                    ) : (
                        <svg
                            class="h-3.5 w-3.5 fill-none stroke-current stroke-[1.8]"
                            data-rigged-ui="approval-request-lock-mark"
                            viewBox="0 0 24 24"
                        >
                            <g class="rigged-approval-lock-artwork">
                                <rect x="6" y="10" width="12" height="9" rx="2" />
                                <path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10" stroke-linecap="round" />
                            </g>
                        </svg>
                    )}
                </span>

                <div class="min-w-0 flex-1" data-rigged-ui="approval-request-copy">
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span
                            class={`text-[0.58rem] font-black uppercase tracking-[0.09em] ${local.resolution === "approved" ? "text-[#367849]" : local.resolution === "denied" ? "text-[#9a4545]" : "text-[#8a6421]"}`}
                            data-rigged-ui="approval-request-label"
                        >
                            {resolutionLabel()}
                        </span>
                        <span
                            class="rounded-full border border-[#e0d4b9] bg-white/75 px-2 py-0.5 text-[0.52rem] font-extrabold text-[#75684d]"
                            data-rigged-ui="approval-request-type"
                        >
                            {local.request.typeLabel}
                        </span>
                    </div>
                    <h4
                        class="mt-1 text-[0.74rem] leading-[14px] font-extrabold text-[#37312a]"
                        data-rigged-ui="approval-request-title"
                    >
                        {local.request.title}
                    </h4>
                    <p
                        class="mt-1 text-[0.64rem] leading-4 text-[#71685d]"
                        data-rigged-ui="approval-request-reason"
                    >
                        {local.request.reason}
                    </p>
                </div>

                <Avatar
                    backgroundClass={local.request.avatarClass}
                    initials={local.request.initials}
                    size="xs"
                    type="bot"
                />
            </div>

            {local.expanded && (
                <div
                    class="h-[106px] border-y border-[#e7dcc2] bg-white/65 px-3 py-2.5"
                    data-rigged-ui="approval-request-details"
                >
                    <div class="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-2">
                        <span class="text-[0.55rem] font-black uppercase tracking-[0.08em] text-[#91846e]">
                            Requested action
                        </span>
                        <code
                            class="min-w-0 break-all rounded-[5px] bg-[#f2eee6] px-2 py-1 font-mono text-[0.58rem] text-[#51483d]"
                            data-rigged-ui="approval-request-action"
                        >
                            {local.request.action}
                        </code>
                        <span class="text-[0.55rem] font-black uppercase tracking-[0.08em] text-[#91846e]">
                            Impact
                        </span>
                        <span class="text-[0.61rem] leading-4 text-[#675e53]">
                            {local.request.impact}
                        </span>
                    </div>

                    <div
                        class="mt-2.5 flex flex-wrap gap-1.5"
                        data-rigged-ui="approval-request-resources"
                        aria-label="Affected resources"
                    >
                        {local.request.resources.map((resource) => (
                            <span class="rounded-md border border-[#ded5c2] bg-[#faf7f0] px-2 py-1 text-[0.54rem] font-bold text-[#756b59]">
                                {resource}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            <div
                class="flex min-h-10 items-center gap-2 bg-[#fcf8ee] px-3 py-2"
                data-rigged-ui="approval-request-actions"
                aria-live="polite"
            >
                <span
                    class={`h-1.5 w-1.5 shrink-0 rounded-full ${local.resolution === "approved" ? "bg-[#54a269]" : local.resolution === "denied" ? "bg-[#be6868]" : "bg-[#c4933f]"}`}
                    data-rigged-ui="approval-request-status"
                    aria-hidden="true"
                />
                <span
                    class="text-[0.58rem] font-bold text-[#7c705e]"
                    data-rigged-ui="approval-request-status-text"
                >
                    {local.resolution === "approved"
                        ? `${local.request.agent} may perform this action once`
                        : local.resolution === "denied"
                          ? `${local.request.agent} remains paused`
                          : "Waiting for a person"}
                </span>

                <button
                    class="ml-auto rounded-md border-0 bg-transparent px-2 py-1 text-[0.58rem] font-extrabold text-[#775d32] hover:bg-[#f1e7d1] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#8b692f]"
                    data-rigged-ui="approval-request-toggle"
                    type="button"
                    aria-expanded={local.expanded}
                    aria-label={`${local.expanded ? "Hide" : "View"} approval details`}
                    onClick={() => local.onExpandedChange(!local.expanded)}
                >
                    {local.expanded ? "Hide details" : "Review details"}
                </button>

                {resolved() ? (
                    <button
                        class="h-7 rounded-md border border-[#cdbf9e] bg-white px-2.5 text-[0.58rem] font-extrabold text-[#665a47] hover:bg-[#f7f2e7] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#8b692f]"
                        data-rigged-ui="approval-request-undo"
                        type="button"
                        aria-label={`Reset approval request for ${local.request.agent}`}
                        onClick={() => local.onResolutionChange("pending")}
                    >
                        Undo
                    </button>
                ) : (
                    <>
                        <button
                            class="h-7 rounded-md border border-[#cdbf9e] bg-white px-2.5 text-[0.58rem] font-extrabold text-[#755151] hover:border-[#be8989] hover:bg-[#fcf2f2] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#9b5656]"
                            data-rigged-ui="approval-request-deny"
                            type="button"
                            aria-label={`Deny ${local.request.agent} approval request`}
                            onClick={() => local.onResolutionChange("denied")}
                        >
                            Deny
                        </button>
                        <button
                            class="h-7 rounded-md border border-[#8c672b] bg-[#8c672b] px-2.5 text-[0.58rem] font-extrabold text-white shadow-[0_1px_2px_rgb(76_49_13_/_16%)] hover:bg-[#765420] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#8b692f]"
                            data-rigged-ui="approval-request-allow"
                            type="button"
                            aria-label={`Allow ${local.request.agent} action once`}
                            onClick={() => local.onResolutionChange("approved")}
                        >
                            Allow once
                        </button>
                    </>
                )}
            </div>
        </section>
    );
}
