import { Show, type JSX } from "solid-js";
import { Badge, type BadgeVariant } from "./Badge";
import { Banner } from "./Banner";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import { Switch } from "./Switch";

export type AutomationTrigger = "schedule" | "event" | "webhook";
export type AutomationAction = "send_message" | "call_webhook" | "moderate";

export type AutomationCardProps = {
    class?: string;
    "data-testid"?: string;
    style?: JSX.CSSProperties;
    name: string;
    triggerType: AutomationTrigger;
    triggerLabel?: string;
    actionType: AutomationAction;
    actionLabel?: string;
    active: boolean;
    onToggleActive?: (value: boolean) => void;
    lastRunLabel?: string;
    error?: string;
    onRun?: () => void;
    nextRunLabel?: string;
};

type BadgeSpec = { label: string; icon: IconName; variant: BadgeVariant };

/* Trigger identity: each type maps to a distinct Badge color + glyph so the
 * pill reads its kind at a glance. Colors are Badge variants (theme tokens). */
const triggerBadges: Record<AutomationTrigger, BadgeSpec> = {
    schedule: { label: "Schedule", icon: "clock", variant: "info" },
    event: { label: "Event", icon: "zap", variant: "accent" },
    webhook: { label: "Webhook", icon: "link", variant: "warning" },
};

/* Action identity: the downstream effect, again a distinct Badge color. */
const actionBadges: Record<AutomationAction, BadgeSpec> = {
    send_message: { label: "Send message", icon: "send", variant: "success" },
    call_webhook: { label: "Call webhook", icon: "link", variant: "info" },
    moderate: { label: "Moderate", icon: "shield", variant: "danger" },
};

/**
 * C-044 AutomationCard — summary of one automation rule. A header pairs the
 * rule name with an active toggle; a trigger→action flow row carries the two
 * identity Badges; an optional detail line describes the schedule and effect;
 * a danger Banner surfaces the last error; and a footer pairs run metadata
 * (last/next run) with a run-now Button. Composed entirely from tuned
 * primitives (Badge, Switch, Button, Banner, Icon) — props only, desktop only.
 */
export function AutomationCard(props: AutomationCardProps) {
    const trigger = () => triggerBadges[props.triggerType];
    const action = () => actionBadges[props.actionType];
    const hasDetail = () => Boolean(props.triggerLabel || props.actionLabel);
    const hasFooter = () => Boolean(props.lastRunLabel || props.nextRunLabel || props.onRun);

    return (
        <article
            class={["rigged-automation-card", props.class].filter(Boolean).join(" ")}
            data-action={props.actionType}
            data-active={props.active ? "" : undefined}
            data-rigged-ui="automation-card"
            data-testid={props["data-testid"]}
            data-trigger={props.triggerType}
            style={props.style}
        >
            <header class="rigged-automation-card__header" data-rigged-ui="automation-card-header">
                <span class="rigged-automation-card__name" data-rigged-ui="automation-card-name">
                    {props.name}
                </span>
                <span
                    class="rigged-automation-card__switch"
                    data-rigged-ui="automation-card-switch"
                >
                    <Switch
                        aria-label={`${props.active ? "Deactivate" : "Activate"} ${props.name}`}
                        checked={props.active}
                        onChange={(value) => props.onToggleActive?.(value)}
                    />
                </span>
            </header>

            <div class="rigged-automation-card__flow" data-rigged-ui="automation-card-flow">
                <span
                    class="rigged-automation-card__trigger"
                    data-rigged-ui="automation-card-trigger"
                >
                    <Badge
                        icon={trigger().icon}
                        label={trigger().label}
                        variant={trigger().variant}
                    />
                </span>
                <span
                    aria-hidden="true"
                    class="rigged-automation-card__arrow"
                    data-rigged-ui="automation-card-arrow"
                >
                    <Icon name="arrow-right" size={14} />
                </span>
                <span
                    class="rigged-automation-card__action"
                    data-rigged-ui="automation-card-action"
                >
                    <Badge icon={action().icon} label={action().label} variant={action().variant} />
                </span>
            </div>

            <Show when={hasDetail()}>
                <div class="rigged-automation-card__detail" data-rigged-ui="automation-card-detail">
                    <Show when={props.triggerLabel}>
                        <span
                            class="rigged-automation-card__label"
                            data-rigged-ui="automation-card-trigger-label"
                        >
                            {props.triggerLabel}
                        </span>
                    </Show>
                    <Show when={props.triggerLabel && props.actionLabel}>
                        <span
                            aria-hidden="true"
                            class="rigged-automation-card__detail-sep"
                            data-rigged-ui="automation-card-detail-sep"
                        >
                            ·
                        </span>
                    </Show>
                    <Show when={props.actionLabel}>
                        <span
                            class="rigged-automation-card__label"
                            data-rigged-ui="automation-card-action-label"
                        >
                            {props.actionLabel}
                        </span>
                    </Show>
                </div>
            </Show>

            <Show when={props.error}>
                {(error) => (
                    <div
                        class="rigged-automation-card__error"
                        data-rigged-ui="automation-card-error"
                    >
                        <Banner tone="danger">{error()}</Banner>
                    </div>
                )}
            </Show>

            <Show when={hasFooter()}>
                <div class="rigged-automation-card__footer" data-rigged-ui="automation-card-footer">
                    <div class="rigged-automation-card__meta" data-rigged-ui="automation-card-meta">
                        <Show when={props.lastRunLabel}>
                            <span
                                class="rigged-automation-card__last"
                                data-rigged-ui="automation-card-last"
                            >
                                {props.lastRunLabel}
                            </span>
                        </Show>
                        <Show when={props.lastRunLabel && props.nextRunLabel}>
                            <span
                                aria-hidden="true"
                                class="rigged-automation-card__meta-sep"
                                data-rigged-ui="automation-card-meta-sep"
                            >
                                ·
                            </span>
                        </Show>
                        <Show when={props.nextRunLabel}>
                            <span
                                class="rigged-automation-card__next"
                                data-rigged-ui="automation-card-next"
                            >
                                {props.nextRunLabel}
                            </span>
                        </Show>
                    </div>
                    <Show when={props.onRun}>
                        <span
                            class="rigged-automation-card__run"
                            data-rigged-ui="automation-card-run"
                        >
                            <Button
                                icon="play"
                                onClick={() => props.onRun?.()}
                                size="small"
                                variant="secondary"
                            >
                                Run now
                            </Button>
                        </span>
                    </Show>
                </div>
            </Show>
        </article>
    );
}
