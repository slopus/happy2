import { createSignal } from "solid-js";
import type { ContextItem } from "./ContextPicker";

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

type DecisionCardProps = {
  attached: boolean;
  decision: Decision;
  onAddContext: (context: ContextItem) => void;
};

export function DecisionCard(props: DecisionCardProps) {
  const [expanded, setExpanded] = createSignal(false);

  return (
    <section
      class="mt-2.5 max-w-[680px] overflow-hidden rounded-[10px] border border-[#d8d2c4] bg-[#fffdf8] shadow-[0_2px_7px_rgb(56_43_25_/_5%)]"
      aria-label={`Decision: ${props.decision.title}`}
    >
      <div class="flex items-start gap-2.5 px-3 py-2.5">
        <span class="grid h-7 w-7 shrink-0 place-items-center rounded-[8px] bg-[#f3e8c9] text-[0.76rem] font-black text-[#7b5c1f]" aria-hidden="true">
          ✓
        </span>
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <span class="rounded-full bg-[#f2e8cf] px-2 py-0.5 text-[0.55rem] font-extrabold uppercase tracking-[0.06em] text-[#785c27]">
              Decision
            </span>
            <span class="text-[0.57rem] font-medium text-[#9a8c72]">Accepted by {props.decision.acceptedBy}</span>
          </div>
          <h4 class="mt-1 text-[0.75rem] font-extrabold text-[#3c352a]">{props.decision.title}</h4>
          <p class="mt-1 text-[0.65rem] leading-4 text-[#716758]">{props.decision.summary}</p>
          <p class="mt-1.5 text-[0.56rem] font-medium text-[#998d7b]">Decided by {props.decision.decidedBy}</p>
        </div>
      </div>

      {expanded() && (
        <div class="border-t border-[#e8e1d4] bg-white/70 px-3 py-2.5">
          <p class="text-[0.58rem] font-extrabold uppercase tracking-[0.07em] text-[#8a7b64]">Why</p>
          <p class="mt-1 text-[0.64rem] leading-4 text-[#655c50]">{props.decision.rationale}</p>
          <p class="mt-2.5 text-[0.58rem] font-extrabold uppercase tracking-[0.07em] text-[#8a7b64]">Acceptance criteria</p>
          <ul class="mt-1.5 flex flex-col gap-1.5">
            {props.decision.criteria.map((criterion) => (
              <li class="flex items-start gap-2 text-[0.63rem] leading-4 text-[#5e564c]">
                <span class="mt-0.5 grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full bg-[#efe5ca] text-[0.5rem] font-black text-[#796027]" aria-hidden="true">
                  ✓
                </span>
                <span>{criterion}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div class="flex items-center justify-between border-t border-[#e8e1d4] px-3 py-2">
        <button
          class="rounded-md border-0 bg-transparent px-1 py-1 text-[0.61rem] font-bold text-[#786544] hover:bg-[#f4ecda] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#806630]"
          type="button"
          aria-expanded={expanded()}
          aria-label={`${expanded() ? "Hide" : "View"} ${props.decision.title} decision details`}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded() ? "Hide details" : "View details"}
        </button>
        <button
          class={`h-7 rounded-md border px-3 text-[0.61rem] font-extrabold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#806630] ${props.attached ? "border-[#d6ccb7] bg-[#f3eddf] text-[#776c58]" : "border-[#846b38] bg-[#846b38] text-white hover:bg-[#705a2f]"}`}
          type="button"
          aria-label={props.attached ? `${props.decision.title} decision added to context` : `Add ${props.decision.title} decision to context`}
          disabled={props.attached}
          onClick={() => props.onAddContext(props.decision.context)}
        >
          {props.attached ? "Added to context" : "Add to context"}
        </button>
      </div>
    </section>
  );
}
