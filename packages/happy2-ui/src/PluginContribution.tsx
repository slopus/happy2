import { useState, type ReactNode } from "react";
import type {
    PluginButtonControl,
    PluginContributionActionValue,
    PluginInteractiveControl,
    PluginTextControl,
} from "happy2-state";
import { Button, type ButtonVariant } from "./Button";
import { Checkbox } from "./Checkbox";
import { TextField } from "./TextField";

/** The transient completion state of one native contribution action. */
export type PluginContributionActionState =
    | { readonly type: "running" }
    | { readonly type: "error"; readonly message: string };

/** The bounded state of an async-menu resolution or a static menu's items. */
export type PluginContributionMenuState =
    | { readonly type: "loading" }
    | { readonly type: "ready"; readonly items: readonly PluginButtonControl[] }
    | { readonly type: "error"; readonly message: string };

/** Invokes one contribution action, addressed by its stable control/item id. */
export interface PluginContributionInvoke {
    (actionId: string, value?: PluginContributionActionValue): void;
}

export interface PluginContributionControlProps {
    /** One interactive or text control from a profile/settings section. */
    control: PluginInteractiveControl | PluginTextControl;
    /** Transient pending/error state for this control's action. */
    actionState?: PluginContributionActionState;
    /** Resolves a monochrome asset id into a rendered `currentColor` glyph. */
    assetGlyph?(assetId: string): ReactNode;
    onInvoke: PluginContributionInvoke;
    "data-testid"?: string;
}

/**
 * C-134 PluginContributionControl — renders exactly one strictly-typed native
 * contribution control (text, button, checkbox, checkbox group, or input) using
 * Happy primitives. It never renders plugin-supplied HTML, CSS, or class names;
 * button assets are authenticated monochrome masks tinted with `currentColor`.
 * Required titles and descriptions are always represented so the control is
 * accessible. Invocations surface pending/error state in place without
 * destroying the control's DOM identity or focus.
 *
 * Props only: the owner supplies the current value, the transient action state,
 * and the invoke callback; the component performs no transport.
 */
export function PluginContributionControl(props: PluginContributionControlProps) {
    const { control } = props;
    const invalid = props.actionState?.type === "error";
    const errorText = props.actionState?.type === "error" ? props.actionState.message : undefined;
    return (
        <div
            className="happy2-plugin-control"
            data-happy2-ui="plugin-control"
            data-kind={control.kind}
            data-testid={props["data-testid"]}
        >
            {renderControl(props, invalid)}
            {errorText ? (
                <span
                    className="happy2-plugin-control__error"
                    data-happy2-ui="plugin-control-error"
                    role="alert"
                >
                    {errorText}
                </span>
            ) : null}
        </div>
    );
}

function renderControl(props: PluginContributionControlProps, invalid: boolean): ReactNode {
    const { control } = props;
    const running = props.actionState?.type === "running";
    if (control.kind === "text")
        return (
            <div className="happy2-plugin-control__text" data-happy2-ui="plugin-control-text">
                <span className="happy2-plugin-control__title">{control.title}</span>
                <span className="happy2-plugin-control__body">{control.text}</span>
                {control.description ? (
                    <span className="happy2-plugin-control__hint">{control.description}</span>
                ) : null}
            </div>
        );
    if (control.kind === "button")
        return (
            <div className="happy2-plugin-control__row">
                <span className="happy2-plugin-control__label">
                    <span className="happy2-plugin-control__title">{control.title}</span>
                    <span className="happy2-plugin-control__hint">{control.description}</span>
                </span>
                <Button
                    disabled={running}
                    onClick={() => props.onInvoke(control.id)}
                    size="small"
                    variant="secondary"
                >
                    {props.assetGlyph ? (
                        <span className="happy2-plugin-control__glyph" aria-hidden="true">
                            {props.assetGlyph(control.assetId)}
                        </span>
                    ) : null}
                    {control.title}
                </Button>
            </div>
        );
    if (control.kind === "checkbox")
        return (
            <div className="happy2-plugin-control__row">
                <span className="happy2-plugin-control__label">
                    <span className="happy2-plugin-control__title">{control.title}</span>
                    <span className="happy2-plugin-control__hint">{control.description}</span>
                </span>
                <Checkbox
                    aria-label={control.title}
                    checked={control.checked}
                    disabled={running}
                    onChange={(next) => props.onInvoke(control.id, next)}
                />
            </div>
        );
    if (control.kind === "checkboxGroup") {
        const selected = new Set(control.selectedOptionIds);
        return (
            <fieldset
                className="happy2-plugin-control__group"
                data-happy2-ui="plugin-control-group"
            >
                <legend className="happy2-plugin-control__title">{control.title}</legend>
                <span className="happy2-plugin-control__hint">{control.description}</span>
                <div className="happy2-plugin-control__options">
                    {control.options.map((option) => (
                        <Checkbox
                            key={option.id}
                            checked={selected.has(option.id)}
                            disabled={running}
                            label={option.title}
                            onChange={(next) =>
                                props.onInvoke(
                                    control.id,
                                    nextSelection(control.selectedOptionIds, option.id, next),
                                )
                            }
                        />
                    ))}
                </div>
            </fieldset>
        );
    }
    return (
        <PluginInputControlView
            control={control}
            invalid={invalid}
            onInvoke={props.onInvoke}
            running={running}
        />
    );
}

