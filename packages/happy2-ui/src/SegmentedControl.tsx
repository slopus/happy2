import { splitProps } from "./reactProps";
import { type CSSProperties } from "react";
import { Icon, type IconName } from "./Icon";
export type SegmentedControlSize = "small" | "medium" | "large";
export type SegmentedControlSegment = {
    value: string;
    label: string;
    icon?: IconName;
};
export type SegmentedControlProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
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
        "className",
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
            className={["happy2-segmented-control", local.className].filter(Boolean).join(" ")}
            data-disabled={local.disabled ? "" : undefined}
            data-full-width={local.fullWidth ? "" : undefined}
            data-happy2-ui="segmented-control"
            data-size={size()}
            data-testid={local["data-testid"]}
            role="group"
            style={
                {
                    ...local.style,
                    "--happy2-segmented-count": String(local.segments.length),
                    "--happy2-segmented-index": String(selectedIndex()),
                    gridTemplateColumns: `repeat(${local.segments.length}, 1fr)`,
                } as CSSProperties
            }
        >
            <span
                aria-hidden="true"
                className="happy2-segmented-control__pill"
                data-happy2-ui="segmented-control-pill"
            />
            {local.segments.map((segment) => {
                const active = () => segment.value === local.value;
                return (
                    <button
                        aria-pressed={active()}
                        key={segment.value}
                        className="happy2-segmented-control__segment"
                        data-active={active() ? "" : undefined}
                        data-happy2-ui="segmented-control-segment"
                        data-value={segment.value}
                        disabled={local.disabled}
                        onClick={() => local.onChange?.(segment.value)}
                        type="button"
                    >
                        {segment.icon
                            ? ((name) => (
                                  <span
                                      className="happy2-segmented-control__icon"
                                      data-happy2-ui="segmented-control-icon"
                                  >
                                      <Icon name={name} size={iconSizes[size()]} />
                                  </span>
                              ))(segment.icon)
                            : null}
                        <span
                            className="happy2-segmented-control__label"
                            data-happy2-ui="segmented-control-label"
                        >
                            {segment.label}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
