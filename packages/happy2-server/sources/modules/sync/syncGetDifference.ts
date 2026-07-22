import { type ChatSummary, CollaborationError, type SyncState } from "../chat/types.js";

import { type DrizzleExecutor } from "../drizzle.js";

import { and, asc, eq, gt, inArray, isNull, lte } from "drizzle-orm";

import { chatMembers, chats, serverSyncState, syncEvents } from "../schema.js";

import { number } from "../chat/number.js";
import { optionalText } from "../chat/optionalText.js";

import { stateAt } from "./impl/stateAt.js";

import { text } from "../chat/text.js";
import { chatGetAccess } from "../chat/chatGetAccess.js";
import { chatCanAccess } from "../chat/chatCanAccess.js";
import { chatCanSync } from "../chat/chatCanSync.js";
import { syncGetState } from "./syncGetState.js";
import { userIsServerAdmin } from "../chat/userIsServerAdmin.js";
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
            areas.add("projects");
            removedChatIds.add(chatId);
            changedChatIds.delete(chatId);
            continue;
        }
        if (chatId && targetUserId === input.userId && kind === "member.joined") {
            areas.add("projects");
            removedChatIds.delete(chatId);
            if (await chatCanSync(executor, input.userId, chatId)) changedChatIds.add(chatId);
            continue;
        }
        if (chatId && kind === "chat.created") {
            const [createdChat] = await executor
                .select({
                    kind: chats.kind,
                    projectId: chats.projectId,
                    isListed: chats.isListed,
                    parentChatId: chats.parentChatId,
                    memberUserId: chatMembers.userId,
                })
                .from(chats)
                .leftJoin(
                    chatMembers,
                    and(
                        eq(chatMembers.chatId, chats.id),
                        eq(chatMembers.userId, input.userId),
                        isNull(chatMembers.leftAt),
                    ),
                )
                .where(eq(chats.id, chatId))
                .limit(1);
            const appearsInProjectDirectory =
                typeof createdChat?.projectId === "string" &&
                ((createdChat.kind === "public_channel" && createdChat.isListed === 1) ||
                    typeof createdChat.memberUserId === "string" ||
                    (createdChat.kind === "private_channel" &&
                        createdChat.parentChatId === null &&
                        (await userIsServerAdmin(executor, input.userId))));
            if (appearsInProjectDirectory) areas.add("projects");
        }
        if (chatId && kind === "chat.deleted") {
            const [deletedChat] = await executor
                .select({
                    kind: chats.kind,
                    projectId: chats.projectId,
                    isListed: chats.isListed,
                    parentChatId: chats.parentChatId,
                    memberUserId: chatMembers.userId,
                })
                .from(chats)
                .leftJoin(
                    chatMembers,
                    and(eq(chatMembers.chatId, chats.id), eq(chatMembers.userId, input.userId)),
                )
                .where(eq(chats.id, chatId))
                .limit(1);
            const wasVisible =
                typeof deletedChat?.projectId === "string" &&
                (typeof deletedChat.memberUserId === "string" ||
                    (deletedChat.kind === "public_channel" && deletedChat.isListed === 1) ||
                    (deletedChat.kind === "private_channel" &&
                        deletedChat.parentChatId === null &&
                        (await userIsServerAdmin(executor, input.userId))));
            if (wasVisible) {
                areas.add("projects");
                removedChatIds.add(chatId);
            }
            continue;
        }
        if (chatId && kind === "chat.visibilityChanged") {
            areas.add("projects");
            if (await chatCanSync(executor, input.userId, chatId)) {
                removedChatIds.delete(chatId);
                changedChatIds.add(chatId);
            } else {
                changedChatIds.delete(chatId);
                removedChatIds.add(chatId);
            }
            continue;
        }
        if (kind === "plugin.uninstalled") {
            areas.add("plugins");
            areas.add("apps");
            areas.add("contributions");
            continue;
        }
        const surfaceAreas = new Set<string>();
        if (
            kind.startsWith("plugin.app_instance_") ||
            kind.startsWith("plugin.app_preference_") ||
            kind.startsWith("app.")
        )
            surfaceAreas.add("apps");
        if (kind.startsWith("plugin.ui_assets_")) {
            surfaceAreas.add("apps");
            surfaceAreas.add("contributions");
        }
        if (kind.startsWith("plugin.contribution_") || kind.startsWith("contribution."))
            surfaceAreas.add("contributions");
        if (surfaceAreas.size) {
            if (!chatId || (await chatCanAccess(executor, input.userId, chatId)))
                for (const area of surfaceAreas) areas.add(area);
            continue;
        }
        if (kind.startsWith("call.")) areas.add("calls");
        if (chatId && (await chatCanSync(executor, input.userId, chatId))) {
            if (!removedChatIds.has(chatId)) changedChatIds.add(chatId);
            continue;
        }
        if (kind.startsWith("preferences.")) areas.add("preferences");
        else if (kind.startsWith("notification.")) areas.add("notifications");
        else if (kind.startsWith("scheduled.")) areas.add("scheduled-messages");
        else if (kind.startsWith("draft.")) areas.add("drafts");
        else if (kind.startsWith("document.")) areas.add("documents");
        else if (kind.startsWith("automation.")) areas.add("automations");
        else if (kind.startsWith("bot.")) areas.add("bots");
        else if (kind.startsWith("integration.")) areas.add("integrations");
        else if (kind.startsWith("plugin.")) areas.add("plugins");
        else if (kind.startsWith("permissions.") || kind.startsWith("role.")) {
            areas.add("permissions");
            if (targetUserId === input.userId) areas.add("projects");
        } else if (kind.startsWith("presence.")) areas.add("presence");
        else if (kind.startsWith("user.")) areas.add("users");
        else if (kind.startsWith("emoji.")) areas.add("emoji");
        else if (kind.startsWith("project.")) areas.add("projects");
        else if (kind.startsWith("server.")) areas.add("server");
        else if (kind.startsWith("agentImage.")) areas.add("agent-images");
        else if (kind.startsWith("agentSecret.")) areas.add("agent-secrets");
        else if (kind.startsWith("setup.")) areas.add("setup");
        else if (kind.startsWith("userOnboarding.")) areas.add("user-onboarding");
        else if (!chatId) areas.add("directories");
    }
    const changedChats: ChatSummary[] = [];
    for (const chatId of changedChatIds) {
        if (!(await chatCanSync(executor, input.userId, chatId))) continue;
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
