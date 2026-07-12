import { For, Show, splitProps, type JSX } from "solid-js";
import { ContextIcon, type ContextItem, type ContextKind } from "./ContextIcon";

export type ContextPickerProps = Omit<
    JSX.HTMLAttributes<HTMLDivElement>,
    "children" | "onToggle"
> & {
    items: ContextItem[];
    onDone: () => void;
    onToggle: (item: ContextItem) => void;
    selectedItems: ContextItem[];
};

const kindStyles: Record<ContextKind, string> = {
    file: "bg-[#e8eef8] text-[#426995]",
    run: "bg-[#e5f2e9] text-[#39764c]",
    thread: "bg-[#f1e7f3] text-[#79477f]",
};

export function ContextPicker(props: ContextPickerProps) {
    const [local, rest] = splitProps(props, [
        "aria-label",
        "class",
        "items",
        "onDone",
        "onToggle",
        "selectedItems",
    ]);
    const isSelected = (item: ContextItem) =>
        local.selectedItems.some((selectedItem) => selectedItem.id === item.id);

    return (
        <div
            {...rest}
            aria-label={local["aria-label"] ?? "Add context"}
            class={`box-border w-[360px] overflow-hidden rounded-[11px] border border-[#d5ced8] bg-white font-['Rigged_Manrope',sans-serif] shadow-[0_16px_36px_rgb(43_24_46_/_18%)] ${local.class ?? ""}`}
            data-rigged-ui="context-picker"
            role="dialog"
        >
            <style>{`
                .rigged-context-picker__title { transform: translateY(-0.5px); }
                @-moz-document url-prefix() {
                    .rigged-context-picker__title { transform: none; }
                }
                @supports (font: -apple-system-body) {
                    .rigged-context-picker__title { transform: none; }
                }
            `}</style>
            <header
                class="box-border grid h-14 content-center border-b border-[#e7e2e8] bg-[#faf8fb] px-3"
                data-rigged-ui="context-picker-header"
            >
                <span
                    class="rigged-context-picker__title block text-[11px] font-extrabold leading-[14px] text-[#3d343d]"
                    data-rigged-ui="context-picker-title"
                >
                    Add context
                </span>
                <span
                    class="mt-0.5 block text-[9.28px] leading-3 text-[#8d848c]"
                    data-rigged-ui="context-picker-description"
                >
                    Give agents the source material behind your request.
                </span>
            </header>

            <div class="p-1.5" data-rigged-ui="context-picker-list">
                <Show
                    when={local.items.length > 0}
                    fallback={
                        <p
                            class="m-0 grid h-16 place-items-center px-3 text-center text-[10.88px] leading-[14px] text-[#8b8389]"
                            data-rigged-ui="context-picker-empty"
                        >
                            No context available.
                        </p>
                    }
                >
                    <For each={local.items}>
                        {(item) => {
                            const selected = () => isSelected(item);
                            return (
                                <button
                                    aria-label={item.label}
                                    aria-pressed={selected()}
                                    class={`box-border flex h-[52px] w-full items-center gap-2.5 rounded-lg border-0 px-2 py-0 text-left focus:outline-none ${selected() ? "bg-[#eee7f3]" : "bg-transparent hover:bg-[#f3eff5] focus:bg-[#f0ebf3]"}`}
                                    data-item-id={item.id}
                                    data-rigged-ui="context-picker-item"
                                    type="button"
                                    onClick={() => local.onToggle(item)}
                                >
                                    <span
                                        class={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${kindStyles[item.kind]}`}
                                        data-rigged-ui="context-picker-item-icon"
                                    >
                                        <ContextIcon kind={item.kind} />
                                    </span>
                                    <span class="min-w-0 flex-1">
                                        <span
                                            class="block truncate text-[11px] font-extrabold leading-[14px] text-[#3b333b]"
                                            data-rigged-ui="context-picker-item-label"
                                        >
                                            {item.label}
                                        </span>
                                        <span
                                            class="mt-0.5 block truncate text-[9.28px] leading-3 text-[#877d85]"
                                            data-rigged-ui="context-picker-item-detail"
                                        >
                                            {item.detail}
                                        </span>
                                    </span>
                                    <span
                                        aria-hidden="true"
                                        class={`grid h-4 w-4 shrink-0 place-items-center rounded-[5px] border ${selected() ? "border-[#76517e] bg-[#76517e] text-white" : "border-[#ccc4cf] bg-white text-transparent"}`}
                                        data-rigged-ui="context-picker-selection"
                                    >
                                        <svg
                                            class="block h-3 w-3 overflow-visible"
                                            data-rigged-ui="context-picker-selection-mark"
                                            viewBox="0 0 12 12"
                                            aria-hidden="true"
                                        >
                                            <path
                                                data-rigged-ui="context-picker-selection-artwork"
                                                d="M2 6.25 4.65 8.8 10 3.3"
                                                fill="none"
                                                stroke="currentColor"
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                                stroke-width="1.5"
                                                transform="translate(0 -0.5)"
                                                vector-effect="non-scaling-stroke"
                                            />
                                        </svg>
                                    </span>
                                </button>
                            );
                        }}
                    </For>
                </Show>
            </div>

            <footer
                class="box-border flex h-11 items-center justify-between border-t border-[#e7e2e8] bg-[#faf8fb] px-3"
                data-rigged-ui="context-picker-footer"
            >
                <span
                    class="text-[9.28px] font-medium leading-3 text-[#8a8088]"
                    data-rigged-ui="context-picker-count"
                >
                    {local.selectedItems.length} attached
                </span>
                <button
                    class="box-border h-7 rounded-md border border-[#76517e] bg-[#76517e] px-3 py-0 text-[9.76px] font-extrabold leading-3 text-white hover:bg-[#65436d] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#6f4b92]"
                    data-rigged-ui="context-picker-done"
                    type="button"
                    onClick={local.onDone}
                >
                    Done
                </button>
            </footer>
        </div>
    );
}
