import { For, Show } from "solid-js";
import { Icon, type IconName } from "./Icon";

export type BadgeVariant =
    | "neutral"
    | "accent"
    | "success"
    | "warning"
    | "danger"
    | "info"
    | "outline";

export type BadgeProps = {
    class?: string;
    icon?: IconName;
    label: string;
    variant?: BadgeVariant;
};

/** Status pill: NEEDS REVIEW, AGENT, IN PROGRESS… 18px mono uppercase. */
export function Badge(props: BadgeProps) {
    return (
        <span
            class={["rigged-badge", props.class].filter(Boolean).join(" ")}
            data-rigged-ui="badge"
            data-variant={props.variant ?? "neutral"}
        >
            <Show when={props.icon}>
                {(name) => (
                    <span class="rigged-badge__icon" data-rigged-ui="badge-icon">
                        <Icon name={name()} size={12} />
                    </span>
                )}
            </Show>
            <span class="rigged-badge__label" data-rigged-ui="badge-label">
                {props.label}
            </span>
        </span>
    );
}

export type CountBadgeProps = {
    class?: string;
    count: number;
    tone?: "accent" | "neutral";
};

/** Unread-count pill: 18px round with mono lining/tabular figures. */
export function CountBadge(props: CountBadgeProps) {
    /* Stepped integral width (18/25/32…) instead of the intrinsic text width:
     * digit advances are fractional, and a fractional-width pill lands
     * right-aligned boxes off the device-pixel grid, visibly shifting the
     * rasterized digits. */
    const width = () => 18 + (String(props.count).length - 1) * 7;
    return (
        <span
            class={["rigged-count-badge", props.class].filter(Boolean).join(" ")}
            data-rigged-ui="count-badge"
            data-tone={props.tone ?? "accent"}
            style={{ width: `${width()}px` }}
        >
            <span class="rigged-count-badge__label" data-rigged-ui="count-badge-label">
                {props.count}
            </span>
        </span>
    );
}

export type ReactionChipProps = {
    active?: boolean;
    class?: string;
    count: number;
    emoji: string;
    onSelect?: () => void;
};

/** Emoji reaction pill under a message: 24px, toggles an accent active state. */
export function ReactionChip(props: ReactionChipProps) {
    return (
        <button
            aria-label={`${props.emoji} ${props.count}`}
            aria-pressed={props.active ? "true" : "false"}
            class={["rigged-reaction-chip", props.class].filter(Boolean).join(" ")}
            data-active={props.active ? "" : undefined}
            data-rigged-ui="reaction-chip"
            onClick={() => props.onSelect?.()}
            type="button"
        >
            <span class="rigged-reaction-chip__emoji" data-rigged-ui="reaction-chip-emoji">
                <span
                    class="rigged-reaction-chip__emoji-glyph"
                    data-rigged-ui="reaction-chip-emoji-glyph"
                >
                    {props.emoji}
                </span>
            </span>
            <span class="rigged-reaction-chip__count" data-rigged-ui="reaction-chip-count">
                {props.count}
            </span>
        </button>
    );
}

export type KeyCapProps = {
    class?: string;
    keys: string;
};

const shortcutSymbols = new Set(["⌘", "⇧", "⌥", "⌃"]);

function ShortcutSymbol(props: { symbol: string }) {
    return (
        <svg aria-hidden="true" data-shortcut-symbol={props.symbol} fill="none" viewBox="0 0 24 24">
            <Show when={props.symbol === "⌘"}>
                <path d="M18 9a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12Z" />
            </Show>
            <Show when={props.symbol === "⇧"}>
                <path d="m12 1.8 9 9.5h-5v9.5H8v-9.5H3l9-9.5Z" />
            </Show>
            <Show when={props.symbol === "⌥"}>
                <path d="M2.85 3.2h5l9 18h4M13.85 3.2h7M2.85 21.2h7" />
            </Show>
            <Show when={props.symbol === "⌃"}>
                <path d="M3 21.2 12 2.3 21 21.2" />
            </Show>
        </svg>
    );
}

/** Keyboard shortcut hint, e.g. ⌘K in the title-bar search field. */
export function KeyCap(props: KeyCapProps) {
    return (
        <kbd
            aria-label={props.keys}
            class={["rigged-key-cap", props.class].filter(Boolean).join(" ")}
            data-rigged-ui="key-cap"
        >
            <span class="rigged-key-cap__label" data-rigged-ui="key-cap-label">
                <For each={Array.from(props.keys)}>
                    {(key) => (
                        <span
                            class="rigged-key-cap__key"
                            data-kind={shortcutSymbols.has(key) ? "symbol" : "text"}
                            data-rigged-ui="key-cap-key"
                        >
                            <Show
                                when={shortcutSymbols.has(key)}
                                fallback={
                                    <span
                                        class="rigged-key-cap__text"
                                        data-rigged-ui="key-cap-text"
                                    >
                                        {key}
                                    </span>
                                }
                            >
                                <ShortcutSymbol symbol={key} />
                            </Show>
                        </span>
                    )}
                </For>
            </span>
        </kbd>
    );
}
