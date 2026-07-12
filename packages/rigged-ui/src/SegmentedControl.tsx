import { For, Show, splitProps, type JSX } from "solid-js";
import { Icon, type IconName } from "./Icon";

export type SegmentedControlSize = "small" | "medium" | "large";
export type SegmentedControlSegment = { value: string; label: string; icon?: IconName };

export type SegmentedControlProps = {
    class?: string;
    "data-testid"?: string;
    style?: JSX.CSSProperties;
    value: string;
    onChange?: (value: string) => void;
    segments: SegmentedControlSegment[];
    size?: SegmentedControlSize;
    fullWidth?: boolean;
    disabled?: boolean;
};

const iconSizes: Record<SegmentedControlSize, 14 | 16 | 18> = {
    small: 14,
    medium: 16,
    large: 18,
};

/**
 * C-022 SegmentedControl — inline exclusive choice group (2–5 segments) with a
 * sliding raised pill under the selected segment. Segments share one equal
 * column width so the control reads as a single well regardless of label
 * length; the pill is absolutely positioned and translated by the selected
 * index so it always covers exactly one segment box. Icons and labels compose
 * the already-tuned Icon primitive.
 */
export function SegmentedControl(props: SegmentedControlProps) {
    const [local] = splitProps(props, [
        "class",
        "data-testid",
        "disabled",
        "fullWidth",
        "onChange",
        "segments",
        "size",
        "style",
        "value",
    ]);
    const size = () => local.size ?? "medium";
    const selectedIndex = () => {
        const index = local.segments.findIndex((segment) => segment.value === local.value);
        return index < 0 ? 0 : index;
    };

    return (
        <div
            class={["rigged-segmented-control", local.class].filter(Boolean).join(" ")}
            data-disabled={local.disabled ? "" : undefined}
            data-full-width={local.fullWidth ? "" : undefined}
            data-rigged-ui="segmented-control"
            data-size={size()}
            data-testid={local["data-testid"]}
            role="group"
            style={{
                ...local.style,
                "--rigged-segmented-count": String(local.segments.length),
                "--rigged-segmented-index": String(selectedIndex()),
                "grid-template-columns": `repeat(${local.segments.length}, 1fr)`,
            }}
        >
            <span
                aria-hidden="true"
                class="rigged-segmented-control__pill"
                data-rigged-ui="segmented-control-pill"
            />
            <For each={local.segments}>
                {(segment) => {
                    const active = () => segment.value === local.value;
                    return (
                        <button
                            aria-pressed={active()}
                            class="rigged-segmented-control__segment"
                            data-active={active() ? "" : undefined}
                            data-rigged-ui="segmented-control-segment"
                            data-value={segment.value}
                            disabled={local.disabled}
                            onClick={() => local.onChange?.(segment.value)}
                            type="button"
                        >
                            <Show when={segment.icon}>
                                {(name) => (
                                    <span
                                        class="rigged-segmented-control__icon"
                                        data-rigged-ui="segmented-control-icon"
                                    >
                                        <Icon name={name()} size={iconSizes[size()]} />
                                    </span>
                                )}
                            </Show>
                            <span
                                class="rigged-segmented-control__label"
                                data-rigged-ui="segmented-control-label"
                            >
                                {segment.label}
                            </span>
                        </button>
                    );
                }}
            </For>
        </div>
    );
}
