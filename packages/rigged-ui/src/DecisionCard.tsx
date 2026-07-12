import { splitProps, type JSX } from "solid-js";
import type { ContextItem } from "./ContextIcon";

const isWebKitBrowser =
    typeof navigator !== "undefined" &&
    /AppleWebKit/.test(navigator.userAgent) &&
    !/(Chrome|Chromium)/.test(navigator.userAgent);

export type Decision = {
    acceptedBy: number;
    context: ContextItem;
    criteria: string[];
    decidedBy: string;
    id: string;
    rationale: string;
    summary: string;
    title: string;
};

export type DecisionCardProps = Omit<JSX.HTMLAttributes<HTMLElement>, "children" | "onChange"> & {
    attached: boolean;
    decision: Decision;
    expanded: boolean;
    onAddContext: (context: ContextItem) => void;
    onExpandedChange: (expanded: boolean) => void;
};

function CheckMark(props: { part: string }) {
    return (
        <svg
            class="block h-3.5 w-3.5 fill-none stroke-current stroke-2"
            data-rigged-ui={props.part}
            viewBox="0 0 16 16"
            aria-hidden="true"
        >
            <path
                d="M3.25 8.15 6.45 11.2 12.75 4.8"
                transform={
                    props.part === "decision-criterion-mark" ? "translate(0.5 0)" : undefined
                }
                stroke-linecap="round"
                stroke-linejoin="round"
            />
        </svg>
    );
}

export function DecisionCard(props: DecisionCardProps) {
    const [local, rest] = splitProps(props, [
        "attached",
        "class",
        "decision",
        "expanded",
        "onAddContext",
        "onExpandedChange",
        "style",
    ]);

    return (
        <section
            {...rest}
            class={`mt-2.5 grid w-full max-w-[680px] overflow-hidden rounded-[10px] border border-[#d8d2c4] bg-[#fffdf8] font-['Rigged_Manrope'] shadow-[0_2px_7px_rgb(56_43_25_/_5%)] ${local.expanded ? "h-[334px] grid-rows-[108px_174px_50px]" : "h-[160px] grid-rows-[108px_50px]"} ${local.class ?? ""}`}
            style={local.style}
            data-rigged-ui="decision-card"
            data-attached={local.attached ? "true" : "false"}
            data-expanded={local.expanded ? "true" : "false"}
            aria-label={`Decision: ${local.decision.title}`}
        >
            <style>{`
                @-moz-document url-prefix() {
                    .rigged-decision-card__title-ink { transform: translateY(-0.5px); }
                }
            `}</style>
            <div class="flex items-start gap-2.5 px-3 py-2.5" data-rigged-ui="decision-summary">
                <span
                    class="grid h-7 w-7 shrink-0 place-items-center rounded-[8px] bg-[#f3e8c9] text-[#7b5c1f]"
                    data-rigged-ui="decision-mark-container"
                    aria-hidden="true"
                >
                    <CheckMark part="decision-mark" />
                </span>

                <div class="min-w-0 flex-1" data-rigged-ui="decision-copy">
                    <div class="flex h-[18px] items-center gap-2">
                        <span
                            class="h-[18px] rounded-full bg-[#f2e8cf] px-2 text-[0.55rem] leading-[18px] font-extrabold uppercase tracking-[0.06em] text-[#785c27]"
                            data-rigged-ui="decision-label"
                        >
                            Decision
                        </span>
                        <span
                            class="text-[0.57rem] leading-[14px] font-medium text-[#9a8c72]"
                            data-rigged-ui="decision-accepted"
                        >
                            Accepted by {local.decision.acceptedBy}
                        </span>
                    </div>
                    <h4
                        class="mt-1 h-[14px] truncate text-[0.75rem] leading-[14px] font-extrabold text-[#3c352a]"
                        data-rigged-ui="decision-title"
                    >
                        <span
                            class="rigged-decision-card__title-ink block"
                            style={{
                                transform: isWebKitBrowser ? "translateY(-1px)" : undefined,
                            }}
                        >
                            {local.decision.title}
                        </span>
                    </h4>
                    <p
                        class="mt-1 line-clamp-2 h-8 text-[0.65rem] leading-4 text-[#716758]"
                        data-rigged-ui="decision-summary-text"
                    >
                        {local.decision.summary}
                    </p>
                    <p
                        class="mt-1 text-[0.56rem] leading-[14px] font-medium text-[#998d7b]"
                        data-rigged-ui="decision-byline"
                    >
                        Decided by {local.decision.decidedBy}
                    </p>
                </div>
            </div>

            {local.expanded && (
                <div
                    class="overflow-hidden border-t border-[#e8e1d4] bg-white/70 px-3 py-2.5"
                    data-rigged-ui="decision-details"
                >
                    <p class="text-[0.58rem] leading-[12px] font-extrabold uppercase tracking-[0.07em] text-[#8a7b64]">
                        Why
                    </p>
                    <p
                        class="mt-1 line-clamp-2 h-8 text-[0.64rem] leading-4 text-[#655c50]"
                        data-rigged-ui="decision-rationale"
                    >
                        {local.decision.rationale}
                    </p>
                    <p class="mt-2 text-[0.58rem] leading-[12px] font-extrabold uppercase tracking-[0.07em] text-[#8a7b64]">
                        Acceptance criteria
                    </p>
                    <ul
                        class="mt-1.5 grid max-h-[70px] gap-1.5 overflow-hidden"
                        data-rigged-ui="decision-criteria"
                    >
                        {local.decision.criteria.slice(0, 3).map((criterion) => (
                            <li class="flex h-4 items-start gap-2 text-[0.63rem] leading-4 text-[#5e564c]">
                                <span
                                    class="grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full bg-[#efe5ca] text-[#796027]"
                                    data-rigged-ui="decision-criterion-mark-container"
                                    aria-hidden="true"
                                >
                                    <CheckMark part="decision-criterion-mark" />
                                </span>
                                <span class="truncate">{criterion}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div
                class="flex items-center justify-between border-t border-[#e8e1d4] px-3 py-2"
                data-rigged-ui="decision-actions"
            >
                <button
                    class="h-7 rounded-md border-0 bg-transparent px-1 text-[0.61rem] leading-[14px] font-bold text-[#786544] hover:bg-[#f4ecda] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#806630]"
                    data-rigged-ui="decision-toggle"
                    type="button"
                    aria-expanded={local.expanded}
                    aria-label={`${local.expanded ? "Hide" : "View"} ${local.decision.title} decision details`}
                    onClick={() => local.onExpandedChange(!local.expanded)}
                >
                    {local.expanded ? "Hide details" : "View details"}
                </button>
                <button
                    class={`h-7 w-24 rounded-md border px-3 text-[0.61rem] leading-[14px] font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#806630] ${local.attached ? "border-[#d6ccb7] bg-[#f3eddf] text-[#776c58]" : "border-[#846b38] bg-[#846b38] text-white hover:bg-[#705a2f]"}`}
                    data-rigged-ui="decision-add-context"
                    type="button"
                    aria-label={
                        local.attached
                            ? `${local.decision.title} decision added to context`
                            : `Add ${local.decision.title} decision to context`
                    }
                    disabled={local.attached}
                    onClick={() => local.onAddContext(local.decision.context)}
                >
                    {local.attached ? "Added to context" : "Add to context"}
                </button>
            </div>
        </section>
    );
}
