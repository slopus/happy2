import { Show, splitProps, type JSX } from "solid-js";
import { KeyCap } from "./Badge";
import type { Dimension } from "./dimensions";
import { toCssDimension } from "./dimensions";
import { Icon } from "./Icon";

export type SearchFieldProps = {
    onChange: (value: string) => void;
    onSubmit?: (value: string) => void;
    placeholder?: string;
    shortcutHint?: string;
    value: string;
    width?: Dimension;
};

export type WindowDragRegionProps = Omit<
    JSX.HTMLAttributes<HTMLDivElement>,
    "children" | "style"
> & {
    height?: Dimension;
    style?: JSX.CSSProperties;
};

/** Transparent window-drag overlay for full-window states without a TitleBar. */
export function WindowDragRegion(props: WindowDragRegionProps) {
    const [local, rest] = splitProps(props, ["class", "height", "style"]);
    return (
        <div
            {...rest}
            aria-hidden="true"
            class={["rigged-window-drag-region", local.class].filter(Boolean).join(" ")}
            data-rigged-ui="window-drag-region"
            style={{ height: toCssDimension(local.height ?? 38), ...local.style }}
        />
    );
}

/**
 * Global search well: 26px inset field with a leading search icon and a
 * trailing shortcut KeyCap. Fills its container unless `width` is given.
 */
export function SearchField(props: SearchFieldProps) {
    return (
        <div
            class="rigged-search-field"
            data-rigged-ui="search-field"
            style={props.width === undefined ? undefined : { width: toCssDimension(props.width) }}
        >
            <span
                aria-hidden="true"
                class="rigged-search-field__icon"
                data-rigged-ui="search-field-icon"
            >
                <Icon name="search" size={14} />
            </span>
            <input
                aria-label={props.placeholder ?? "Search"}
                class="rigged-search-field__input"
                data-rigged-ui="search-field-input"
                onInput={(event) => props.onChange(event.currentTarget.value)}
                onKeyDown={(event) => {
                    if (event.key === "Enter") props.onSubmit?.(event.currentTarget.value);
                }}
                placeholder={props.placeholder ?? "Search"}
                type="text"
                value={props.value}
            />
            <KeyCap class="rigged-search-field__hint" keys={props.shortcutHint ?? "⌘K"} />
        </div>
    );
}

export type TitleBarProps = {
    /** Left slot, e.g. a workspace crumb. */
    leading?: JSX.Element;
    onSearchChange: (value: string) => void;
    searchPlaceholder?: string;
    searchValue: string;
    /** Reserve 78px at the left edge for native macOS traffic lights. */
    showWindowControls?: boolean;
    /** Right slot for actions. */
    trailing?: JSX.Element;
};

/**
 * 38px window title bar: draggable app-owned chrome under the transparent
 * native title bar, with a centered 420px-max SearchField between two 1fr
 * slots.
 */
export function TitleBar(props: TitleBarProps) {
    return (
        <header
            class="rigged-title-bar"
            data-rigged-ui="title-bar"
            data-window-controls={props.showWindowControls ? "" : undefined}
        >
            <div class="rigged-title-bar__leading" data-rigged-ui="title-bar-leading">
                <Show when={props.showWindowControls}>
                    <span
                        aria-hidden="true"
                        class="rigged-title-bar__controls"
                        data-rigged-ui="title-bar-controls"
                    />
                </Show>
                {props.leading}
            </div>
            <div class="rigged-title-bar__center" data-rigged-ui="title-bar-center">
                <SearchField
                    onChange={(value) => props.onSearchChange(value)}
                    placeholder={props.searchPlaceholder}
                    value={props.searchValue}
                />
            </div>
            <div class="rigged-title-bar__trailing" data-rigged-ui="title-bar-trailing">
                {props.trailing}
            </div>
        </header>
    );
}
