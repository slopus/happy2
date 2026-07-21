import {
    useLayoutEffect,
    useRef,
    useState,
    type ChangeEvent,
    type CSSProperties,
    type FormEvent,
    type KeyboardEvent as ReactKeyboardEvent,
    type ReactNode,
} from "react";
import { AudienceToggle, type AudienceValue } from "./AudienceToggle";
import { Avatar, type ToneName } from "./Avatar";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { EmojiPicker, type EmojiItem } from "./EmojiPicker";
import { Icon, type IconName } from "./Icon";
/* ---- ContextChips ----------------------------------------------------- */
export type ContextKind = "file" | "run";
export type ContextItem = {
    detail?: string;
    id: string;
    kind: ContextKind;
    label: string;
};
export type ContextChipsProps = {
    className?: string;
    "data-testid"?: string;
    items: ContextItem[];
    label?: string;
    onRemove?: (id: string) => void;
    readOnly?: boolean;
    style?: CSSProperties;
};
const kindIcons: Record<ContextKind, IconName> = {
    file: "doc",
    run: "play",
};
/** Attached-context row for the composer: 24px chips with kind icons. */
export function ContextChips(props: ContextChipsProps) {
    return (
        <div
            className={["happy2-context-chips", props.className].filter(Boolean).join(" ")}
            data-happy2-ui="context-chips"
            data-testid={props["data-testid"]}
            style={props.style}
        >
            {props.label ? (
                <span className="happy2-context-chips__label" data-happy2-ui="context-chips-label">
                    {props.label}
                </span>
            ) : null}
            {props.items.map((item) => (
                <span
                    className="happy2-context-chips__chip"
                    key={item.id}
                    data-kind={item.kind}
                    data-happy2-ui="context-chips-chip"
                >
                    <span
                        className="happy2-context-chips__icon"
                        data-happy2-ui="context-chips-icon"
                    >
                        <Icon name={kindIcons[item.kind]} size={12} />
                    </span>
                    <span
                        className="happy2-context-chips__text"
                        data-happy2-ui="context-chips-text"
                    >
                        {item.label}
                    </span>
                    {item.detail ? (
                        <span
                            className="happy2-context-chips__detail"
                            data-happy2-ui="context-chips-detail"
                        >
                            {item.detail}
                        </span>
                    ) : null}
                    {!props.readOnly && props.onRemove ? (
                        <button
                            aria-label={`Remove ${item.label}`}
                            className="happy2-context-chips__remove"
                            data-happy2-ui="context-chips-remove"
                            onClick={() => props.onRemove?.(item.id)}
                            type="button"
                        >
                            <Icon name="close" size={12} />
                        </button>
                    ) : null}
                </span>
            ))}
        </div>
    );
}
/* ---- MentionPicker ----------------------------------------------------- */
export type Mentionable = {
    description?: string;
    id: string;
    initials: string;
    /** Documents render under their own subsection with a doc glyph. */
    kind?: "person" | "document";
    name: string;
    status?: "ready" | "working";
    tone?: ToneName;
};
export type MentionPickerProps = {
    /** Optional controlled highlight; defaults to the first filtered mention. */
    activeId?: string;
    className?: string;
    "data-testid"?: string;
    /** Visible heading for the picker (default "Mentions"). */
    label?: string;
    mentions?: Mentionable[];
    onSelect: (mention: Mentionable) => void;
    query: string;
    style?: CSSProperties;
};
/*
 * People always precede documents so the flat keyboard-navigation order in the
 * composer matches the picker's grouped rendering exactly.
 */
function filterMentions(mentions: Mentionable[], query: string) {
    const needle = query.trim().toLowerCase();
    const matched = needle
        ? mentions.filter((mention) => mention.name.toLowerCase().includes(needle))
        : mentions;
    return [
        ...matched.filter((mention) => mention.kind !== "document"),
        ...matched.filter((mention) => mention.kind === "document"),
    ];
}
/**
 * 320px raised popover listing mention candidates, filtered by `query`.
 * People render first under the primary heading; document candidates follow
 * under their own "Documents" subsection with a doc glyph instead of an avatar.
 */
