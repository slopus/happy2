import type { ChatSummary, DeepReadonly, DirectoryUserProjection } from "happy2-state";
import type { ChannelAccessView } from "./ChatInfoPanel.js";

export interface ChatChannelAccessProjectOptions {
    chat?: DeepReadonly<ChatSummary>;
    directoryUsers: readonly DeepReadonly<DirectoryUserProjection>[];
    parent?: DeepReadonly<ChatSummary>;
}

/**
 * Projects one channel's immutable public/private access contract for the
 * details panel. Attribution is deliberately resolved from directory users so
 * a public creator can never be presented as an owner; child parent context is
 * display-only and contains no membership history.
 */
export function chatChannelAccessProject(
    options: ChatChannelAccessProjectOptions,
): ChannelAccessView | undefined {
    const chat = options.chat;
    if (!chat || chat.kind === "dm") return undefined;
    const visibility = chat.kind === "public_channel" ? "public" : "private";
    const stewardId = chat.kind === "public_channel" ? chat.createdByUserId : chat.ownerUserId;
    const steward = stewardId
        ? options.directoryUsers.find((person) => person.id === stewardId)
        : undefined;
    const parent = chat.parentChatId ? options.parent : undefined;
    return {
        directoryListed: chat.isListed,
        visibility,
        ...(steward ? { steward: { name: steward.displayName } } : {}),
        ...(parent ? { inheritedFrom: parent.name ?? parent.slug ?? "Untitled channel" } : {}),
    };
}
