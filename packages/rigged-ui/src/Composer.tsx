import { createEffect, createSignal, For, onCleanup, Show, type JSX } from "solid-js";
import { Avatar, type ToneName } from "./Avatar";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { EmojiPicker, type EmojiItem } from "./EmojiPicker";
import { Icon, type IconName } from "./Icon";

/* ---- ContextChips ----------------------------------------------------- */

export type ContextKind = "file" | "run" | "thread";

export type ContextItem = {
    detail?: string;
    id: string;
    kind: ContextKind;
    label: string;
};

export type ContextChipsProps = {
    class?: string;
    "data-testid"?: string;
    items: ContextItem[];
    label?: string;
    onRemove?: (id: string) => void;
    readOnly?: boolean;
    style?: JSX.CSSProperties;
};

const kindIcons: Record<ContextKind, IconName> = {
    file: "doc",
    run: "play",
    thread: "thread",
};

/** Attached-context row for the composer: 24px chips with kind icons. */
export function ContextChips(props: ContextChipsProps) {
    return (
        <div
            class={["rigged-context-chips", props.class].filter(Boolean).join(" ")}
            data-rigged-ui="context-chips"
            data-testid={props["data-testid"]}
            style={props.style}
        >
            <Show when={props.label}>
                <span class="rigged-context-chips__label" data-rigged-ui="context-chips-label">
                    {props.label}
                </span>
            </Show>
            <For each={props.items}>
                {(item) => (
                    <span
                        class="rigged-context-chips__chip"
                        data-kind={item.kind}
                        data-rigged-ui="context-chips-chip"
                    >
                        <span
                            class="rigged-context-chips__icon"
                            data-rigged-ui="context-chips-icon"
                        >
                            <Icon name={kindIcons[item.kind]} size={12} />
                        </span>
                        <span
                            class="rigged-context-chips__text"
                            data-rigged-ui="context-chips-text"
                        >
                            {item.label}
                        </span>
                        <Show when={item.detail}>
                            <span
                                class="rigged-context-chips__detail"
                                data-rigged-ui="context-chips-detail"
                            >
                                {item.detail}
                            </span>
                        </Show>
                        <Show when={!props.readOnly && props.onRemove}>
                            <button
                                aria-label={`Remove ${item.label}`}
                                class="rigged-context-chips__remove"
                                data-rigged-ui="context-chips-remove"
                                onClick={() => props.onRemove?.(item.id)}
                                type="button"
                            >
                                <Icon name="close" size={12} />
                            </button>
                        </Show>
                    </span>
                )}
            </For>
        </div>
    );
}

/* ---- MentionPicker ----------------------------------------------------- */

export type Mentionable = {
    description?: string;
    id: string;
    initials: string;
    name: string;
    status?: "ready" | "working";
    tone?: ToneName;
};

/** @deprecated Prefer the product-neutral `Mentionable` name. */
export type MentionableAgent = Mentionable;

export type MentionPickerProps = {
    /** Optional controlled highlight; defaults to the first filtered agent. */
    activeId?: string;
    agents?: Mentionable[];
    class?: string;
    "data-testid"?: string;
    /** Visible heading for the picker (default "Mentions"). */
    label?: string;
    /** Product-neutral mention candidates; takes precedence over `agents`. */
    mentions?: Mentionable[];
    onSelect: (mention: Mentionable) => void;
    query: string;
    style?: JSX.CSSProperties;
};

function filterAgents(agents: Mentionable[], query: string) {
    const needle = query.trim().toLowerCase();
    if (!needle) return agents;
    return agents.filter((agent) => agent.name.toLowerCase().includes(needle));
}

