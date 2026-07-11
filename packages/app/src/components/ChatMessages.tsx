import { createEffect, For } from "solid-js";
import { AgentRunCard, type AgentRun } from "./AgentRunCard";
import { ApprovalRequestCard, type ApprovalRequest } from "./ApprovalRequestCard";
import { Avatar, type AvatarType } from "./Avatar";
import { ContextChips, type ContextItem } from "./ContextPicker";
import { DecisionCard, type Decision } from "./DecisionCard";
import { DelegationReceipt, type Delegation } from "./ExecutionScope";

export type MessageReaction = {
    count: number;
    emoji: string;
};

export type ChatMessage = {
    author: string;
    avatarClass: string;
    avatarType?: AvatarType;
    agentRun?: AgentRun;
    approvalRequest?: ApprovalRequest;
    body: string;
    context?: ContextItem[];
    decision?: Decision;
    delegation?: Delegation;
    id: string;
    initials: string;
    reactions?: MessageReaction[];
    replyCount?: number;
    time: string;
};

type ChatMessagesProps = {
    conversationName: string;
    description: string;
    introTitle: string;
    messages: ChatMessage[];
    attachedContextIds: string[];
    onUseContext: (context: ContextItem) => void;
    searchQuery: string;
};

function renderMessageBody(body: string) {
    return body
        .split(/(@[A-Za-z][\w-]*)/g)
        .map((part) =>
            part.startsWith("@") ? (
                <span class="rounded-[4px] bg-[#eee6f3] px-1 py-0.5 font-bold text-[#673b78]">
                    {part}
                </span>
            ) : (
                part
            ),
        );
}

export function ChatMessages(props: ChatMessagesProps) {
    let log!: HTMLDivElement;

    createEffect(() => {
        props.messages.length;
        queueMicrotask(() => {
            log.scrollTop = log.scrollHeight;
        });
    });

    return (
        <div
            class="min-h-0 flex-1 overflow-y-auto bg-white"
            ref={log}
            role="log"
            aria-label={`${props.conversationName} messages`}
            aria-live="polite"
        >
            <div class="flex min-h-full flex-col justify-end">
                <section class="px-6 pb-6 pt-12" aria-labelledby="conversation-intro-heading">
                    <h2
                        class="font-serif text-[2rem] font-semibold tracking-[-0.045em] text-[#2b2528]"
                        id="conversation-intro-heading"
                    >
                        {props.introTitle}
                    </h2>
                    <p class="mt-2 max-w-[720px] text-[0.82rem] leading-5 text-[#6f676d]">
                        {props.description}
                    </p>
                </section>

                <div class="relative my-2 flex items-center justify-center" aria-hidden="true">
                    <span class="absolute h-px w-full bg-[#e8e4e8]" />
                    <span class="relative rounded-full border border-[#ded9de] bg-white px-3 py-1 text-[0.64rem] font-bold text-[#5f575d] shadow-[0_1px_2px_rgb(36_25_34_/_4%)]">
                        Today
                    </span>
                </div>

                {props.searchQuery && (
                    <p
                        class="mx-5 my-3 rounded-lg border border-[#ded5e7] bg-[#faf7fc] px-3 py-2 text-[0.72rem] font-medium text-[#66556f]"
                        role="status"
                    >
                        Searching {props.conversationName} for “{props.searchQuery}”
                    </p>
                )}

                <div class="pb-3 pt-1">
                    {props.messages.length === 0 && (
                        <p class="px-6 py-8 text-center text-[0.76rem] text-[#918991]">
                            No messages here yet.
                        </p>
                    )}

                    <For each={props.messages}>
                        {(message) => (
                            <article
                                class="group flex gap-3 px-5 py-2.5 transition hover:bg-[#faf9fa]"
                                aria-label={`${message.author} at ${message.time}`}
                            >
                                <Avatar
                                    backgroundClass={message.avatarClass}
                                    initials={message.initials}
                                    size="sm"
                                    type={message.avatarType}
                                />
                                <div class="min-w-0 flex-1">
                                    <div class="flex items-baseline gap-2">
                                        <h3 class="truncate text-[0.78rem] font-extrabold text-[#2e292d]">
                                            {message.author}
                                        </h3>
                                        <time class="text-[0.61rem] font-medium text-[#9a9298]">
                                            {message.time}
                                        </time>
                                    </div>
                                    <p class="mt-0.5 whitespace-pre-wrap text-[0.75rem] leading-[1.35rem] text-[#514a4f]">
                                        {renderMessageBody(message.body)}
                                    </p>

                                    {message.context && message.context.length > 0 && (
                                        <div class="mt-2">
                                            <ContextChips
                                                items={message.context}
                                                label="Message context"
                                            />
                                        </div>
                                    )}

                                    {message.delegation && (
                                        <DelegationReceipt delegation={message.delegation} />
                                    )}

                                    {message.decision && (
                                        <DecisionCard
                                            decision={message.decision}
                                            attached={props.attachedContextIds.includes(
                                                message.decision.context.id,
                                            )}
                                            onAddContext={props.onUseContext}
                                        />
                                    )}

                                    {message.agentRun && <AgentRunCard run={message.agentRun} />}

                                    {message.approvalRequest && (
                                        <ApprovalRequestCard request={message.approvalRequest} />
                                    )}

                                    {(message.reactions || message.replyCount) && (
                                        <div class="mt-1.5 flex items-center gap-1.5">
                                            {message.reactions?.map((reaction) => (
                                                <button
                                                    class="flex h-6 items-center gap-1 rounded-full border border-[#dcd5df] bg-[#f8f5fa] px-2 text-[0.65rem] text-[#564c5d] transition hover:border-[#9b7bad] hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#6f4b92]"
                                                    type="button"
                                                    aria-label={`${reaction.emoji} reaction, ${reaction.count}`}
                                                >
                                                    <span>{reaction.emoji}</span>
                                                    <span class="font-bold">{reaction.count}</span>
                                                </button>
                                            ))}
                                            {message.replyCount && (
                                                <button
                                                    class="border-0 bg-transparent px-1 text-[0.66rem] font-bold text-[#76518a] hover:underline focus-visible:outline-2 focus-visible:outline-[#6f4b92]"
                                                    type="button"
                                                >
                                                    {message.replyCount}{" "}
                                                    {message.replyCount === 1 ? "reply" : "replies"}
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </article>
                        )}
                    </For>
                </div>
            </div>
        </div>
    );
}