export function MentionPicker(props: MentionPickerProps) {
    const candidates = () => props.mentions ?? [];
    const filtered = () => filterMentions(candidates(), props.query);
    const activeId = () => props.activeId ?? filtered()[0]?.id;
    const people = () => filtered().filter((mention) => mention.kind !== "document");
    const documents = () => filtered().filter((mention) => mention.kind === "document");
    const row = (mention: Mentionable) => (
        <button
            aria-selected={mention.id === activeId() ? "true" : "false"}
            key={mention.id}
            className="happy2-mention-picker__row"
            data-active={mention.id === activeId() ? "" : undefined}
            data-happy2-ui="mention-picker-row"
            data-mention-id={mention.id}
            onClick={() => props.onSelect(mention)}
            role="option"
            type="button"
        >
            {mention.kind === "document" ? (
                <span
                    className="happy2-mention-picker__doc-glyph"
                    data-happy2-ui="mention-picker-doc-glyph"
                >
                    <Icon name="doc" size={14} />
                </span>
            ) : (
                <Avatar initials={mention.initials} size="sm" tone={mention.tone} type="agent" />
            )}
            <span className="happy2-mention-picker__meta" data-happy2-ui="mention-picker-meta">
                <span className="happy2-mention-picker__name" data-happy2-ui="mention-picker-name">
                    {mention.name}
                </span>
                {mention.description ? (
                    <span
                        className="happy2-mention-picker__description"
                        data-happy2-ui="mention-picker-description"
                    >
                        {mention.description}
                    </span>
                ) : null}
            </span>
            {mention.status
                ? ((status) => (
                      <Badge
                          className="happy2-mention-picker__status"
                          label={status}
                          variant={status === "ready" ? "success" : "warning"}
                      />
                  ))(mention.status)
                : null}
        </button>
    );
    return (
        <div
            aria-label={props.label ?? "Mentions"}
            className={["happy2-mention-picker", props.className].filter(Boolean).join(" ")}
            data-happy2-ui="mention-picker"
            data-testid={props["data-testid"]}
            role="listbox"
            style={props.style}
        >
            <div className="happy2-mention-picker__header" data-happy2-ui="mention-picker-header">
                {props.label ?? "Mentions"}
            </div>
            {filtered().length > 0 ? (
                <>
                    {people().map(row)}
                    {documents().length > 0 ? (
                        <div
                            className="happy2-mention-picker__header"
                            data-happy2-ui="mention-picker-documents-header"
                        >
                            Documents
                        </div>
                    ) : null}
                    {documents().map(row)}
                </>
            ) : (
                <div className="happy2-mention-picker__empty" data-happy2-ui="mention-picker-empty">
                    No mentions match “{props.query}”
                </div>
            )}
        </div>
    );
}
/* ---- Composer ----------------------------------------------------------- */
export type ComposerProps = {
    /** Native file-picker accept filter, used with `onAttachmentsSelect`. */
    attachmentAccept?: string;
    /** Allows more than one file in the native picker. */
    attachmentMultiple?: boolean;
    /**
     * Current message destination. Supplying it (with `onAudienceChange`)
     * renders the People/Agents toggle and enables Shift+Tab switching.
     */
    audience?: AudienceValue;
    className?: string;
    /** Short companion for `hint`, shown only when the toolbar needs to compact. */
    compactHint?: string;
    /**
     * Native plugin composer contribution triggers (icon buttons and menus),
     * rendered at the end of the toolbar action group. Supplied by the
     * application; each owns its own invocation state.
     */
    contributions?: ReactNode;
    contextItems?: ContextItem[];
    "data-testid"?: string;
    disabled?: boolean;
    /** e.g. "Enter to send · @ to hand off to an agent" */
    hint?: string;
    /** Opens a host-owned attachment browser. Takes precedence over the native picker. */
    onAttachFile?: () => void;
    /** Called for toggle clicks and Shift+Tab with the next audience. */
    onAudienceChange?: (audience: AudienceValue) => void;
    /** Receives files selected through the composer's native attachment picker. */
    onAttachmentsSelect?: (files: File[]) => void;
    onContextRemove?: (id: string) => void;
    /** Called after an emoji is selected. Unicode emoji are also inserted into the draft. */
    onEmojiSelect?: (emoji: EmojiItem) => void;
    /** Reports browser focus transitions of the editable text control. */
    onFocusChange?: (focused: boolean) => void;
    /** Called when a mention is inserted from the picker. */
    onMentionSelect?: (mention: Mentionable) => void;
    mentions?: Mentionable[];
    /** Visible heading above the mention candidates (default "Mentions"). */
    mentionPickerLabel?: string;
    onSend: () => unknown;
    onValueChange: (value: string) => void;
    placeholder?: string;
    /** Keeps the composer geometry stable while the current send is being acknowledged. */
    pending?: boolean;
    /** Emoji available to the composer's searchable picker. */
    emoji?: EmojiItem[];
    /** Emoji ids rendered in the picker's recent section. */
    recentEmoji?: string[];
    /** Overrides the text-only send check when attached context is sendable. */
    sendEnabled?: boolean;
    style?: CSSProperties;
    value: string;
};
const LINE_HEIGHT = 22;
const MAX_LINES = 8;
/**
 * Message composer: focus-within surface card with an auto-growing textarea
 * (1–8 lines), context chips, capability-driven file/mention/emoji actions,
 * a primary send control, and keyboard-accessible picker popovers.
 */
