import { AgentMentionPicker, type MentionableAgent } from "./AgentMentionPicker";
import { ContextChips, ContextPicker, type ContextItem } from "./ContextPicker";
import { createSignal } from "solid-js";
import {
    createDelegation,
    DelegationBar,
    type Delegation,
    type ExecutionMode,
    ExecutionScopePicker,
} from "./ExecutionScope";

type ComposerTool =
    | "add"
    | "bold"
    | "code"
    | "emoji"
    | "italic"
    | "link"
    | "list"
    | "mention"
    | "record"
    | "send";

type ChatComposerProps = {
    agents: MentionableAgent[];
    attachedContext: ContextItem[];
    availableContext: ContextItem[];
    conversationLabel: string;
    onContextChange: (items: ContextItem[]) => void;
    onSend: (delegation?: Delegation) => void;
    onValueChange: (value: string) => void;
    value: string;
};

function ComposerIcon(props: { name: ComposerTool }) {
    const iconClass = "h-4 w-4 fill-none stroke-current stroke-[1.8]";

    if (props.name === "bold") return <span class="font-serif text-[0.88rem] font-black">B</span>;
    if (props.name === "italic")
        return <span class="font-serif text-[0.9rem] font-bold italic">I</span>;
    if (props.name === "emoji") return <span class="text-[0.9rem] leading-none">☺</span>;
    if (props.name === "mention")
        return <span class="text-[0.82rem] font-black leading-none">@</span>;

    const paths: Record<Exclude<ComposerTool, "bold" | "emoji" | "italic" | "mention">, string> = {
        add: "M12 5v14M5 12h14",
        code: "m9 7-5 5 5 5M15 7l5 5-5 5",
        link: "M10 13a4 4 0 0 0 5.7.1l2-2a4 4 0 0 0-5.7-5.7l-1.1 1.1M14 11a4 4 0 0 0-5.7-.1l-2 2a4 4 0 0 0 5.7 5.7l1.1-1.1",
        list: "M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",
        record: "M15 10.5 20 8v8l-5-2.5v2A1.5 1.5 0 0 1 13.5 17h-8A1.5 1.5 0 0 1 4 15.5v-7A1.5 1.5 0 0 1 5.5 7h8A1.5 1.5 0 0 1 15 8.5v2Z",
        send: "m4 4 16 8-16 8 3-8-3-8Zm3 8h13",
    };

    return (
        <svg class={iconClass} viewBox="0 0 24 24" aria-hidden="true">
            <path d={paths[props.name]} stroke-linecap="round" stroke-linejoin="round" />
        </svg>
    );
}

function ToolButton(props: { label: string; name: ComposerTool; onClick?: () => void }) {
    return (
        <button
            class="grid h-7 w-7 place-items-center rounded-md border-0 bg-transparent p-0 text-[#716970] transition hover:bg-[#ece8ec] hover:text-[#322c31] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#6f4b92]"
            type="button"
            aria-label={props.label}
            onClick={props.onClick}
        >
            <ComposerIcon name={props.name} />
        </button>
    );
}

