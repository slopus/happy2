import { type ChatSummary, CollaborationError, type SyncState } from "../chat/types.js";

import { type DrizzleExecutor } from "../drizzle.js";

import { and, asc, eq, gt, inArray, lte } from "drizzle-orm";

import { chatMembers, serverSyncState, syncEvents } from "../schema.js";

import { number } from "../chat/number.js";
import { optionalText } from "../chat/optionalText.js";

import { stateAt } from "./impl/stateAt.js";

import { text } from "../chat/text.js";
import { chatGetAccess } from "../chat/chatGetAccess.js";
import { chatCanAccess } from "../chat/chatCanAccess.js";
import { syncGetState } from "./syncGetState.js";
/**
 * Projects a global sync-event range into chats, removals, and product areas visible to one user.
 * Generation resets, retention bounds, paging, and current access checks are combined here so a client cannot retain revoked or invisible state.
 */
export async function syncGetDifference(
    executor: DrizzleExecutor,
    input: {
        userId: string;
        generation: string;
        fromSequence: number;
        untilSequence?: number;
        limit: number;
    },
): Promise<{
    kind: "empty" | "difference" | "slice" | "reset";
    changedChats: ChatSummary[];
    removedChatIds: string[];
    areas: string[];
    state: SyncState;
    targetState: SyncState;
}> {
    const current = await syncGetState(executor);
    if (input.generation !== current.generation) {
        return {
            kind: "reset",
            changedChats: [],
            removedChatIds: [],
            areas: ["all"],
            state: current,
            targetState: current,
        };
    }
    const currentSequence = number(current.sequence);
    const [retention] = await executor
        .select({
            minRecoverableSequence: serverSyncState.minRecoverableSequence,
        })
        .from(serverSyncState)
        .where(eq(serverSyncState.id, 1));
    if (input.fromSequence < (retention?.minRecoverableSequence ?? 0))
        return {
            kind: "reset",
            changedChats: [],
            removedChatIds: [],
            areas: ["all"],
            state: current,
            targetState: current,
        };
    if (input.untilSequence !== undefined && input.untilSequence > currentSequence)
        throw new CollaborationError("future_state", "Sync target is ahead of the server");
    const target = Math.min(input.untilSequence ?? currentSequence, currentSequence);
    if (input.fromSequence > currentSequence || target < input.fromSequence)
        throw new CollaborationError("future_state", "Sync cursor is ahead of the server");
    const page = await executor
        .selectDistinct({
            sequence: syncEvents.sequence,
        })
        .from(syncEvents)
        .where(and(gt(syncEvents.sequence, input.fromSequence), lte(syncEvents.sequence, target)))
        .orderBy(asc(syncEvents.sequence))
        .limit(input.limit + 1);
    const sequences = page.map((row) => row.sequence);
    const hasMore = sequences.length > input.limit;
    const included = sequences.slice(0, input.limit);
    const intermediate = hasMore ? included.at(-1)! : target;
    if (included.length === 0) {
        const state = stateAt(current.generation, target);
        return {
            kind: "empty",
            changedChats: [],
            removedChatIds: [],
            areas: [],
            state,
            targetState: state,
        };
    }
    const events = await executor
        .select({
            sequence: syncEvents.sequence,
            kind: syncEvents.kind,
            chat_id: syncEvents.chatId,
            target_user_id: syncEvents.targetUserId,
        })
        .from(syncEvents)
        .where(inArray(syncEvents.sequence, included))
        .orderBy(syncEvents.sequence, syncEvents.id);
    const changedChatIds = new Set<string>();
    const removedChatIds = new Set<string>();
    const areas = new Set<string>();
    for (const event of events) {
        const targetUserId = optionalText(event.target_user_id);
        const kind = text(event.kind);
        const chatId = optionalText(event.chat_id);
        if (targetUserId && targetUserId !== input.userId) continue;
        if (
            chatId &&
            targetUserId === input.userId &&
            (kind === "member.removed" || kind === "member.left")
        ) {
            if (!(await chatCanAccess(executor, input.userId, chatId))) removedChatIds.add(chatId);
            else changedChatIds.add(chatId);
            continue;
        }
        if (chatId && kind === "chat.deleted") {
            const [wasMember] = await executor
                .select({
                    userId: chatMembers.userId,
                })
                .from(chatMembers)
                .where(and(eq(chatMembers.chatId, chatId), eq(chatMembers.userId, input.userId)))
                .limit(1);
            if (wasMember) removedChatIds.add(chatId);
            continue;
        }
        if (chatId && kind === "chat.visibilityChanged") {
            if (await chatCanAccess(executor, input.userId, chatId)) changedChatIds.add(chatId);
            else removedChatIds.add(chatId);
            continue;
        }
        if (kind.startsWith("call.")) areas.add("calls");
        if (chatId && (await chatCanAccess(executor, input.userId, chatId))) {
            changedChatIds.add(chatId);
            continue;
        }
        if (kind.startsWith("preferences.")) areas.add("preferences");
        else if (kind.startsWith("notification.")) areas.add("notifications");
        else if (kind.startsWith("threadPreferences.")) areas.add("threads");
        else if (kind.startsWith("scheduled.")) areas.add("scheduled-messages");
        else if (kind.startsWith("automation.")) areas.add("automations");
        else if (kind.startsWith("bot.")) areas.add("bots");
        else if (kind.startsWith("integration.")) areas.add("integrations");
        else if (kind.startsWith("plugin.")) areas.add("plugins");
        else if (kind.startsWith("permissions.") || kind.startsWith("role."))
            areas.add("permissions");
        else if (kind.startsWith("presence.")) areas.add("presence");
        else if (kind.startsWith("user.")) areas.add("users");
        else if (kind.startsWith("emoji.")) areas.add("emoji");
        else if (kind.startsWith("server.")) areas.add("server");
        else if (kind.startsWith("agentImage.")) areas.add("agent-images");
        else if (kind.startsWith("agentSecret.")) areas.add("agent-secrets");
        else if (kind.startsWith("setup.")) areas.add("setup");
        else if (kind.startsWith("userOnboarding.")) areas.add("user-onboarding");
        else if (!chatId) areas.add("directories");
    }
    const changedChats: ChatSummary[] = [];
    for (const chatId of changedChatIds) {
        const chat = await chatGetAccess(executor, input.userId, chatId, false);
        if (chat) changedChats.push(chat);
    }
    const state = stateAt(current.generation, intermediate);
    const visibleChanges = changedChats.length + removedChatIds.size + areas.size;
    return {
        kind: hasMore ? "slice" : visibleChanges === 0 ? "empty" : "difference",
        changedChats,
        removedChatIds: [...removedChatIds],
        areas: [...areas],
        state,
        targetState: stateAt(current.generation, target),
    };
}
