import { Show, splitProps, type JSX } from "solid-js";
import { KeyCap } from "./Badge";
import type { Dimension } from "./dimensions";
import { toCssDimension } from "./dimensions";
import { Icon } from "./Icon";

type SearchFieldSharedProps = {
    placeholder?: string;
    shortcutHint?: string;
    value: string;
    width?: Dimension;
};

/** Editable well: reports typing through `onChange` and Enter through `onSubmit`. */
export type SearchFieldEditableProps = SearchFieldSharedProps & {
    onChange: (value: string) => void;
    onSubmit?: (value: string) => void;
    onOpen?: never;
};

/**
 * Opener well: read-only chrome that opens a palette. A click or Enter/Space
 * invokes `onOpen` instead of editing in place; it never reports typing.
 */
export type SearchFieldOpenerProps = SearchFieldSharedProps & {
    onOpen: () => void;
    onChange?: never;
    onSubmit?: never;
};

/**
 * The well is either editable (`onChange`, no `onOpen`) or an opener (`onOpen`,
 * no `onChange`). The two modes are mutually exclusive at the type level.
 */
export type SearchFieldProps = SearchFieldEditableProps | SearchFieldOpenerProps;

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
            class={["happy2-window-drag-region", local.class].filter(Boolean).join(" ")}
            data-happy2-ui="window-drag-region"
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
            class="happy2-search-field"
            data-happy2-ui="search-field"
            style={props.width === undefined ? undefined : { width: toCssDimension(props.width) }}
        >
            <span
                aria-hidden="true"
                class="happy2-search-field__icon"
                data-happy2-ui="search-field-icon"
            >
                <Icon name="search" size={14} />
            </span>
            <input
                aria-label={props.placeholder ?? "Search"}
                class="happy2-search-field__input"
                data-happy2-ui="search-field-input"
                onClick={() => props.onOpen?.()}
                onInput={(event) => {
                    if (!props.onOpen) props.onChange?.(event.currentTarget.value);
                }}
                onKeyDown={(event) => {
                    if (props.onOpen) {
                        if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            props.onOpen();
                        }
                        return;
                    }
                    if (event.key === "Enter") props.onSubmit?.(event.currentTarget.value);
                }}
                placeholder={props.placeholder ?? "Search"}
                readOnly={props.onOpen !== undefined}
                type="text"
                value={props.value}
            />
            <KeyCap class="happy2-search-field__hint" keys={props.shortcutHint ?? "⌘K"} />
        </div>
    );
}

type TitleBarSharedProps = {
    /** Left slot, e.g. a workspace crumb. */
    leading?: JSX.Element;
    searchPlaceholder?: string;
    searchValue: string;
    /** Reserve 78px at the left edge for native macOS traffic lights. */
    showWindowControls?: boolean;
    /** Right slot for actions. */
    trailing?: JSX.Element;
};

/** Editable search well that reports typing through `onSearchChange`. */
export type TitleBarEditableProps = TitleBarSharedProps & {
    onSearchChange: (value: string) => void;
    onSearchOpen?: never;
};

/** Opener search well (read-only) that invokes `onSearchOpen` on click/Enter. */
export type TitleBarOpenerProps = TitleBarSharedProps & {
    onSearchOpen: () => void;
    onSearchChange?: never;
};

/** The search well is either editable or a palette opener, never both. */
export type TitleBarProps = TitleBarEditableProps | TitleBarOpenerProps;

/**
 * 38px window title bar: draggable app-owned chrome under the transparent
 * native title bar, with a centered 420px-max SearchField between two 1fr
 * slots.
 */
export function TitleBar(props: TitleBarProps) {
    return (
        <header
            class="happy2-title-bar"
            data-happy2-ui="title-bar"
            data-window-controls={props.showWindowControls ? "" : undefined}
        >
            <div class="happy2-title-bar__leading" data-happy2-ui="title-bar-leading">
                <Show when={props.showWindowControls}>
                    <span
                        aria-hidden="true"
                        class="happy2-title-bar__controls"
                        data-happy2-ui="title-bar-controls"
                    />
                </Show>
                {props.leading}
            </div>
            <div class="happy2-title-bar__center" data-happy2-ui="title-bar-center">
                <Show
                    when={props.onSearchOpen}
                    fallback={
                        <SearchField
                            onChange={(props as TitleBarEditableProps).onSearchChange}
                            placeholder={props.searchPlaceholder}
                            value={props.searchValue}
                        />
                    }
                >
                    {(onSearchOpen) => (
                        <SearchField
                            onOpen={onSearchOpen()}
                            placeholder={props.searchPlaceholder}
                            value={props.searchValue}
                        />
                    )}
                </Show>
            </div>
            <div class="happy2-title-bar__trailing" data-happy2-ui="title-bar-trailing">
                {props.trailing}
            </div>
        </header>
    );
}