export function ChatComposer(props: ChatComposerProps) {
    const [contextPickerOpen, setContextPickerOpen] = createSignal(false);
    const [scopePickerOpen, setScopePickerOpen] = createSignal(false);
    const [executionMode, setExecutionMode] = createSignal<ExecutionMode>("verify");
    let textarea: HTMLTextAreaElement | undefined;
    const mentionMatch = () => props.value.match(/(?:^|\s)@([A-Za-z-]*)$/);
    const mentionQuery = () => mentionMatch()?.[1] ?? "";
    const matchingAgents = () =>
        props.agents.filter((agent) =>
            agent.name.toLowerCase().includes(mentionQuery().toLowerCase()),
        );
    const mentionMenuOpen = () => mentionMatch() !== null;
    const mentionedAgent = () =>
        props.agents.find((agent) => new RegExp(`@${agent.name}\\b`, "i").test(props.value));
    const selectAgent = (agent: MentionableAgent) => {
        const mentionStart = props.value.lastIndexOf("@");
        const prefix =
            mentionStart >= 0
                ? props.value.slice(0, mentionStart)
                : `${props.value}${props.value ? " " : ""}`;
        props.onValueChange(`${prefix}@${agent.name} `);
        setContextPickerOpen(false);
        setScopePickerOpen(false);
        queueMicrotask(() => textarea?.focus());
    };
    const openMentionMenu = () => {
        setContextPickerOpen(false);
        setScopePickerOpen(false);
        if (!mentionMenuOpen()) {
            props.onValueChange(
                `${props.value}${props.value && !props.value.endsWith(" ") ? " " : ""}@`,
            );
        }
        queueMicrotask(() => textarea?.focus());
    };
    const send = () => {
        if (!props.value.trim()) return;
        const agent = mentionedAgent();
        props.onSend(agent ? createDelegation(agent, executionMode()) : undefined);
        setScopePickerOpen(false);
        setExecutionMode("verify");
    };
    const toggleContext = (item: ContextItem) => {
        const isAttached = props.attachedContext.some(
            (attachedItem) => attachedItem.id === item.id,
        );
        props.onContextChange(
            isAttached
                ? props.attachedContext.filter((attachedItem) => attachedItem.id !== item.id)
                : [...props.attachedContext, item],
        );
    };

    return (
        <div class="relative mx-5 mb-4 shrink-0">
            {mentionMenuOpen() && !contextPickerOpen() && !scopePickerOpen() && (
                <AgentMentionPicker
                    agents={props.agents}
                    query={mentionQuery()}
                    onSelect={selectAgent}
                />
            )}
            {contextPickerOpen() && (
                <ContextPicker
                    items={props.availableContext}
                    selectedItems={props.attachedContext}
                    onToggle={toggleContext}
                    onDone={() => setContextPickerOpen(false)}
                />
            )}
            {scopePickerOpen() && mentionedAgent() && (
                <ExecutionScopePicker
                    selectedMode={executionMode()}
                    onSelect={setExecutionMode}
                    onDone={() => setScopePickerOpen(false)}
                />
            )}

            <form
                class="overflow-hidden rounded-[10px] border border-[#cfc9cf] bg-white shadow-[0_2px_7px_rgb(40_27_38_/_7%)] focus-within:border-[#8c728f] focus-within:ring-2 focus-within:ring-[#8c728f]/10"
                onSubmit={(event) => {
                    event.preventDefault();
                    send();
                }}
            >
                <div class="flex h-9 items-center gap-0.5 border-b border-[#ece8ec] bg-[#faf9fa] px-2">
                    <ToolButton label="Bold" name="bold" />
                    <ToolButton label="Italic" name="italic" />
                    <ToolButton label="Insert link" name="link" />
                    <span class="mx-1 h-4 w-px bg-[#ddd8dd]" aria-hidden="true" />
                    <ToolButton label="Bulleted list" name="list" />
                    <ToolButton label="Inline code" name="code" />
                </div>

                {props.attachedContext.length > 0 && (
                    <div class="border-b border-[#ece8ec] bg-[#fcfbfc] px-3 py-2">
                        <ContextChips
                            items={props.attachedContext}
                            label="Attached context"
                            onRemove={(item) =>
                                props.onContextChange(
                                    props.attachedContext.filter(
                                        (attachedItem) => attachedItem.id !== item.id,
                                    ),
                                )
                            }
                        />
                    </div>
                )}

                {mentionedAgent() && (
                    <DelegationBar
                        agent={mentionedAgent()!}
                        mode={executionMode()}
                        onOpen={() => {
                            setContextPickerOpen(false);
                            setScopePickerOpen(true);
                        }}
                    />
                )}

                <textarea
                    ref={(element) => {
                        textarea = element;
                    }}
                    class="block min-h-[58px] w-full resize-none border-0 bg-white px-3 py-2.5 text-[0.78rem] leading-5 text-[#342e33] outline-0 placeholder:text-[#938b91]"
                    aria-label={`Message ${props.conversationLabel}`}
                    placeholder={`Message ${props.conversationLabel}`}
                    rows="2"
                    value={props.value}
                    aria-controls={mentionMenuOpen() ? "agent-mention-picker" : undefined}
                    aria-expanded={mentionMenuOpen()}
                    onInput={(event) => props.onValueChange(event.currentTarget.value)}
                    onKeyDown={(event) => {
                        if (mentionMenuOpen() && event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            const firstAgent = matchingAgents()[0];
                            if (firstAgent) selectAgent(firstAgent);
                            return;
                        }
                        if (mentionMenuOpen() && event.key === "Escape") {
                            event.preventDefault();
                            props.onValueChange(props.value.slice(0, props.value.lastIndexOf("@")));
                            return;
                        }
                        if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            send();
                        }
                    }}
                />

                <div class="flex h-9 items-center gap-0.5 px-2">
                    <ToolButton
                        label="Add context"
                        name="add"
                        onClick={() => {
                            setScopePickerOpen(false);
                            setContextPickerOpen((current) => !current);
                        }}
                    />
                    <ToolButton label="Add emoji" name="emoji" />
                    <ToolButton label="Mention an agent" name="mention" onClick={openMentionMenu} />
                    <ToolButton label="Record a clip" name="record" />
                    <button
                        class="ml-auto grid h-7 w-9 place-items-center rounded-md border-0 bg-[#6f3f76] p-0 text-white transition enabled:hover:bg-[#5d3164] disabled:bg-[#ded9df] disabled:text-[#a69fa4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6f4b92]"
                        type="submit"
                        aria-label="Send message"
                        disabled={!props.value.trim()}
                    >
                        <ComposerIcon name="send" />
                    </button>
                </div>
            </form>
        </div>
    );
}
