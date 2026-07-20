import {
    type ChatSummary,
    type CreateAgentInput,
    type CreateChannelInput,
    type CreateChildChannelInput,
} from "../../types.js";
import { type ChatStore } from "../chat/chatState.js";
import { type StateRuntime, userError } from "../runtime/runtimeState.js";
import { type SidebarChatProjection, type SidebarStore } from "../sidebar/sidebarState.js";

/** Creates an agent conversation idempotently and publishes its authoritative summary. */
export async function agentCreate(
    context: ChatActionContext,
    input: CreateAgentInput,
): Promise<void> {
    const result = await context.runtime.operation("createAgent", input);
    await chatResultApply(context, result.chat);
}

/** Opens a fresh direct conversation with an existing agent. */
export async function agentConversationCreate(
    context: ChatActionContext,
    agentUserId: string,
): Promise<ChatSummary> {
    const result = await context.runtime.operation("createAgentConversation", { agentUserId });
    await chatResultApply(context, result.chat);
    return result.chat;
}

/** Changes one agent binding's durable chat-specific reasoning effort and reconciles the retained chat control. */
export async function agentEffortChange(
    context: ChatActionContext,
    chatId: string,
    agentUserId: string,
    effort: string,
): Promise<void> {
    try {
        const value = await context.runtime.operation("changeAgentEffort", {
            chatId,
            agentUserId,
            effort,
        });
        context.chatGet(chatId)?.getState().chatInput({ type: "agentEffortLoaded", value });
    } catch (error) {
        context
            .chatGet(chatId)
            ?.getState()
            .chatInput({
                type: "agentEffortFailed",
                agentUserId,
                error: userError(error),
            });
    }
}

/** Loads effort controls only for an already retained chat and requested agent. */
export async function agentEffortLoad(
    context: ChatActionContext,
    chatId: string,
    agentUserId: string,
): Promise<void> {
    try {
        const value = await context.runtime.operation("getAgentEffort", { chatId, agentUserId });
        context.chatGet(chatId)?.getState().chatInput({ type: "agentEffortLoaded", value });
    } catch (error) {
        context
            .chatGet(chatId)
            ?.getState()
            .chatInput({
                type: "agentEffortFailed",
                agentUserId,
                error: userError(error),
            });
    }
}

/** Creates a channel with one idempotency key and publishes its authoritative sidebar summary. */
export async function channelCreate(
    context: ChatActionContext,
    input: CreateChannelInput,
): Promise<void> {
    const result = await context.runtime.operation("createChannel", input);
    await chatResultApply(context, result.chat);
}

/**
 * Creates one child channel under `parentChatId` with a single idempotency key and
 * publishes the authoritative child summary into the sidebar. The child inherits its
 * parent's members and container while keeping an independent history; siblings and
 * the parent's own archive cascade reconcile separately through the difference stream.
 */
export async function channelCreateChild(
    context: ChatActionContext,
    input: CreateChildChannelInput,
): Promise<void> {
    const { parentChatId, ...rest } = input;
    const result = await context.runtime.operation("createChildChannel", {
        chatId: parentChatId,
        ...rest,
    });
    await chatResultApply(context, result.chat);
}

/**
 * Archives one channel and reconciles its authoritative summary across retained surfaces.
 * A parent archive cascades to its children on the server; those child summaries arrive
 * independently through the difference stream, so this action only applies the target's result.
 */
export async function channelArchive(context: ChatActionContext, chatId: string): Promise<void> {
    const result = await context.runtime.operation("archiveChannel", { chatId });
    await chatResultApply(context, result.chat);
}

/** Restores one archived channel and reconciles its authoritative summary across retained surfaces. */
export async function channelUnarchive(context: ChatActionContext, chatId: string): Promise<void> {
    const result = await context.runtime.operation("unarchiveChannel", { chatId });
    await chatResultApply(context, result.chat);
}

