import { createEffect, createSignal, For, Show, type JSX } from "solid-js";
import { Avatar, type ToneName } from "./Avatar";
import { Badge } from "./Badge";
import { Button } from "./Button";
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

export type MentionableAgent = {
    description?: string;
    id: string;
    initials: string;
    name: string;
    status?: "ready" | "working";
    tone?: ToneName;
};

export type MentionPickerProps = {
    /** Optional controlled highlight; defaults to the first filtered agent. */
    activeId?: string;
    agents: MentionableAgent[];
    class?: string;
    "data-testid"?: string;
    onSelect: (agent: MentionableAgent) => void;
    query: string;
    style?: JSX.CSSProperties;
};

function filterAgents(agents: MentionableAgent[], query: string) {
    const needle = query.trim().toLowerCase();
    if (!needle) return agents;
    return agents.filter((agent) => agent.name.toLowerCase().includes(needle));
}

/** 320px raised popover listing mentionable agents, filtered by `query`. */
export function MentionPicker(props: MentionPickerProps) {
    const filtered = () => filterAgents(props.agents, props.query);
    const activeId = () => props.activeId ?? filtered()[0]?.id;

    return (
        <div
            aria-label="Agents"
            class={["rigged-mention-picker", props.class].filter(Boolean).join(" ")}
            data-rigged-ui="mention-picker"
            data-testid={props["data-testid"]}
            role="listbox"
            style={props.style}
        >
            <div class="rigged-mention-picker__header" data-rigged-ui="mention-picker-header">
                Agents
            </div>
            <Show
                when={filtered().length > 0}
                fallback={
                    <div class="rigged-mention-picker__empty" data-rigged-ui="mention-picker-empty">
                        No agents match “{props.query}”
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
    class?: string;
    contextItems?: ContextItem[];
    "data-testid"?: string;
    disabled?: boolean;
    /** e.g. "Enter to send · @ to hand off to an agent" */
    hint?: string;
    /** Called by the existing attachment toolbar action. */
    onAttachFile?: () => void;
    onContextRemove?: (id: string) => void;
    /** Called when a mention is inserted from the picker. */
    onMentionSelect?: (agent: MentionableAgent) => void;
    onSend: () => void;
    onValueChange: (value: string) => void;
    placeholder?: string;
    /** Overrides the text-only send check when attached context is sendable. */
    sendEnabled?: boolean;
    style?: JSX.CSSProperties;
    value: string;
};

const LINE_HEIGHT = 22;
const MAX_LINES = 8;

/**
 * Message composer: focus-within surface card with an auto-growing textarea
 * (1–8 lines), context chips, toolbar icon actions, a primary send control,
 * and an @-triggered MentionPicker popover with keyboard navigation.
 */
export function Composer(props: ComposerProps) {
    let textareaEl: HTMLTextAreaElement | undefined;
    const [mentionStart, setMentionStart] = createSignal<number | null>(null);
    const [mentionQuery, setMentionQuery] = createSignal("");
    const [activeIndex, setActiveIndex] = createSignal(0);

    const agents = () => props.agents ?? [];
    const filtered = () => filterAgents(agents(), mentionQuery());
    const mentionOpen = () => mentionStart() !== null && agents().length > 0;
    const activeAgent = () => {
        const list = filtered();
        if (list.length === 0) return undefined;
        return list[Math.min(activeIndex(), list.length - 1)];
    };
    const canSend = () => !props.disabled && (props.sendEnabled ?? props.value.trim().length > 0);

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
        queueMicrotask(() => {
            el.focus();
            el.setSelectionRange(nextCaret, nextCaret);
        });
    };

    const triggerMention = () => {
        const el = textareaEl;
        if (!el || props.disabled || agents().length === 0) return;
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
        queueMicrotask(() => el.setSelectionRange(nextCaret, nextCaret));
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
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            if (canSend()) props.onSend();
        }
    };

    const onInput = (event: InputEvent & { currentTarget: HTMLTextAreaElement }) => {
        props.onValueChange(event.currentTarget.value);
        detectMention(event.currentTarget);
    };

    return (
        <div
            class={["rigged-composer", props.class].filter(Boolean).join(" ")}
            data-disabled={props.disabled ? "" : undefined}
            data-rigged-ui="composer"
            data-testid={props["data-testid"]}
            style={props.style}
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
                    onFocusOut={closeMention}
                    onInput={onInput}
                    onKeyDown={onKeyDown}
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
                    <Button
                        aria-label="Add"
                        disabled={props.disabled}
                        icon="plus"
                        iconOnly
                        size="small"
                        variant="ghost"
                    />
                    <Button
                        aria-label="Mention an agent"
                        disabled={props.disabled}
                        icon="at"
                        iconOnly
                        onClick={triggerMention}
                        size="small"
                        variant="ghost"
                    />
                    <Button
                        aria-label="Add emoji"
                        disabled={props.disabled}
                        icon="smile"
                        iconOnly
                        size="small"
                        variant="ghost"
                    />
                    <Button
                        aria-label="Attach file"
                        disabled={props.disabled}
                        icon="paperclip"
                        iconOnly
                        onClick={() => props.onAttachFile?.()}
                        size="small"
                        variant="ghost"
                    />
                    <Button
                        aria-label="Record audio"
                        disabled={props.disabled}
                        icon="mic"
                        iconOnly
                        size="small"
                        variant="ghost"
                    />
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
                        onClick={() => canSend() && props.onSend()}
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
                        agents={agents()}
                        onSelect={selectMention}
                        query={mentionQuery()}
                    />
                </div>
            </Show>
        </div>
    );
}
