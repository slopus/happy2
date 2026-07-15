import { Show, splitProps, type JSX } from "solid-js";
import { FormRow } from "./FormRow";
import { SegmentedControl, type SegmentedControlSegment } from "./SegmentedControl";
import { Select, type SelectOption } from "./Select";
import { Switch } from "./Switch";

export type ExpiryMode = "none" | "after_send" | "after_read";
export type AfterReadScope = "any_reader" | "all_readers";
export type RetentionMode = "inherit" | "forever" | "duration";

export type PolicyControlProps = {
    class?: string;
    "data-testid"?: string;
    style?: JSX.CSSProperties;
    expiryMode: ExpiryMode;
    onExpiryModeChange?: (value: ExpiryMode) => void;
    selfDestructSeconds?: number | null;
    onSelfDestructChange?: (value: number | null) => void;
    afterReadScope: AfterReadScope;
    onAfterReadScopeChange?: (value: AfterReadScope) => void;
    retentionMode?: RetentionMode;
    onRetentionModeChange?: (value: RetentionMode) => void;
    retentionSeconds?: number | null;
    onRetentionSecondsChange?: (value: number | null) => void;
};

const EXPIRY_SEGMENTS: SegmentedControlSegment[] = [
    { value: "none", label: "Off" },
    { value: "after_send", label: "After sending" },
    { value: "after_read", label: "After reading" },
];

const RETENTION_SEGMENTS: SegmentedControlSegment[] = [
    { value: "inherit", label: "Inherit" },
    { value: "forever", label: "Keep forever" },
    { value: "duration", label: "Auto-delete" },
];

const SELF_DESTRUCT_OPTIONS: SelectOption[] = [
    { value: "30", label: "30 seconds" },
    { value: "300", label: "5 minutes" },
    { value: "3600", label: "1 hour" },
    { value: "86400", label: "1 day" },
    { value: "604800", label: "1 week" },
];

const RETENTION_OPTIONS: SelectOption[] = [
    { value: "2592000", label: "30 days" },
    { value: "7776000", label: "90 days" },
    { value: "31536000", label: "1 year" },
];

/**
 * C-041 PolicyControl — the disappearing-message and retention-policy editor.
 *
 * A single settings card composing already-tuned primitives: a full-width
 * SegmentedControl picks the disappearing mode, and conditional FormRows reveal
 * a duration Select (only while messages actually expire) and a Switch for the
 * after-read scope (only for the "after reading" mode). When a retention mode is
 * supplied, a second section repeats the pattern with its own SegmentedControl
 * and a duration Select that appears only for the "duration" retention mode.
 * Props only, desktop only; every color and radius is a --happy2-* token.
 */
export function PolicyControl(props: PolicyControlProps) {
    const [local] = splitProps(props, ["class", "style"]);

    const showTimer = () => props.expiryMode !== "none";
    const showScope = () => props.expiryMode === "after_read";
    const showRetention = () => props.retentionMode !== undefined;
    const showRetentionDuration = () => props.retentionMode === "duration";

    const selfDestructValue = () =>
        props.selfDestructSeconds == null ? undefined : String(props.selfDestructSeconds);
    const retentionValue = () =>
        props.retentionSeconds == null ? undefined : String(props.retentionSeconds);

    return (
        <div
            class={["happy2-policy-control", local.class].filter(Boolean).join(" ")}
            data-happy2-ui="policy-control"
            data-testid={props["data-testid"]}
            style={local.style}
        >
            <section
                class="happy2-policy-control__section"
                data-happy2-ui="policy-control-section"
                data-section="expiry"
            >
                <div class="happy2-policy-control__header" data-happy2-ui="policy-control-header">
                    <div class="happy2-policy-control__title" data-happy2-ui="policy-control-title">
                        Disappearing messages
                    </div>
                    <div class="happy2-policy-control__help" data-happy2-ui="policy-control-help">
                        New messages are removed from every device after the timer ends.
                    </div>
                </div>

                <SegmentedControl
                    fullWidth
                    onChange={(value) => props.onExpiryModeChange?.(value as ExpiryMode)}
                    segments={EXPIRY_SEGMENTS}
                    value={props.expiryMode}
                />

                <Show when={showTimer()}>
                    <FormRow
                        class="happy2-policy-control__field happy2-policy-control__field--timer"
                        control={
                            <Select
                                onValueChange={(value) =>
                                    props.onSelfDestructChange?.(value ? Number(value) : null)
                                }
                                options={SELF_DESTRUCT_OPTIONS}
                                placeholder="Select a timer"
                                value={selfDestructValue()}
                                width={160}
                            />
                        }
                        description="How long a message survives before it self-destructs."
                        label="Timer"
                    />
                </Show>

                <Show when={showScope()}>
                    <FormRow
                        class="happy2-policy-control__field happy2-policy-control__field--scope"
                        control={
                            <Switch
                                aria-label="Wait for all readers"
                                checked={props.afterReadScope === "all_readers"}
                                onChange={(checked) =>
                                    props.onAfterReadScopeChange?.(
                                        checked ? "all_readers" : "any_reader",
                                    )
                                }
                            />
                        }
                        description="Start the timer only after everyone has opened the message."
                        label="Wait for all readers"
                    />
                </Show>
            </section>

            <Show when={showRetention()}>
                <>
                    <div
                        class="happy2-policy-control__rule"
                        data-happy2-ui="policy-control-rule"
                        role="separator"
                    />
                    <section
                        class="happy2-policy-control__section"
                        data-happy2-ui="policy-control-section"
                        data-section="retention"
                    >
                        <div
                            class="happy2-policy-control__header"
                            data-happy2-ui="policy-control-header"
                        >
                            <div
                                class="happy2-policy-control__title"
                                data-happy2-ui="policy-control-title"
                            >
                                Message retention
                            </div>
                            <div
                                class="happy2-policy-control__help"
                                data-happy2-ui="policy-control-help"
                            >
                                How long the server keeps this chat&apos;s history.
                            </div>
                        </div>

                        <SegmentedControl
                            fullWidth
                            onChange={(value) =>
                                props.onRetentionModeChange?.(value as RetentionMode)
                            }
                            segments={RETENTION_SEGMENTS}
                            value={props.retentionMode ?? "inherit"}
                        />

                        <Show when={showRetentionDuration()}>
                            <FormRow
                                class="happy2-policy-control__field happy2-policy-control__field--retention"
                                control={
                                    <Select
                                        onValueChange={(value) =>
                                            props.onRetentionSecondsChange?.(
                                                value ? Number(value) : null,
                                            )
                                        }
                                        options={RETENTION_OPTIONS}
                                        placeholder="Select a period"
                                        value={retentionValue()}
                                        width={160}
                                    />
                                }
                                description="Older messages are purged from the server automatically."
                                label="Delete after"
                            />
                        </Show>
                    </section>
                </>
            </Show>
        </div>
    );
}
