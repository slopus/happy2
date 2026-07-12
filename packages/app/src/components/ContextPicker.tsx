import { ContextIcon, type ContextItem } from "rigged-ui";

export type { ContextItem } from "rigged-ui";

type ContextPickerProps = {
    items: ContextItem[];
    onDone: () => void;
    onToggle: (item: ContextItem) => void;
    selectedItems: ContextItem[];
};

type ContextChipsProps = {
    items: ContextItem[];
    label: string;
    onRemove?: (item: ContextItem) => void;
};

export function ContextChips(props: ContextChipsProps) {
    return (
        <div class="flex flex-wrap gap-1.5" aria-label={props.label}>
            {props.items.map((item) => (
                <span class="flex h-7 max-w-[260px] items-center gap-1.5 rounded-[7px] border border-[#d9d2dd] bg-[#f7f4f9] px-2 text-[0.59rem] font-bold text-[#605365]">
                    <ContextIcon kind={item.kind} />
                    <span class="truncate">{item.label}</span>
                    {props.onRemove && (
                        <button
                            class="ml-0.5 grid h-4 w-4 place-items-center rounded border-0 bg-transparent p-0 text-[0.65rem] text-[#8a7e89] hover:bg-[#e7e0ea] hover:text-[#443a44] focus-visible:outline-2 focus-visible:outline-[#6f4b92]"
                            type="button"
                            aria-label={`Remove ${item.label}`}
                            onClick={() => props.onRemove?.(item)}
                        >
                            ×
                        </button>
                    )}
                </span>
            ))}
        </div>
    );
}

export function ContextPicker(props: ContextPickerProps) {
    const isSelected = (item: ContextItem) =>
        props.selectedItems.some((selectedItem) => selectedItem.id === item.id);

    return (
        <div
            class="absolute bottom-[calc(100%+8px)] left-0 z-20 w-[360px] overflow-hidden rounded-[11px] border border-[#d5ced8] bg-white shadow-[0_16px_36px_rgb(43_24_46_/_18%)]"
            role="dialog"
            aria-label="Add context"
        >
            <div class="border-b border-[#e7e2e8] bg-[#faf8fb] px-3 py-2">
                <p class="text-[0.68rem] font-extrabold text-[#3d343d]">Add context</p>
                <p class="mt-0.5 text-[0.58rem] text-[#8d848c]">
                    Give agents the source material behind your request.
                </p>
            </div>

            <div class="p-1.5">
                {props.items.map((item) => (
                    <button
                        class={`flex w-full items-center gap-2.5 rounded-[8px] border-0 px-2 py-2 text-left transition focus:outline-none ${isSelected(item) ? "bg-[#eee7f3]" : "bg-transparent hover:bg-[#f3eff5] focus:bg-[#f0ebf3]"}`}
                        type="button"
                        aria-label={item.label}
                        aria-pressed={isSelected(item)}
                        onClick={() => props.onToggle(item)}
                    >
                        <span
                            class={`grid h-8 w-8 shrink-0 place-items-center rounded-[8px] ${item.kind === "file" ? "bg-[#e8eef8] text-[#426995]" : item.kind === "thread" ? "bg-[#f1e7f3] text-[#79477f]" : "bg-[#e5f2e9] text-[#39764c]"}`}
                        >
                            <ContextIcon kind={item.kind} />
                        </span>
                        <span class="min-w-0 flex-1">
                            <span class="block truncate text-[0.69rem] font-extrabold text-[#3b333b]">
                                {item.label}
                            </span>
                            <span class="mt-0.5 block truncate text-[0.58rem] text-[#877d85]">
                                {item.detail}
                            </span>
                        </span>
                        <span
                            class={`grid h-4 w-4 shrink-0 place-items-center rounded-[5px] border text-[0.6rem] font-black ${isSelected(item) ? "border-[#76517e] bg-[#76517e] text-white" : "border-[#ccc4cf] bg-white text-transparent"}`}
                        >
                            ✓
                        </span>
                    </button>
                ))}
            </div>

            <div class="flex items-center justify-between border-t border-[#e7e2e8] bg-[#faf8fb] px-3 py-2">
                <span class="text-[0.58rem] font-medium text-[#8a8088]">
                    {props.selectedItems.length} attached
                </span>
                <button
                    class="h-7 rounded-md border border-[#76517e] bg-[#76517e] px-3 text-[0.61rem] font-extrabold text-white hover:bg-[#65436d] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#6f4b92]"
                    type="button"
                    onClick={props.onDone}
                >
                    Done
                </button>
            </div>
        </div>
    );
}
