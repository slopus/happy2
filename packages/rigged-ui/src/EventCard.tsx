import { Show, splitProps, type JSX } from "solid-js";
import { Badge, type BadgeVariant } from "./Badge";
import { Icon, type IconName } from "./Icon";

/* `ref` is omitted because the root is a <div> or a <button> depending on `onSelect`. */
export type EventCardProps = Omit<JSX.HTMLAttributes<HTMLElement>, "onSelect" | "ref" | "style"> & {
    badge?: { label: string; variant: BadgeVariant };
    from?: string;
    icon?: IconName;
    meta?: string;
    onSelect?: () => void;
    style?: JSX.CSSProperties;
    time?: string;
    title: string;
    to?: string;
};

/**
 * Compact 44px status-transition row: icon chip, title (+ inline meta), then a
 * right-aligned `from → to` transition or a status Badge, and a mono time.
 * Renders a real <button> whenever `onSelect` is provided.
 */
export function EventCard(props: EventCardProps) {
    const [local, rest] = splitProps(props, [
        "badge",
        "class",
        "from",
        "icon",
        "meta",
        "onSelect",
        "style",
        "time",
        "title",
        "to",
    ]);
    const rootClass = () => ["rigged-event-card", local.class].filter(Boolean).join(" ");
    const hasSide = () => Boolean((local.from && local.to) || local.badge || local.time);

    const content = () => (
        <>
            <Show when={local.icon}>
                {(name) => (
                    <span class="rigged-event-card__chip" data-rigged-ui="event-card-chip">
                        <Icon name={name()} size={16} />
                    </span>
                )}
            </Show>
            <span class="rigged-event-card__text" data-rigged-ui="event-card-text">
                <span class="rigged-event-card__title" data-rigged-ui="event-card-title">
                    {local.title}
                </span>
                <Show when={local.meta}>
                    <span class="rigged-event-card__meta" data-rigged-ui="event-card-meta">
                        {local.meta}
                    </span>
                </Show>
            </span>
            <Show when={hasSide()}>
                <span class="rigged-event-card__side" data-rigged-ui="event-card-side">
                    <Show
                        when={local.from && local.to}
                        fallback={
                            <Show when={local.badge}>
                                {(badge) => (
                                    <Badge label={badge().label} variant={badge().variant} />
                                )}
                            </Show>
                        }
                    >
                        <span
                            class="rigged-event-card__transition"
                            data-rigged-ui="event-card-transition"
                        >
                            <span class="rigged-event-card__from" data-rigged-ui="event-card-from">
                                {local.from}
                            </span>
                            <Icon name="arrow-right" size={12} />
                            <span class="rigged-event-card__to" data-rigged-ui="event-card-to">
                                {local.to}
                            </span>
                        </span>
                    </Show>
                    <Show when={local.time}>
                        <span class="rigged-event-card__time" data-rigged-ui="event-card-time">
                            {local.time}
                        </span>
                    </Show>
                </span>
            </Show>
        </>
    );

    return (
        <Show
            when={local.onSelect}
            fallback={
                <div {...rest} class={rootClass()} data-rigged-ui="event-card" style={local.style}>
                    {content()}
                </div>
            }
        >
            <button
                {...rest}
                class={rootClass()}
                data-clickable=""
                data-rigged-ui="event-card"
                onClick={() => local.onSelect?.()}
                style={local.style}
                type="button"
            >
                {content()}
            </button>
        </Show>
    );
}
