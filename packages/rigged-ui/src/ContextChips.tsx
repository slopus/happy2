import { For, Show, splitProps, type JSX } from "solid-js";
import { ContextIcon, type ContextItem } from "./ContextIcon";

export type ContextChipsProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, "children"> & {
    chipWidth?: number | string;
    items: ContextItem[];
    label: string;
    onRemove?: (item: ContextItem) => void;
    readOnly?: boolean;
};

export function ContextChips(props: ContextChipsProps) {
    const [local, rest] = splitProps(props, [
        "chipWidth",
        "class",
        "items",
        "label",
        "onRemove",
        "readOnly",
    ]);
    const isRemovable = () => Boolean(local.onRemove) && !local.readOnly;

    return (
        <div
            {...rest}
            aria-label={local.label}
            class={`flex flex-wrap gap-1.5 font-['Rigged_Manrope',sans-serif] ${local.class ?? ""}`}
            data-rigged-ui="context-chips"
            data-read-only={isRemovable() ? "false" : "true"}
        >
            <For each={local.items}>
                {(item) => (
                    <span
                        class="box-border flex h-7 max-w-[260px] items-center gap-1.5 rounded-[7px] border border-[#d9d2dd] bg-[#f7f4f9] px-2 text-[#605365]"
                        data-item-id={item.id}
                        data-rigged-ui="context-chip"
                        style={{
                            width:
                                typeof local.chipWidth === "number"
                                    ? `${local.chipWidth}px`
                                    : local.chipWidth,
                        }}
                    >
                        <ContextIcon kind={item.kind} />
                        <span
                            class={`${local.chipWidth === undefined ? "" : "flex-1"} min-w-0 truncate font-bold text-[9.5px] leading-[12px]`}
                            data-rigged-ui="context-chip-label"
                        >
                            {item.label}
                        </span>
                        <Show when={isRemovable()}>
                            <button
                                aria-label={`Remove ${item.label}`}
                                class="ml-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border-0 bg-transparent p-0 text-[#8a7e89] hover:bg-[#e7e0ea] hover:text-[#443a44] focus-visible:outline-2 focus-visible:outline-[#6f4b92]"
                                data-rigged-ui="context-chip-remove"
                                type="button"
                                onClick={() => local.onRemove?.(item)}
                            >
                                <svg
                                    aria-hidden="true"
                                    class="block h-2 w-2 overflow-visible"
                                    data-rigged-ui="context-chip-remove-icon"
                                    viewBox="0 0 8 8"
                                >
                                    <path
                                        d="M1.25 1.25 6.75 6.75M6.75 1.25 1.25 6.75"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-linecap="round"
                                        stroke-width="1.25"
                                        vector-effect="non-scaling-stroke"
                                    />
                                </svg>
                            </button>
                        </Show>
                    </span>
                )}
            </For>
        </div>
    );
}