interface PluginInputControlViewProps {
    control: Extract<PluginInteractiveControl, { kind: "input" }>;
    invalid: boolean;
    running: boolean;
    onInvoke: PluginContributionInvoke;
}

/**
 * The input control edits a local draft and commits on Enter or blur. It never
 * remounts on a server-authoritative revision: the DOM node and focus are stable
 * for the control's lifetime. Instead it reconciles the authoritative value
 * during render (the sanctioned "adjust state when a prop changes" pattern, no
 * effect): when `control.value` changes it adopts the new value only if the user
 * has no divergent in-progress edit, so a collaborator's update lands while a
 * local edit in flight is preserved.
 */
function PluginInputControlView(props: PluginInputControlViewProps) {
    const { control } = props;
    const [draft, setDraft] = useState(control.value);
    const [base, setBase] = useState(control.value);
    if (control.value !== base) {
        // The authoritative value changed since the last render. Adopt it unless
        // the user has typed something different from the previous authoritative
        // value (a pending edit we must not clobber). This runs during render and
        // triggers an immediate re-render before any DOM is committed.
        setBase(control.value);
        if (draft === base) setDraft(control.value);
    }
    const commit = () => {
        if (draft !== control.value) props.onInvoke(control.id, draft);
    };
    return (
        <TextField
            disabled={props.running}
            error={props.invalid ? " " : undefined}
            fullWidth
            hint={control.description}
            label={control.title}
            onBlur={commit}
            onSubmit={commit}
            onValueChange={setDraft}
            placeholder={control.placeholder}
            value={draft}
        />
    );
}

function nextSelection(
    current: readonly string[],
    optionId: string,
    checked: boolean,
): readonly string[] {
    if (checked) return current.includes(optionId) ? current : [...current, optionId];
    return current.filter((id) => id !== optionId);
}

export interface PluginContributionSectionProps {
    title: string;
    description?: string;
    controls: readonly (PluginInteractiveControl | PluginTextControl)[];
    /** Resolves a control's transient action state by control id. */
    actionStateFor?(actionId: string): PluginContributionActionState | undefined;
    assetGlyph?(assetId: string): ReactNode;
    onInvoke: PluginContributionInvoke;
    "data-testid"?: string;
}

/**
 * C-135 PluginContributionSection — renders a bounded profile/settings section
 * as an accessible titled group of {@link PluginContributionControl}s. Each
 * control is keyed by its stable entity id, so a server-authoritative value
 * change updates the control in place — preserving its DOM node and focus — while
 * the control itself reconciles the new value (see PluginInputControlView).
 */
export function PluginContributionSection(props: PluginContributionSectionProps) {
    return (
        <section
            className="happy2-plugin-section"
            data-happy2-ui="plugin-section"
            data-testid={props["data-testid"]}
        >
            <header className="happy2-plugin-section__header">
                <span className="happy2-plugin-section__title">{props.title}</span>
                {props.description ? (
                    <span className="happy2-plugin-section__description">{props.description}</span>
                ) : null}
            </header>
            <div className="happy2-plugin-section__controls">
                {props.controls.map((control) => (
                    <PluginContributionControl
                        key={control.id}
                        actionState={props.actionStateFor?.(control.id)}
                        assetGlyph={props.assetGlyph}
                        control={control}
                        onInvoke={props.onInvoke}
                    />
                ))}
            </div>
        </section>
    );
}

export interface PluginContributionMenuButtonProps {
    /** The contribution kind at a menu placement. */
    kind: "button" | "staticMenu" | "asyncMenu";
    title: string;
    description: string;
    /** The contribution's own action id (for a `button`), or the menu id. */
    actionId: string;
    /** The trigger glyph (a `PluginAssetGlyph`) for `button` contributions. */
    triggerGlyph?: ReactNode;
    /** Bounded typed items for a `staticMenu`. */
    items?: readonly PluginButtonControl[];
    /** Resolution state for an `asyncMenu`. */
    menuState?: PluginContributionMenuState;
    /** Transient pending/error state for the trigger's own action (`button`). */
    actionState?: PluginContributionActionState;
    /** Resolves per-item action state (menu item pending/error), by item id. */
    itemActionState?(actionId: string): PluginContributionActionState | undefined;
    assetGlyph?(assetId: string): ReactNode;
    /** Invokes the trigger action (`button`) or a chosen menu item. */
    onInvoke: PluginContributionInvoke;
    /** Called once when an `asyncMenu` opens so the owner resolves it. */
    onMenuOpen?(): void;
    size?: "small" | "medium";
    variant?: ButtonVariant;
    /** Renders the trigger as an icon-only control (e.g. a composer icon). */
    iconOnly?: boolean;
    "data-testid"?: string;
}