export interface ChannelUpdateInput {
    readonly name?: string;
    readonly slug?: string;
    readonly topic?: string | null;
    readonly kind?: "public_channel" | "private_channel";
    readonly photoFileId?: string | null;
    readonly isListed?: boolean;
    readonly autoJoin?: boolean;
}

/** Replaces the channel's default agent durably and reconciles the authoritative summary across retained surfaces. */
export async function channelDefaultAgentUpdate(
    context: ChatActionContext,
    chatId: string,
    agentUserId: string,
): Promise<void> {
    const result = await context.runtime.operation("updateDefaultAgent", { chatId, agentUserId });
    await chatResultApply(context, result.chat);
}

/** Updates explicit channel fields and reconciles the same authoritative summary across retained surfaces. */
export async function channelUpdate(
    context: ChatActionContext,
    chatId: string,
    input: ChannelUpdateInput,
): Promise<void> {
    const result = await context.runtime.operation("updateChannel", { chatId, ...input });
    await chatResultApply(context, result.chat);
}

export interface ChatActionContext {
    readonly runtime: StateRuntime;
    readonly sidebar: SidebarStore;
    chatGet(chatId: string): ChatStore | undefined;
    sidebarChatProject(chat: ChatSummary): Promise<SidebarChatProjection | undefined>;
}

export async function chatResultApply(
    context: ChatActionContext,
    chat: ChatSummary,
): Promise<void> {
    const projection = await context.sidebarChatProject(chat);
    if (projection)
        context.sidebar.getState().sidebarInput({
            type: "chatSummaryUpserted",
            chat: projection,
        });
    context.chatGet(chat.id)?.getState().chatInput({ type: "chatSummaryReconciled", chat });
}

/** Joins a discoverable chat and inserts its authoritative summary into the sidebar surface. */
export async function chatJoin(context: ChatActionContext, chatId: string): Promise<void> {
    const result = await context.runtime.operation("joinChat", { chatId });
    await chatResultApply(context, result.chat);
}

/** Leaves a chat durably and removes its sidebar projection without constructing another store. */
export async function chatLeave(context: ChatActionContext, chatId: string): Promise<void> {
    await context.runtime.operation("leaveChat", { chatId });
    context.sidebar.getState().sidebarInput({ type: "chatSummaryRemoved", chatId });
}

/** Marks a chat read through a displayably fallible awaited action and reconciles retained surfaces. */
export async function chatReadMark(
    context: ChatActionContext,
    chatId: string,
    messageId?: string,
): Promise<void> {
    const result = await context.runtime.operation("markChatRead", { chatId, messageId });
    await chatResultApply(context, result.chat);
}

/** Changes sidebar starring durably and replaces only that chat summary in retained surfaces. */
export async function chatStarSet(
    context: ChatActionContext,
    chatId: string,
    starred: boolean,
): Promise<void> {
    const result = await context.runtime.operation("setChatStar", { chatId, starred });
    await chatResultApply(context, result.chat);
}

/** Creates or resolves one direct conversation and publishes its authoritative sidebar summary. */
export async function directMessageCreate(
    context: ChatActionContext,
    userId: string,
): Promise<void> {
    const result = await context.runtime.operation("createDirectMessage", { userId });
    await chatResultApply(context, result.chat);
}

/** Creates one group conversation and publishes its authoritative sidebar summary. */
export async function groupDirectMessageCreate(
    context: ChatActionContext,
    userIds: readonly string[],
    name?: string,
): Promise<void> {
    const result = await context.runtime.operation("createGroupDirectMessage", { userIds, name });
    await chatResultApply(context, result.chat);
}

/** Sends ephemeral typing intent in the background; realtime expiry remains the display authority. */
export function typingSet(context: ChatActionContext, chatId: string, active: boolean): void {
    if (!context.runtime.connected || !context.runtime.active) return;
    context.runtime.background(
        context.runtime.operation("setTyping", { chatId, active }).then(() => undefined),
    );
}
