import { partitionComponentProps } from "./componentProps";
import { type CSSProperties, type HTMLAttributes, type ReactNode } from "react";
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
export type WindowDragRegionProps = Omit<HTMLAttributes<HTMLDivElement>, "children" | "style"> & {
    height?: Dimension;
    style?: CSSProperties;
};
/** Transparent window-drag overlay for full-window states without a TitleBar. */
export function WindowDragRegion(props: WindowDragRegionProps) {
    const [local, rest] = partitionComponentProps(props, ["className", "height", "style"]);
    return (
        <div
            {...rest}
            aria-hidden="true"
            className={["happy2-window-drag-region", local.className].filter(Boolean).join(" ")}
            data-happy2-ui="window-drag-region"
            style={{ height: toCssDimension(local.height ?? 56), ...local.style }}
        />
    );
}
/**
 * Global search well: 32px inset field with a leading search icon and a
 * trailing shortcut KeyCap. Fills its container unless `width` is given.
 */
export function SearchField(props: SearchFieldProps) {
    return (
        <div
            className="happy2-search-field"
            data-happy2-ui="search-field"
            style={props.width === undefined ? undefined : { width: toCssDimension(props.width) }}
        >
            <span
                aria-hidden="true"
                className="happy2-search-field__icon"
                data-happy2-ui="search-field-icon"
            >
                <Icon name="search" size={14} />
            </span>
            <input
                aria-label={props.placeholder ?? "Search"}
                className="happy2-search-field__input"
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
            <KeyCap className="happy2-search-field__hint" keys={props.shortcutHint ?? "⌘K"} />
        </div>
    );
}
type TitleBarBaseProps = {
    /** Left slot, e.g. a workspace crumb. */
    leading?: ReactNode;
    /** Reserve 78px at the left edge for native macOS traffic lights. */
    showWindowControls?: boolean;
    /** Right slot for actions. */
    trailing?: ReactNode;
};
/** Editable search well that reports typing through `onSearchChange`. */
export type TitleBarEditableProps = TitleBarBaseProps & {
    onSearchChange: (value: string) => void;
    onSearchOpen?: never;
    searchPlaceholder?: string;
    searchValue: string;
};
/** Opener search well (read-only) that invokes `onSearchOpen` on click/Enter. */
export type TitleBarOpenerProps = TitleBarBaseProps & {
    onSearchOpen: () => void;
    onSearchChange?: never;
    searchPlaceholder?: string;
    searchValue: string;
};
/** Title bar without a centered search well. */
export type TitleBarPlainProps = TitleBarBaseProps & {
    onSearchChange?: never;
    onSearchOpen?: never;
    searchPlaceholder?: never;
    searchValue?: never;
};
/** The search well is editable, a palette opener, or omitted entirely. */
export type TitleBarProps = TitleBarEditableProps | TitleBarOpenerProps | TitleBarPlainProps;
/**
 * 56px window title bar: draggable app-owned chrome under the transparent
 * native title bar, with an optional centered 420px-max SearchField between
 * two 1fr slots.
 */
export function TitleBar(props: TitleBarProps) {
    const searchOpen = "onSearchOpen" in props ? props.onSearchOpen : undefined;
    const searchChange = "onSearchChange" in props ? props.onSearchChange : undefined;
    const searchValue = ("searchValue" in props ? props.searchValue : "") ?? "";
    const hasSearch = searchOpen !== undefined || searchChange !== undefined;
    return (
        <header
            className="happy2-title-bar"
            data-happy2-ui="title-bar"
            data-window-controls={props.showWindowControls ? "" : undefined}
        >
            <div className="happy2-title-bar__leading" data-happy2-ui="title-bar-leading">
                {props.showWindowControls ? (
                    <span
                        aria-hidden="true"
                        className="happy2-title-bar__controls"
                        data-happy2-ui="title-bar-controls"
                    />
                ) : null}
                {props.leading}
            </div>
            {hasSearch ? (
                <div className="happy2-title-bar__center" data-happy2-ui="title-bar-center">
                    {searchOpen ? (
                        <SearchField
                            onOpen={searchOpen}
                            placeholder={props.searchPlaceholder}
                            value={searchValue}
                        />
                    ) : (
                        <SearchField
                            onChange={searchChange!}
                            placeholder={props.searchPlaceholder}
                            value={searchValue}
                        />
                    )}
                </div>
            ) : null}
            <div className="happy2-title-bar__trailing" data-happy2-ui="title-bar-trailing">
                {props.trailing}
            </div>
        </header>
    );
}