export function Composer(props: ComposerProps) {
    const composerEl = useRef<HTMLDivElement>(null);
    const fileInputEl = useRef<HTMLInputElement>(null);
    const textareaEl = useRef<HTMLTextAreaElement>(null);
    const wasBusy = useRef(Boolean(props.disabled || props.pending));
    const [mentionStart, setMentionStart] = useState<number | null>(null);
    const [mentionQuery, setMentionQuery] = useState("");
    const [activeIndex, setActiveIndex] = useState(0);
    const [emojiOpen, setEmojiOpen] = useState(false);
    const [emojiQuery, setEmojiQuery] = useState("");
    const restoreFocusAfterSend = useRef(false);
    const [selection, setSelection] = useState({ start: 0, end: 0 });
    const busy = Boolean(props.disabled || props.pending);
    const mentions = () => props.mentions ?? [];
    const filtered = () => filterMentions(mentions(), mentionQuery);
    const mentionOpen = () => !busy && mentionStart !== null && mentions().length > 0;
    const activeMention = () => {
        const list = filtered();
        if (list.length === 0) return undefined;
        return list[Math.min(activeIndex, list.length - 1)];
    };
    const canSend = () => !busy && (props.sendEnabled ?? props.value.trim().length > 0);
    const emoji = () => props.emoji ?? [];
    const filteredEmoji = () => {
        const needle = emojiQuery.trim().toLowerCase();
        if (!needle) return emoji();
        return emoji().filter(
            (item) =>
                item.id.toLowerCase().includes(needle) || item.name.toLowerCase().includes(needle),
        );
    };
    const hasAttachmentAction = () => Boolean(props.onAttachFile || props.onAttachmentsSelect);
    const audienceEnabled = () => Boolean(props.audience && props.onAudienceChange);
    const audienceToggle = () => {
        if (!props.audience) return;
        props.onAudienceChange?.(props.audience === "agents" ? "people" : "agents");
    };
    /* Auto-grow: collapse to one line, then track content up to 8 lines. */
    useLayoutEffect(() => {
        void props.value;
        const el = textareaEl.current;
        if (!el) return;
        el.style.height = `${LINE_HEIGHT}px`;
        el.style.height = `${Math.min(el.scrollHeight, LINE_HEIGHT * MAX_LINES)}px`;
    }, [props.value]);
    const closeMention = () => {
        setMentionStart(null);
        setMentionQuery("");
        setActiveIndex(0);
    };
    const closeEmoji = () => {
        setEmojiOpen(false);
        setEmojiQuery("");
    };
    const closePopovers = () => {
        closeMention();
        closeEmoji();
    };
    useLayoutEffect(() => {
        if (wasBusy.current && !busy && restoreFocusAfterSend.current) {
            textareaEl.current?.focus();
            restoreFocusAfterSend.current = false;
        }
        wasBusy.current = busy;
    }, [busy]);
    useLayoutEffect(() => {
        const onPointerDown = (event: PointerEvent) => {
            if (!composerEl.current?.contains(event.target as Node)) closePopovers();
        };
        document.addEventListener("pointerdown", onPointerDown);
        return () => document.removeEventListener("pointerdown", onPointerDown);
    });
    const rememberSelection = () => {
        const el = textareaEl.current;
        if (!el) return;
        setSelection({
            start: el.selectionStart ?? props.value.length,
            end: el.selectionEnd ?? props.value.length,
        });
    };
    const focusAt = (position: number) => {
        const el = textareaEl.current;
        if (!el) return;
        queueMicrotask(() => {
            el.focus();
            el.setSelectionRange(position, position);
            setSelection({ start: position, end: position });
        });
    };
    const replaceSelection = (text: string) => {
        const current = selection;
        const next = props.value.slice(0, current.start) + text + props.value.slice(current.end);
        const nextCaret = current.start + text.length;
        props.onValueChange(next);
        focusAt(nextCaret);
    };
    const detectMention = (el: HTMLTextAreaElement) => {
        if (mentions().length === 0) return;
        const caret = el.selectionStart ?? el.value.length;
        const before = el.value.slice(0, caret);
        const match = /(^|[\s([{])@([\w-]*)$/.exec(before);
        if (!match) {
            closeMention();
            return;
        }
        const query = match[2] ?? "";
        const start = caret - query.length - 1;
        if (mentionStart !== start || mentionQuery !== query) setActiveIndex(0);
        setMentionStart(start);
        setMentionQuery(query);
    };
    const selectMention = (mention: Mentionable) => {
        const el = textareaEl.current;
        const start = mentionStart;
        if (!el || start === null) return;
        const caret = el.selectionStart ?? el.value.length;
        const insertion = `@${mention.name} `;
        const next = el.value.slice(0, start) + insertion + el.value.slice(caret);
        closeMention();
        props.onValueChange(next);
        props.onMentionSelect?.(mention);
        const nextCaret = start + insertion.length;
        focusAt(nextCaret);
    };
    const triggerMention = () => {
        const el = textareaEl.current;
        if (!el || busy || mentions().length === 0) return;
        closeEmoji();
        el.focus();
        const caret = el.selectionStart ?? props.value.length;
        const before = props.value.slice(0, caret);
        const needsSpace = before.length > 0 && !/[\s([{]$/.test(before);
        const insertion = `${needsSpace ? " " : ""}@`;
        const next = before + insertion + props.value.slice(el.selectionEnd ?? caret);
        props.onValueChange(next);
        setMentionStart(caret + insertion.length - 1);
        setMentionQuery("");
        setActiveIndex(0);
        const nextCaret = caret + insertion.length;
        focusAt(nextCaret);
    };
    const triggerEmoji = () => {
        if (busy || emoji().length === 0) return;
        closeMention();
        rememberSelection();
        const open = !emojiOpen;
        setEmojiOpen(open);
        setEmojiQuery("");
        queueMicrotask(() => {
            if (!open) return;
            composerEl.current
                ?.querySelector<HTMLInputElement>('[data-happy2-ui="emoji-picker"] input')
                ?.focus();
        });
    };
    const selectEmoji = (id: string) => {
        const item = emoji().find((candidate) => candidate.id === id);
        if (!item) return;
        closeEmoji();
        if (item.char) replaceSelection(item.char);
        else textareaEl.current?.focus();
        props.onEmojiSelect?.(item);
    };
    const triggerAttachment = () => {
        if (busy) return;
        closePopovers();
        if (props.onAttachFile) props.onAttachFile();
        else fileInputEl.current?.click();
    };
    const selectAttachments = (event: ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.currentTarget.files ?? []);
        if (files.length > 0) props.onAttachmentsSelect?.(files);
        event.currentTarget.value = "";
        textareaEl.current?.focus();
    };
    const send = () => {
        if (!canSend()) return;
        closePopovers();
        restoreFocusAfterSend.current = true;
        void props.onSend();
        queueMicrotask(() => {
            const textarea = textareaEl.current;
            if (!textarea || textarea.disabled || textarea.readOnly) return;
            textarea.focus();
            restoreFocusAfterSend.current = false;
        });
    };
    const onKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
        if (
            event.key === "Tab" &&
            event.shiftKey &&
            audienceEnabled() &&
            !busy &&
            !event.nativeEvent.isComposing
        ) {
            event.preventDefault();
            audienceToggle();
            return;
        }
        if (mentionOpen()) {
            const list = filtered();
            if (event.key === "ArrowDown" && list.length > 0) {
                event.preventDefault();
                setActiveIndex((index) => (index + 1) % list.length);
                return;
            }
            if (event.key === "ArrowUp" && list.length > 0) {
                event.preventDefault();
                setActiveIndex((index) => (index - 1 + list.length) % list.length);
                return;
            }
            if (
                (event.key === "Enter" || (event.key === "Tab" && !event.shiftKey)) &&
                list.length > 0
            ) {
                event.preventDefault();
                const mention = activeMention();
                if (mention) selectMention(mention);
                return;
            }
            if (event.key === "Escape") {
                event.preventDefault();
                closeMention();
                return;
            }
        }
        if (emojiOpen && event.key === "Escape") {
            event.preventDefault();
            closeEmoji();
            textareaEl.current?.focus();
            return;
        }
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            send();
        }
    };
    const onInput = (event: FormEvent<HTMLTextAreaElement>) => {
        props.onValueChange(event.currentTarget.value);
        rememberSelection();
        detectMention(event.currentTarget);
    };
    return (
        <div
            className={["happy2-composer", props.className].filter(Boolean).join(" ")}
            aria-busy={props.pending ? "true" : undefined}
            data-audience={audienceEnabled() ? "" : undefined}
            data-agents={audienceEnabled() && props.audience === "agents" ? "" : undefined}
            data-disabled={props.disabled ? "" : undefined}
            data-pending={props.pending ? "" : undefined}
            data-happy2-ui="composer"
            data-testid={props["data-testid"]}
            onBlur={(event) => {
                const next = event.relatedTarget;
                if (next && !event.currentTarget.contains(next as Node)) closePopovers();
            }}
            style={props.style}
            ref={composerEl}
        >
            {(props.contextItems?.length ?? 0) > 0 ? (
                <div className="happy2-composer__context" data-happy2-ui="composer-context">
                    <ContextChips
                        items={props.contextItems ?? []}
                        onRemove={props.onContextRemove}
                        readOnly={!props.onContextRemove}
                    />
                </div>
            ) : null}
            <div className="happy2-composer__input" data-happy2-ui="composer-input">
                <textarea
                    className="happy2-composer__textarea"
                    data-happy2-ui="composer-textarea"
                    disabled={props.disabled}
                    readOnly={props.pending}
                    onBlur={() => {
                        rememberSelection();
                        props.onFocusChange?.(false);
                    }}
                    onClick={rememberSelection}
                    onFocus={() => props.onFocusChange?.(true)}
                    onInput={onInput}
                    onKeyDown={onKeyDown}
                    onSelect={rememberSelection}
                    placeholder={props.placeholder}
                    ref={textareaEl}
                    rows={1}
                    value={props.value}
                />
            </div>
            <div className="happy2-composer__toolbar" data-happy2-ui="composer-toolbar">
                <div className="happy2-composer__actions" data-happy2-ui="composer-actions">
                    {audienceEnabled() ? (
                        <AudienceToggle
                            disabled={busy}
                            onChange={(value) => props.onAudienceChange?.(value)}
                            value={props.audience!}
                        />
                    ) : null}
                    {hasAttachmentAction() ? (
                        <Button
                            aria-label="Attach file"
                            disabled={busy}
                            icon="paperclip"
                            iconOnly
                            onClick={triggerAttachment}
                            size="small"
                            variant="ghost"
                        />
                    ) : null}
                    {mentions().length > 0 ? (
                        <Button
                            aria-label="Mention someone"
                            disabled={busy}
                            icon="at"
                            iconOnly
                            onClick={triggerMention}
                            size="small"
                            variant="ghost"
                        />
                    ) : null}
                    {emoji().length > 0 ? (
                        <Button
                            aria-expanded={emojiOpen ? "true" : "false"}
                            aria-haspopup="dialog"
                            aria-label="Add emoji"
                            disabled={busy}
                            icon="smile"
                            iconOnly
                            onClick={triggerEmoji}
                            size="small"
                            variant="ghost"
                        />
                    ) : null}
                    {props.contributions ? (
                        <span
                            className="happy2-composer__contributions"
                            data-happy2-ui="composer-contributions"
                        >
                            {props.contributions}
                        </span>
                    ) : null}
                </div>
                <div className="happy2-composer__trailing" data-happy2-ui="composer-trailing">
                    {props.hint ? (
                        <span className="happy2-composer__hint" data-happy2-ui="composer-hint">
                            {props.hint}
                        </span>
                    ) : null}
                    {props.compactHint ? (
                        <span
                            className="happy2-composer__hint--compact"
                            data-happy2-ui="composer-hint-compact"
                        >
                            {props.compactHint}
                        </span>
                    ) : null}
                    <Button
                        aria-label="Send message"
                        className="happy2-composer__send"
                        disabled={!canSend()}
                        icon="send"
                        iconOnly
                        onClick={send}
                        size="small"
                        variant="primary"
                    />
                </div>
            </div>
            {mentionOpen() ? (
                <div
                    className="happy2-composer__popover"
                    data-happy2-ui="composer-popover"
                    onMouseDown={(event) => event.preventDefault()}
                >
                    <MentionPicker
                        activeId={activeMention()?.id}
                        label={props.mentionPickerLabel}
                        mentions={mentions()}
                        onSelect={selectMention}
                        query={mentionQuery}
                    />
                </div>
            ) : null}
            {emojiOpen && !busy ? (
                <div
                    aria-label="Choose emoji"
                    className="happy2-composer__popover happy2-composer__popover--emoji"
                    data-happy2-ui="composer-emoji-popover"
                    onKeyDown={(event) => {
                        if (event.key !== "Escape") return;
                        event.preventDefault();
                        closeEmoji();
                        textareaEl.current?.focus();
                    }}
                    role="dialog"
                >
                    <EmojiPicker
                        emoji={filteredEmoji()}
                        onQueryChange={setEmojiQuery}
                        onSelect={selectEmoji}
                        query={emojiQuery}
                        recent={props.recentEmoji}
                    />
                </div>
            ) : null}
            {props.onAttachmentsSelect && !props.onAttachFile ? (
                <input
                    accept={props.attachmentAccept}
                    aria-hidden="true"
                    className="happy2-composer__file-input"
                    multiple={props.attachmentMultiple}
                    onChange={selectAttachments}
                    ref={fileInputEl}
                    tabIndex={-1}
                    type="file"
                />
            ) : null}
        </div>
    );
}