/** 320px raised popover listing mention candidates, filtered by `query`. */
export function MentionPicker(props: MentionPickerProps) {
    const candidates = () => props.mentions ?? props.agents ?? [];
    const filtered = () => filterAgents(candidates(), props.query);
    const activeId = () => props.activeId ?? filtered()[0]?.id;

    return (
        <div
            aria-label={props.label ?? "Mentions"}
            class={["rigged-mention-picker", props.class].filter(Boolean).join(" ")}
            data-rigged-ui="mention-picker"
            data-testid={props["data-testid"]}
            role="listbox"
            style={props.style}
        >
            <div class="rigged-mention-picker__header" data-rigged-ui="mention-picker-header">
                {props.label ?? "Mentions"}
            </div>
            <Show
                when={filtered().length > 0}
                fallback={
                    <div class="rigged-mention-picker__empty" data-rigged-ui="mention-picker-empty">
                        No mentions match “{props.query}”
                    </div>
                }
            >
                <For each={filtered()}>
                    {(agent) => (
                        <button
                            aria-selected={agent.id === activeId() ? "true" : "false"}
                            class="rigged-mention-picker__row"
                            data-active={agent.id === activeId() ? "" : undefined}
                            data-agent-id={agent.id}
                            data-rigged-ui="mention-picker-row"
                            onClick={() => props.onSelect(agent)}
                            role="option"
                            type="button"
                        >
                            <Avatar
                                initials={agent.initials}
                                size="sm"
                                tone={agent.tone}
                                type="agent"
                            />
                            <span
                                class="rigged-mention-picker__meta"
                                data-rigged-ui="mention-picker-meta"
                            >
                                <span
                                    class="rigged-mention-picker__name"
                                    data-rigged-ui="mention-picker-name"
                                >
                                    {agent.name}
                                </span>
                                <Show when={agent.description}>
                                    <span
                                        class="rigged-mention-picker__description"
                                        data-rigged-ui="mention-picker-description"
                                    >
                                        {agent.description}
                                    </span>
                                </Show>
                            </span>
                            <Show when={agent.status}>
                                {(status) => (
                                    <Badge
                                        class="rigged-mention-picker__status"
                                        label={status()}
                                        variant={status() === "ready" ? "success" : "warning"}
                                    />
                                )}
                            </Show>
                        </button>
                    )}
                </For>
            </Show>
        </div>
    );
}

/* ---- Composer ----------------------------------------------------------- */

