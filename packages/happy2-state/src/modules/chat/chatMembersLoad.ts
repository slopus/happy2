import type { PresenceSnapshot } from "../../types.js";
import type { IdentityCatalog } from "../identity/identityCatalog.js";
import type { StateRuntime } from "../runtime/stateRuntime.js";
import { userError } from "../runtime/stateRuntime.js";
import type { ChatStoreBinding } from "./chatStore.js";
import type { ChatMemberProjection } from "./chatTypes.js";

export interface ChatMembersLoadContext {
    readonly runtime: StateRuntime;
    readonly identities: IdentityCatalog;
    chatGet(chatId: string): ChatStoreBinding | undefined;
    presenceGet(userId: string): PresenceSnapshot | undefined;
}

/** Loads members only for a retained member panel on an existing chat surface. */
export async function chatMembersLoad(
    context: ChatMembersLoadContext,
    chatId: string,
): Promise<void> {
    if (!context.chatGet(chatId) || !context.runtime.connected) return;
    try {
        const result = await context.runtime.operation("getChatMembers", { chatId });
        const chat = context.chatGet(chatId)?.store.get().status;
        const ownerUserId = chat?.type === "ready" ? chat.value.ownerUserId : undefined;
        const members = result.users.map((user): ChatMemberProjection => {
            const identity = context.identities.project(user);
            return {
                ...identity,
                role:
                    user.id === ownerUserId ? "owner" : user.role === "admin" ? "admin" : "member",
                ...(user.systemRole ? { systemRole: user.systemRole } : {}),
                ...(user.title ? { title: user.title } : {}),
                presence: context.presenceGet(user.id)?.status ?? "offline",
            };
        });
        context.chatGet(chatId)?.chatInput({ type: "membersLoaded", members });
    } catch (error) {
        context.chatGet(chatId)?.chatInput({ type: "membersFailed", error: userError(error) });
    }
}
