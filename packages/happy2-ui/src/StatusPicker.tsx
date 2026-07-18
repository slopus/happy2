import { splitProps } from "./reactProps";
import { type CSSProperties } from "react";
import { Button } from "./Button";
import { Icon } from "./Icon";
export type Availability = "automatic" | "online" | "away" | "dnd";
export type StatusPickerProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    availability: Availability;
    onAvailabilityChange?: (value: Availability) => void;
    statusEmoji?: string;
    statusText?: string;
    onStatusTextChange?: (value: string) => void;
    expiresLabel?: string;
    onClearStatus?: () => void;
};
/**
 * The four availability states in presentation order. Each carries a status
 * dot whose color is a semantic token (mint/amber/danger, muted for auto),
 * driven purely by the `data-availability` attribute in status-picker.css so
 * no identity color is ever written inline.
 */
const AVAILABILITY: {
    value: Availability;
    label: string;
}[] = [
    { value: "automatic", label: "Auto" },
    { value: "online", label: "Online" },
    { value: "away", label: "Away" },
    { value: "dnd", label: "Busy" },
];
/**
 * C-034 StatusPicker — availability chooser + custom status editor on the Relay
 * raised card. The availability row is a bespoke segmented control (generic
 * SegmentedControl can't carry per-state identity dots) with a sliding pill,
 * equal integer columns, and a colored status dot per segment. The custom
 * status editor is an inset well: a fixed emoji slot, a controlled text input,
 * and a reused ghost Button to clear. Props-only and fully controlled.
 */
export function StatusPicker(props: StatusPickerProps) {
    const [local] = splitProps(props, [
        "availability",
        "className",
        "data-testid",
        "expiresLabel",
        "onAvailabilityChange",
        "onClearStatus",
        "onStatusTextChange",
        "statusEmoji",
        "statusText",
        "style",
    ]);
    const selectedIndex = () => {
        const index = AVAILABILITY.findIndex((option) => option.value === local.availability);
        return index < 0 ? 0 : index;
    };
    const hasStatus = () =>
        (local.statusText !== undefined && local.statusText !== "") ||
        (local.statusEmoji !== undefined && local.statusEmoji !== "");
    return (
        <div
            className={["happy2-status-picker", local.className].filter(Boolean).join(" ")}
            data-happy2-ui="status-picker"
            data-testid={local["data-testid"]}
            style={local.style}
        >
            <div
                className="happy2-status-picker__section"
                data-happy2-ui="status-picker-availability"
            >
                <span
                    className="happy2-status-picker__section-label"
                    data-happy2-ui="status-picker-availability-label"
                >
                    Availability
                </span>
                <div
                    className="happy2-status-picker__segmented"
                    data-happy2-ui="status-picker-segmented"
                    role="group"
                    style={{ "--happy2-sp-index": String(selectedIndex()) } as CSSProperties}
                >
                    <span
                        aria-hidden="true"
                        className="happy2-status-picker__pill"
                        data-happy2-ui="status-picker-pill"
                    />
                    {AVAILABILITY.map((option) => {
                        const active = () => option.value === local.availability;
                        return (
                            <button
                                aria-pressed={active()}
                                key={option.value}
                                className="happy2-status-picker__segment"
                                data-active={active() ? "" : undefined}
                                data-availability={option.value}
                                data-happy2-ui="status-picker-segment"
                                onClick={() => local.onAvailabilityChange?.(option.value)}
                                type="button"
                            >
                                <span
                                    aria-hidden="true"
                                    className="happy2-status-picker__dot"
                                    data-availability={option.value}
                                    data-happy2-ui="status-picker-dot"
                                />
                                <span
                                    className="happy2-status-picker__segment-label"
                                    data-happy2-ui="status-picker-segment-label"
                                >
                                    {option.label}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="happy2-status-picker__section" data-happy2-ui="status-picker-status">
                <span
                    className="happy2-status-picker__section-label"
                    data-happy2-ui="status-picker-status-label"
                >
                    Status
                </span>
                <div className="happy2-status-picker__field" data-happy2-ui="status-picker-field">
                    <span
                        aria-hidden="true"
                        className="happy2-status-picker__emoji"
                        data-happy2-ui="status-picker-emoji"
                    >
                        {local.statusEmoji ? (
                            ((emoji) => emoji)(local.statusEmoji)
                        ) : (
                            <Icon name="smile" size={18} />
                        )}
                    </span>
                    <input
                        className="happy2-status-picker__input"
                        data-happy2-ui="status-picker-input"
                        onInput={(event) => local.onStatusTextChange?.(event.currentTarget.value)}
                        placeholder="What's your status?"
                        type="text"
                        value={local.statusText ?? ""}
                    />
                    {hasStatus() && local.onClearStatus ? (
                        <Button
                            aria-label="Clear status"
                            className="happy2-status-picker__clear"
                            icon="close"
                            iconOnly
                            onClick={() => local.onClearStatus?.()}
                            size="small"
                            variant="ghost"
                        />
                    ) : null}
                </div>
                {local.expiresLabel
                    ? ((label) => (
                          <div
                              className="happy2-status-picker__meta"
                              data-happy2-ui="status-picker-meta"
                          >
                              <span
                                  aria-hidden="true"
                                  className="happy2-status-picker__meta-icon"
                                  data-happy2-ui="status-picker-meta-icon"
                              >
                                  <Icon name="clock" size={14} />
                              </span>
                              <span className="happy2-status-picker__meta-label">{label}</span>
                          </div>
                      ))(local.expiresLabel)
                    : null}
            </div>
        </div>
    );
}
