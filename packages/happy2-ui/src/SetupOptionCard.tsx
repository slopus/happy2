import { Show } from "solid-js";
import { Badge, type BadgeVariant } from "./Badge";
import { Icon, type IconName } from "./Icon";

export type SetupOptionStatus = {
    readonly label: string;
    readonly variant: BadgeVariant;
    readonly icon?: IconName;
};

export type SetupOptionHintTone = "muted" | "warning" | "danger";

export type SetupOptionCardProps = {
    class?: string;
    "data-testid"?: string;
    icon?: IconName;
    title: string;
    description?: string;
    status?: SetupOptionStatus;
    meta?: string;
    hint?: string;
    hintTone?: SetupOptionHintTone;
    selected?: boolean;
    recommended?: boolean;
    disabled?: boolean;
    pending?: boolean;
    onSelect?: () => void;
};

/*
 * Full-width selectable onboarding option. The whole card is a real
 * <button type="button">, so selection is entirely props-driven; the component
 * holds no internal state. Disabled and pending both block the native control.
 */
export function SetupOptionCard(props: SetupOptionCardProps) {
    const hintTone = () => props.hintTone ?? "muted";
    const isDisabled = () => props.disabled === true;
    const isPending = () => props.pending === true;

    return (
        <button
            class={["happy2-setup-option", props.class].filter(Boolean).join(" ")}
            data-disabled={isDisabled() ? "" : undefined}
            data-happy2-ui="setup-option"
            data-pending={isPending() ? "" : undefined}
            data-recommended={props.recommended ? "" : undefined}
            data-selected={props.selected ? "" : undefined}
            data-testid={props["data-testid"]}
            disabled={isDisabled() || isPending()}
            onClick={() => props.onSelect?.()}
            type="button"
        >
            <Show when={props.icon}>
                {(name) => (
                    <span class="happy2-setup-option__icon" data-happy2-ui="setup-option-icon">
                        <Icon name={name()} size={18} />
                    </span>
                )}
            </Show>
            <span class="happy2-setup-option__body" data-happy2-ui="setup-option-body">
                <span
                    class="happy2-setup-option__title-row"
                    data-happy2-ui="setup-option-title-row"
                >
                    <span class="happy2-setup-option__title" data-happy2-ui="setup-option-title">
                        {props.title}
                    </span>
                    <Show when={props.recommended}>
                        <span
                            class="happy2-setup-option__recommended"
                            data-happy2-ui="setup-option-recommended"
                        >
                            Recommended
                        </span>
                    </Show>
                    <Show when={props.status}>
                        {(status) => (
                            <span
                                class="happy2-setup-option__status"
                                data-happy2-ui="setup-option-status"
                            >
                                <Badge
                                    icon={status().icon}
                                    label={status().label}
                                    variant={status().variant}
                                />
                            </span>
                        )}
                    </Show>
                </span>
                <Show when={props.description}>
                    {(description) => (
                        <span
                            class="happy2-setup-option__description"
                            data-happy2-ui="setup-option-description"
                        >
                            {description()}
                        </span>
                    )}
                </Show>
                <Show when={props.meta}>
                    {(meta) => (
                        <span class="happy2-setup-option__meta" data-happy2-ui="setup-option-meta">
                            {meta()}
                        </span>
                    )}
                </Show>
                <Show when={props.hint}>
                    {(hint) => (
                        <span
                            class="happy2-setup-option__hint"
                            data-happy2-ui="setup-option-hint"
                            data-tone={hintTone()}
                        >
                            {hint()}
                        </span>
                    )}
                </Show>
            </span>
            <span class="happy2-setup-option__trailing" data-happy2-ui="setup-option-trailing">
                <Show
                    when={isPending()}
                    fallback={
                        <Show when={props.selected}>
                            <span
                                class="happy2-setup-option__check"
                                data-happy2-ui="setup-option-check"
                            >
                                <Icon name="check-circle" size={20} />
                            </span>
                        </Show>
                    }
                >
                    <span
                        class="happy2-setup-option__spinner"
                        data-happy2-ui="setup-option-spinner"
                    />
                </Show>
            </span>
        </button>
    );
}