/**
 * C-136 PluginContributionMenuButton — a native trigger for a menu-placement
 * contribution (sidebar menu, chat menu, composer icon/menu, message menu). A
 * `button` invokes its bound action directly; a `staticMenu` opens a bounded
 * list; an `asyncMenu` resolves its list on open and shows loading/error/ready
 * state with no manual refresh control. Item assets are monochrome masks. It
 * owns only its open/close UI state and surfaces pending/error state without
 * losing focus.
 */
export function PluginContributionMenuButton(props: PluginContributionMenuButtonProps) {
    const [open, setOpen] = useState(false);
    const running = props.actionState?.type === "running";
    const openMenu = () => {
        if (props.kind === "asyncMenu") props.onMenuOpen?.();
        setOpen(true);
    };
    const onTrigger = () => {
        if (props.kind === "button") props.onInvoke(props.actionId);
        else if (open) setOpen(false);
        else openMenu();
    };
    return (
        <div
            className="happy2-plugin-menu"
            data-happy2-ui="plugin-menu"
            data-kind={props.kind}
            data-testid={props["data-testid"]}
            onKeyDown={(event) => {
                if (event.key === "Escape" && open) {
                    event.stopPropagation();
                    setOpen(false);
                }
            }}
        >
            <Button
                aria-expanded={props.kind === "button" ? undefined : open}
                aria-haspopup={props.kind === "button" ? undefined : "menu"}
                aria-label={props.iconOnly ? props.title : undefined}
                disabled={running}
                iconOnly={props.iconOnly}
                onClick={onTrigger}
                size={props.size ?? "small"}
                title={props.description}
                variant={props.variant ?? "ghost"}
            >
                {props.triggerGlyph ? (
                    <span className="happy2-plugin-menu__glyph" aria-hidden="true">
                        {props.triggerGlyph}
                    </span>
                ) : null}
                {props.iconOnly ? null : props.title}
            </Button>
            {props.actionState?.type === "error" ? (
                <span className="happy2-plugin-menu__error" role="alert">
                    {props.actionState.message}
                </span>
            ) : null}
            {open && props.kind !== "button" ? (
                <>
                    <button
                        aria-hidden="true"
                        className="happy2-plugin-menu__backdrop"
                        onClick={() => setOpen(false)}
                        tabIndex={-1}
                        type="button"
                    />
                    <div
                        className="happy2-plugin-menu__popover"
                        data-happy2-ui="plugin-menu-popover"
                        role="menu"
                    >
                        {renderMenuItems(props, () => setOpen(false))}
                    </div>
                </>
            ) : null}
        </div>
    );
}

function renderMenuItems(props: PluginContributionMenuButtonProps, close: () => void): ReactNode {
    const items =
        props.kind === "staticMenu"
            ? (props.items ?? [])
            : props.menuState?.type === "ready"
              ? props.menuState.items
              : [];
    if (props.kind === "asyncMenu" && props.menuState?.type === "loading")
        return (
            <span className="happy2-plugin-menu__status" role="status">
                Loading…
            </span>
        );
    if (props.kind === "asyncMenu" && props.menuState?.type === "error")
        return (
            <span
                className="happy2-plugin-menu__status happy2-plugin-menu__status--error"
                role="alert"
            >
                {props.menuState.message}
            </span>
        );
    if (items.length === 0)
        return (
            <span className="happy2-plugin-menu__status" role="status">
                No actions
            </span>
        );
    return items.map((item) => {
        const state = props.itemActionState?.(item.id);
        return (
            <button
                key={item.id}
                className="happy2-plugin-menu__item"
                data-happy2-ui="plugin-menu-item"
                disabled={state?.type === "running"}
                onClick={() => {
                    props.onInvoke(item.id);
                    close();
                }}
                role="menuitem"
                title={item.description}
                type="button"
            >
                {props.assetGlyph ? (
                    <span className="happy2-plugin-menu__item-glyph" aria-hidden="true">
                        {props.assetGlyph(item.assetId)}
                    </span>
                ) : null}
                <span className="happy2-plugin-menu__item-label">{item.title}</span>
            </button>
        );
    });
}