export type ComposerProps = {
    agents?: MentionableAgent[];
    /** Native file-picker accept filter, used with `onAttachmentsSelect`. */
    attachmentAccept?: string;
    /** Allows more than one file in the native picker. */
    attachmentMultiple?: boolean;
    class?: string;
    contextItems?: ContextItem[];
    "data-testid"?: string;
    disabled?: boolean;
    /** e.g. "Enter to send · @ to hand off to an agent" */
    hint?: string;
    /** Opens a host-owned attachment browser. Takes precedence over the native picker. */
    onAttachFile?: () => void;
    /** Receives files selected through the composer's native attachment picker. */
    onAttachmentsSelect?: (files: File[]) => void;
    onContextRemove?: (id: string) => void;
    /** Called after an emoji is selected. Unicode emoji are also inserted into the draft. */
    onEmojiSelect?: (emoji: EmojiItem) => void;
    /** Called when a mention is inserted from the picker. */
    onMentionSelect?: (agent: MentionableAgent) => void;
    /** Product-neutral mention candidates; takes precedence over `agents`. */
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
    style?: JSX.CSSProperties;
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
    let composerEl: HTMLDivElement | undefined;
    let fileInputEl: HTMLInputElement | undefined;
    let textareaEl: HTMLTextAreaElement | undefined;
    const [mentionStart, setMentionStart] = createSignal<number | null>(null);
    const [mentionQuery, setMentionQuery] = createSignal("");
    const [activeIndex, setActiveIndex] = createSignal(0);
    const [emojiOpen, setEmojiOpen] = createSignal(false);
    const [emojiQuery, setEmojiQuery] = createSignal("");
    const [restoreFocusAfterSend, setRestoreFocusAfterSend] = createSignal(false);
    const [selection, setSelection] = createSignal({ start: 0, end: 0 });

    const agents = () => props.mentions ?? props.agents ?? [];
    const filtered = () => filterAgents(agents(), mentionQuery());
    const mentionOpen = () => mentionStart() !== null && agents().length > 0;
    const activeAgent = () => {
        const list = filtered();
        if (list.length === 0) return undefined;
        return list[Math.min(activeIndex(), list.length - 1)];
    };
    const busy = () => Boolean(props.disabled || props.pending);
    const canSend = () => !busy() && (props.sendEnabled ?? props.value.trim().length > 0);
    const emoji = () => props.emoji ?? [];
    const filteredEmoji = () => {
        const needle = emojiQuery().trim().toLowerCase();
        if (!needle) return emoji();
        return emoji().filter(
            (item) =>
                item.id.toLowerCase().includes(needle) || item.name.toLowerCase().includes(needle),
        );
    };
    const hasAttachmentAction = () => Boolean(props.onAttachFile || props.onAttachmentsSelect);

    /* Auto-grow: collapse to one line, then track content up to 8 lines. */
    createEffect(() => {
        void props.value;
        const el = textareaEl;
        if (!el) return;
        el.style.height = `${LINE_HEIGHT}px`;
        el.style.height = `${Math.min(el.scrollHeight, LINE_HEIGHT * MAX_LINES)}px`;
    });

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

    createEffect(() => {
        if (!props.disabled && !props.pending) return;
        closePopovers();
    });

    let wasBusy = busy();
    createEffect(() => {
        const isBusy = busy();
        if (wasBusy && !isBusy && restoreFocusAfterSend()) {
            textareaEl?.focus();
            setRestoreFocusAfterSend(false);
        }
        wasBusy = isBusy;
    });

    createEffect(() => {
        const onPointerDown = (event: PointerEvent) => {
            if (!composerEl?.contains(event.target as Node)) closePopovers();
        };
        document.addEventListener("pointerdown", onPointerDown);
        onCleanup(() => document.removeEventListener("pointerdown", onPointerDown));
    });

    const rememberSelection = () => {
        const el = textareaEl;
        if (!el) return;
        setSelection({
            start: el.selectionStart ?? props.value.length,
            end: el.selectionEnd ?? props.value.length,
        });
    };

    const focusAt = (position: number) => {
        const el = textareaEl;
        if (!el) return;
        queueMicrotask(() => {
            el.focus();
            el.setSelectionRange(position, position);
            setSelection({ start: position, end: position });
        });
    };

    const replaceSelection = (text: string) => {
        const current = selection();
        const next = props.value.slice(0, current.start) + text + props.value.slice(current.end);
        const nextCaret = current.start + text.length;
        props.onValueChange(next);
        focusAt(nextCaret);
    };

    const detectMention = (el: HTMLTextAreaElement) => {
        if (agents().length === 0) return;
        const caret = el.selectionStart ?? el.value.length;
        const before = el.value.slice(0, caret);
        const match = /(^|[\s([{])@([\w-]*)$/.exec(before);
        if (!match) {
            closeMention();
            return;
        }
        const query = match[2] ?? "";
        const start = caret - query.length - 1;
        if (mentionStart() !== start || mentionQuery() !== query) setActiveIndex(0);
        setMentionStart(start);
        setMentionQuery(query);
    };

    const selectMention = (agent: MentionableAgent) => {
        const el = textareaEl;
        const start = mentionStart();
        if (!el || start === null) return;
        const caret = el.selectionStart ?? el.value.length;
        const insertion = `@${agent.name} `;
        const next = el.value.slice(0, start) + insertion + el.value.slice(caret);
        closeMention();
        props.onValueChange(next);
        props.onMentionSelect?.(agent);
        const nextCaret = start + insertion.length;
        focusAt(nextCaret);
    };

    const triggerMention = () => {
        const el = textareaEl;
        if (!el || busy() || agents().length === 0) return;
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
        if (busy() || emoji().length === 0) return;
        closeMention();
        rememberSelection();
        setEmojiOpen((open) => !open);
        setEmojiQuery("");
        queueMicrotask(() => {
            if (!emojiOpen()) return;
            composerEl
                ?.querySelector<HTMLInputElement>('[data-rigged-ui="emoji-picker"] input')
                ?.focus();
        });
    };

    const selectEmoji = (id: string) => {
        const item = emoji().find((candidate) => candidate.id === id);
        if (!item) return;
        closeEmoji();
        if (item.char) replaceSelection(item.char);
        else textareaEl?.focus();
        props.onEmojiSelect?.(item);
    };

    const triggerAttachment = () => {
        if (busy()) return;
        closePopovers();
        if (props.onAttachFile) props.onAttachFile();
        else fileInputEl?.click();
    };

    const selectAttachments = (event: Event & { currentTarget: HTMLInputElement }) => {
        const files = Array.from(event.currentTarget.files ?? []);
        if (files.length > 0) props.onAttachmentsSelect?.(files);
        event.currentTarget.value = "";
        textareaEl?.focus();
    };

    const send = () => {
        if (!canSend()) return;
        closePopovers();
        setRestoreFocusAfterSend(true);
        void props.onSend();
        queueMicrotask(() => {
            if (busy()) return;
            textareaEl?.focus();
            setRestoreFocusAfterSend(false);
        });
    };

    const onKeyDown = (event: KeyboardEvent) => {
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
            if ((event.key === "Enter" || event.key === "Tab") && list.length > 0) {
                event.preventDefault();
                const agent = activeAgent();
                if (agent) selectMention(agent);
                return;
            }
            if (event.key === "Escape") {
                event.preventDefault();
                closeMention();
                return;
            }
        }
        if (emojiOpen() && event.key === "Escape") {
            event.preventDefault();
            closeEmoji();
            textareaEl?.focus();
            return;
        }
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            send();
        }
    };

    const onInput = (event: InputEvent & { currentTarget: HTMLTextAreaElement }) => {
        props.onValueChange(event.currentTarget.value);
        rememberSelection();
        detectMention(event.currentTarget);
    };

    return (
        <div
            class={["rigged-composer", props.class].filter(Boolean).join(" ")}
            aria-busy={props.pending ? "true" : undefined}
            data-disabled={props.disabled ? "" : undefined}
            data-pending={props.pending ? "" : undefined}
            data-rigged-ui="composer"
            data-testid={props["data-testid"]}
            onFocusOut={(event) => {
                const next = event.relatedTarget;
                if (next && !event.currentTarget.contains(next as Node)) closePopovers();
            }}
            style={props.style}
            ref={(element) => {
                composerEl = element;
            }}
        >
            <Show when={(props.contextItems?.length ?? 0) > 0}>
                <div class="rigged-composer__context" data-rigged-ui="composer-context">
                    <ContextChips
                        items={props.contextItems ?? []}
                        onRemove={props.onContextRemove}
                        readOnly={!props.onContextRemove}
                    />
                </div>
            </Show>
            <div class="rigged-composer__input" data-rigged-ui="composer-input">
                <textarea
                    class="rigged-composer__textarea"
                    data-rigged-ui="composer-textarea"
                    disabled={props.disabled}
                    readOnly={props.pending}
                    onBlur={rememberSelection}
                    onClick={rememberSelection}
                    onInput={onInput}
                    onKeyDown={onKeyDown}
                    onSelect={rememberSelection}
                    placeholder={props.placeholder}
                    ref={(element) => {
                        textareaEl = element;
                    }}
                    rows={1}
                    value={props.value}
                />
            </div>
            <div class="rigged-composer__toolbar" data-rigged-ui="composer-toolbar">
                <div class="rigged-composer__actions" data-rigged-ui="composer-actions">
                    <Show when={hasAttachmentAction()}>
                        <Button
                            aria-label="Attach file"
                            disabled={busy()}
                            icon="paperclip"
                            iconOnly
                            onClick={triggerAttachment}
                            size="small"
                            variant="ghost"
                        />
                    </Show>
                    <Show when={agents().length > 0}>
                        <Button
                            aria-label="Mention someone"
                            disabled={busy()}
                            icon="at"
                            iconOnly
                            onClick={triggerMention}
                            size="small"
                            variant="ghost"
                        />
                    </Show>
                    <Show when={emoji().length > 0}>
                        <Button
                            aria-expanded={emojiOpen() ? "true" : "false"}
                            aria-haspopup="dialog"
                            aria-label="Add emoji"
                            disabled={busy()}
                            icon="smile"
                            iconOnly
                            onClick={triggerEmoji}
                            size="small"
                            variant="ghost"
                        />
                    </Show>
                </div>
                <div class="rigged-composer__trailing" data-rigged-ui="composer-trailing">
                    <Show when={props.hint}>
                        <span class="rigged-composer__hint" data-rigged-ui="composer-hint">
                            {props.hint}
                        </span>
                    </Show>
                    <Button
                        aria-label="Send message"
                        class="rigged-composer__send"
                        disabled={!canSend()}
                        icon="send"
                        iconOnly
                        onClick={send}
                        size="small"
                        variant="primary"
                    />
                </div>
            </div>
            <Show when={mentionOpen()}>
                <div
                    class="rigged-composer__popover"
                    data-rigged-ui="composer-popover"
                    onMouseDown={(event) => event.preventDefault()}
                >
                    <MentionPicker
                        activeId={activeAgent()?.id}
                        label={props.mentionPickerLabel}
                        mentions={agents()}
                        onSelect={selectMention}
                        query={mentionQuery()}
                    />
                </div>
            </Show>
            <Show when={emojiOpen()}>
                <div
                    aria-label="Choose emoji"
                    class="rigged-composer__popover rigged-composer__popover--emoji"
                    data-rigged-ui="composer-emoji-popover"
                    onKeyDown={(event) => {
                        if (event.key !== "Escape") return;
                        event.preventDefault();
                        closeEmoji();
                        textareaEl?.focus();
                    }}
                    role="dialog"
                >
                    <EmojiPicker
                        emoji={filteredEmoji()}
                        onQueryChange={setEmojiQuery}
                        onSelect={selectEmoji}
                        query={emojiQuery()}
                        recent={props.recentEmoji}
                    />
                </div>
            </Show>
            <Show when={props.onAttachmentsSelect && !props.onAttachFile}>
                <input
                    accept={props.attachmentAccept}
                    aria-hidden="true"
                    class="rigged-composer__file-input"
                    multiple={props.attachmentMultiple}
                    onChange={selectAttachments}
                    ref={(element) => {
                        fileInputEl = element;
                    }}
                    tabIndex={-1}
                    type="file"
                />
            </Show>
        </div>
    );
}
