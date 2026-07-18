import { partitionComponentProps } from "./componentProps";
import {
    useLayoutEffect,
    useRef,
    type CSSProperties,
    type KeyboardEvent as ReactKeyboardEvent,
    type ReactNode,
} from "react";
import { KeyCap } from "./Badge";
import { Button } from "./Button";
import { Icon } from "./Icon";
export type CommandPaletteProps = {
    /** The current query text; the palette input is a controlled reflection of it. */
    query: string;
    /** Emits the committed query text (IME composition is coalesced to its end). */
    onQueryChange: (value: string) => void;
    /** Dismisses the palette from Escape or the close button. */
    onClose: () => void;
    /** Result/command body rendered under the input row. */
    children: ReactNode;
    placeholder?: string;
    closeLabel?: string;
    /**
     * Focuses and selects the input on mount. On by default so the palette is
     * ready to type; disable it only for deterministic screenshot fixtures.
     */
    autoFocus?: boolean;
    className?: string;
    style?: CSSProperties;
    "data-testid"?: string;
};
/**
 * C-060 CommandPalette — a Slack-style ⌘K palette card with its own focused
 * search input over a scrollable result/command body, hosted by ModalOverlay.
 *
 * The card owns three behaviors application code should not re-implement: it
 * focuses (and selects) its input on mount, returns focus to whatever control
 * was focused when it opened once it unmounts, and closes on Escape. Typing is
 * IME-safe — intermediate composition text is left to the browser's buffer and
 * only the committed value is emitted, so a controlled `query` never interrupts
 * an active composition. It renders the card only (no scrim/stacking); compose
 * it inside `ModalOverlay` so it dims and centers like every other dialog.
 */
export function CommandPalette(props: CommandPaletteProps) {
    const [local, rest] = partitionComponentProps(props, [
        "query",
        "onQueryChange",
        "onClose",
        "children",
        "placeholder",
        "closeLabel",
        "autoFocus",
        "className",
        "style",
    ]);
    const inputRef = useRef<HTMLInputElement>(null);
    const invokerRef = useRef<HTMLElement | null>(null);
    const composingRef = useRef(false);
    const label = () => local.placeholder ?? "Search";
    useLayoutEffect(() => {
        // Capture the invoking control before autofocus moves focus into the
        // input, so closing the palette can hand focus back to it.
        invokerRef.current = document.activeElement as HTMLElement | null;
        if (local.autoFocus !== false && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [local.autoFocus]);
    useLayoutEffect(
        () => () => {
            const invoker = invokerRef.current;
            if (invoker && invoker !== inputRef.current && invoker.isConnected) invoker.focus();
        },
        [],
    );
    // 229 is the legacy IME "processing" keyCode some engines still report when
    // `isComposing` is not yet set on the keydown that starts a composition.
    const isComposing = (event: ReactKeyboardEvent) =>
        composingRef.current || event.nativeEvent.isComposing || event.keyCode === 229;
    return (
        <div
            {...rest}
            aria-label={label()}
            aria-modal="true"
            className={["happy2-command-palette", local.className].filter(Boolean).join(" ")}
            data-happy2-ui="command-palette"
            onKeyDown={(event) => {
                if (event.key === "Escape" && !isComposing(event)) {
                    event.preventDefault();
                    event.stopPropagation();
                    local.onClose();
                }
            }}
            role="dialog"
            style={local.style}
        >
            <div className="happy2-command-palette__header" data-happy2-ui="command-palette-header">
                <span
                    aria-hidden="true"
                    className="happy2-command-palette__icon"
                    data-happy2-ui="command-palette-icon"
                >
                    <Icon name="search" size={18} />
                </span>
                <input
                    aria-label={label()}
                    className="happy2-command-palette__input"
                    data-happy2-ui="command-palette-input"
                    onCompositionEnd={() => {
                        composingRef.current = false;
                    }}
                    onCompositionStart={() => {
                        composingRef.current = true;
                    }}
                    onInput={(event) => {
                        // Single commit path. Intermediate composition input events
                        // are held back on either signal: the local composition flag
                        // (authoritative, so an unreliable/absent `isComposing` hint
                        // is still suppressed) or the event's `isComposing` hint.
                        // `compositionend` clears the flag before the browser's
                        // trailing input (isComposing === false), so that one event is
                        // the sole commit — a value is never emitted twice.
                        if (composingRef.current || event.nativeEvent.isComposing) return;
                        local.onQueryChange(event.currentTarget.value);
                    }}
                    placeholder={label()}
                    ref={inputRef}
                    type="text"
                    value={local.query}
                />
                <KeyCap className="happy2-command-palette__hint" keys="ESC" />
                <Button
                    aria-label={local.closeLabel ?? "Close"}
                    className="happy2-command-palette__close"
                    icon="close"
                    iconOnly
                    onClick={() => local.onClose()}
                    size="small"
                    variant="ghost"
                />
            </div>
            <div className="happy2-command-palette__body" data-happy2-ui="command-palette-body">
                {local.children}
            </div>
        </div>
    );
}
